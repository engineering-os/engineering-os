import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', 'vendor', '__pycache__', '.eos', '.turbo', 'target',
]);

const MAX_FILE_SIZE = 512 * 1024;
const MAX_GRAPHQL_FILE_SIZE = 2 * 1024 * 1024; // GraphQL schema files can be large (supergraphs)

export interface GraphQLOperation {
  type: 'query' | 'mutation' | 'subscription';
  name: string;
  file: string;
  line: number;
  ownerService?: string;
  args?: string;
  returnType?: string;
}

export interface GraphQLSubgraph {
  name: string;
  url: string;
}

export interface GraphQLSchema {
  operations: GraphQLOperation[];
  subgraphs: GraphQLSubgraph[];
  file: string;
}

export class GraphQLParser {
  constructor(private rootPath: string) {}

  parse(): GraphQLSchema[] {
    const schemas: GraphQLSchema[] = [];
    const files = this.collectFiles(this.rootPath).slice(0, 50); // Cap at 50 files

    for (const filePath of files) {
      const content = this.readSafe(filePath);
      if (!content) continue;

      const relativePath = path.relative(this.rootPath, filePath);
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.graphql' || ext === '.gql') {
        const schema = this.parseSchemaFile(content, relativePath);
        if (schema.operations.length > 0 || schema.subgraphs.length > 0) {
          schemas.push(schema);
        }
      } else if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
        const schema = this.parseCodeFile(content, relativePath);
        if (schema.operations.length > 0) {
          schemas.push(schema);
        }
      }
    }

    return schemas;
  }

  private parseSchemaFile(content: string, file: string): GraphQLSchema {
    const subgraphs = this.extractSubgraphs(content);
    const operations: GraphQLOperation[] = [];

    // Only extract operations from small schema files (< 5KB)
    // Larger schemas (supergraphs, federated schemas) are parsed only for subgraph topology
    if (content.length < 5 * 1024) {
      const serviceEnumMap = this.buildServiceEnumMap(content);
      this.extractOperationsFromBlocks(content, file, serviceEnumMap, operations);
    }

    return { operations, subgraphs, file };
  }

  private parseCodeFile(content: string, file: string): GraphQLSchema {
    const operations: GraphQLOperation[] = [];

    this.extractFromGqlTemplateLiterals(content, file, operations);
    this.extractFromNestJsDecorators(content, file, operations);

    return { operations, subgraphs: [], file };
  }

  /**
   * Extract @join__graph directives to build the subgraph service list.
   * Pattern: @join__graph(name: "service-name", url: "http://...")
   */
  private extractSubgraphs(content: string): GraphQLSubgraph[] {
    const subgraphs: GraphQLSubgraph[] = [];
    const joinGraphRegex = /@join__graph\s*\(\s*name\s*:\s*"([^"]+)"\s*,\s*url\s*:\s*"([^"]+)"\s*\)/g;

    let match: RegExpExecArray | null;
    while ((match = joinGraphRegex.exec(content)) !== null) {
      subgraphs.push({ name: match[1], url: match[2] });
    }

    // Also handle reversed parameter order: url first, name second
    const reversedRegex = /@join__graph\s*\(\s*url\s*:\s*"([^"]+)"\s*,\s*name\s*:\s*"([^"]+)"\s*\)/g;
    while ((match = reversedRegex.exec(content)) !== null) {
      subgraphs.push({ name: match[2], url: match[1] });
    }

    return subgraphs;
  }

  /**
   * Build a mapping from federation enum values to service names.
   * In Apollo Federation supergraphs, services are represented as enum values:
   *   enum join__Graph { USERS @join__graph(name: "users", url: "...") }
   * The enum key (e.g., USERS) is used in @join__field(graph: USERS).
   */
  private buildServiceEnumMap(content: string): Map<string, string> {
    const enumMap = new Map<string, string>();

    const enumBlockRegex = /enum\s+join__Graph\s*\{([^}]+)\}/s;
    const enumMatch = content.match(enumBlockRegex);
    if (!enumMatch) return enumMap;

    const enumBody = enumMatch[1];
    const entryRegex = /(\w+)\s+@join__graph\s*\(\s*name\s*:\s*"([^"]+)"/g;

    let match: RegExpExecArray | null;
    while ((match = entryRegex.exec(enumBody)) !== null) {
      enumMap.set(match[1], match[2]);
    }

    return enumMap;
  }

  /**
   * Extract operations from type Query/Mutation/Subscription blocks.
   * Handles both standard schemas and Apollo Federation with @join__field.
   */
  private extractOperationsFromBlocks(
    content: string,
    file: string,
    serviceEnumMap: Map<string, string>,
    operations: GraphQLOperation[]
  ): void {
    const lines = content.split('\n');
    const typeBlockRegex = /^(\s*)type\s+(Query|Mutation|Subscription)\s*(?:@[^\{]*?)?\{/;

    let i = 0;
    while (i < lines.length) {
      const blockMatch = lines[i].match(typeBlockRegex);
      if (!blockMatch) {
        i++;
        continue;
      }

      const operationType = blockMatch[2].toLowerCase() as 'query' | 'mutation' | 'subscription';
      const blockStartLine = i;
      i++;

      // Track brace depth to handle nested types
      let braceDepth = 1;
      while (i < lines.length && braceDepth > 0) {
        const line = lines[i];

        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }

        if (braceDepth <= 0) {
          i++;
          break;
        }

        if (operations.length < 200) {
          const fieldParsed = this.parseFieldLine(line, operationType, file, i + 1, serviceEnumMap);
          if (fieldParsed) {
            operations.push(fieldParsed);
          }
        }

        i++;
      }
    }
  }

  /**
   * Parse a single field line from a Query/Mutation/Subscription block.
   * Handles patterns like:
   *   users(limit: Int): [User] @join__field(graph: USERS)
   *   createUser(input: CreateUserInput!): User
   */
  private parseFieldLine(
    line: string,
    operationType: 'query' | 'mutation' | 'subscription',
    file: string,
    lineNumber: number,
    serviceEnumMap: Map<string, string>
  ): GraphQLOperation | null {
    const trimmed = line.trim();

    // Skip comments, empty lines, directives-only lines, and closing braces
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('}') || trimmed.startsWith('"')) {
      return null;
    }

    // Match field pattern: fieldName(args): ReturnType @directives
    const fieldRegex = /^(\w+)\s*(\([^)]*\))?\s*:\s*([^\s@#]+(?:\s*[^\s@#]+)?)\s*(.*)?$/;
    const match = trimmed.match(fieldRegex);
    if (!match) return null;

    const name = match[1];
    const args = match[2] || undefined;
    const returnType = this.cleanReturnType(match[3]);
    const directives = match[4] || '';

    // Extract owner service from @join__field(graph: SERVICE_ENUM)
    let ownerService: string | undefined;
    const joinFieldMatch = directives.match(/@join__field\s*\(\s*(?:[^)]*?\s+)?graph\s*:\s*(\w+)/);
    if (joinFieldMatch) {
      const enumKey = joinFieldMatch[1];
      ownerService = serviceEnumMap.get(enumKey) || enumKey.toLowerCase();
    }

    return {
      type: operationType,
      name,
      file,
      line: lineNumber,
      ownerService,
      args: args ? args.trim() : undefined,
      returnType,
    };
  }

  /**
   * Extract operations from gql`` template literals in code files.
   * Handles: const typeDefs = gql`...`, gql(`...`), /* GraphQL * / `...`
   */
  private extractFromGqlTemplateLiterals(
    content: string,
    file: string,
    operations: GraphQLOperation[]
  ): void {
    const lines = content.split('\n');

    // Find gql template literal starts
    const gqlStartRegex = /(?:gql|graphql)\s*`/;
    const taggedRegex = /\/\*\s*GraphQL\s*\*\/\s*`/;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const gqlMatch = line.match(gqlStartRegex) || line.match(taggedRegex);

      if (!gqlMatch) {
        i++;
        continue;
      }

      // Collect the template literal content
      const startLine = i;
      let templateContent = '';
      let foundEnd = false;

      // Check if backtick close is on same line
      const afterMatch = line.substring(line.indexOf('`') + 1);
      const closeIndex = afterMatch.indexOf('`');
      if (closeIndex >= 0) {
        templateContent = afterMatch.substring(0, closeIndex);
        foundEnd = true;
      } else {
        templateContent = afterMatch + '\n';
        i++;

        while (i < lines.length) {
          const currentLine = lines[i];
          const endIndex = currentLine.indexOf('`');
          if (endIndex >= 0) {
            templateContent += currentLine.substring(0, endIndex);
            foundEnd = true;
            i++;
            break;
          }
          templateContent += currentLine + '\n';
          i++;
        }
      }

      if (foundEnd && templateContent.trim()) {
        const templateLines = templateContent.split('\n');
        this.extractOperationsFromTemplateLines(templateLines, file, startLine + 1, operations);
      }

      if (!foundEnd) i++;
    }
  }

  /**
   * Parse operations from lines extracted from a gql template literal.
   */
  private extractOperationsFromTemplateLines(
    templateLines: string[],
    file: string,
    baseLineOffset: number,
    operations: GraphQLOperation[]
  ): void {
    const serviceEnumMap = new Map<string, string>();

    let i = 0;
    while (i < templateLines.length) {
      const line = templateLines[i];
      const blockMatch = line.match(/type\s+(Query|Mutation|Subscription)\s*(?:@[^\{]*?)?\{/);

      if (!blockMatch) {
        i++;
        continue;
      }

      const operationType = blockMatch[1].toLowerCase() as 'query' | 'mutation' | 'subscription';
      i++;

      let braceDepth = 1;
      while (i < templateLines.length && braceDepth > 0) {
        const fieldLine = templateLines[i];

        for (const ch of fieldLine) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }

        if (braceDepth <= 0) {
          i++;
          break;
        }

        const parsed = this.parseFieldLine(
          fieldLine,
          operationType,
          file,
          baseLineOffset + i,
          serviceEnumMap
        );
        if (parsed) {
          operations.push(parsed);
        }

        i++;
      }
    }
  }

  /**
   * Extract operations from NestJS-style decorators.
   * Patterns:
   *   @Query() / @Query('fieldName') / @Query(() => ReturnType)
   *   @Mutation() / @Mutation('fieldName') / @Mutation(() => ReturnType)
   *   @Subscription() / @Subscription('fieldName')
   */
  private extractFromNestJsDecorators(
    content: string,
    file: string,
    operations: GraphQLOperation[]
  ): void {
    const lines = content.split('\n');

    const decoratorRegex = /^\s*@(Query|Mutation|Subscription)\s*\(([^)]*)\)/;
    const methodRegex = /^\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)/;

    for (let i = 0; i < lines.length; i++) {
      const decoratorMatch = lines[i].match(decoratorRegex);
      if (!decoratorMatch) continue;

      const operationType = decoratorMatch[1].toLowerCase() as 'query' | 'mutation' | 'subscription';
      const decoratorArgs = decoratorMatch[2].trim();

      // Try to extract field name from decorator args: @Query('fieldName')
      let fieldName: string | undefined;
      let returnType: string | undefined;

      const nameFromString = decoratorArgs.match(/['"](\w+)['"]/);
      if (nameFromString) {
        fieldName = nameFromString[1];
      }

      // Extract return type from arrow function: () => ReturnType or () => [ReturnType]
      const returnTypeMatch = decoratorArgs.match(/=>\s*\[?(\w+)\]?/);
      if (returnTypeMatch) {
        returnType = decoratorArgs.match(/=>\s*(\[[^\]]+\]|\w+)/)?.[1];
      }

      // Look at the next non-decorator line for the method name
      let methodLine = i + 1;
      while (methodLine < lines.length && lines[methodLine].trim().startsWith('@')) {
        methodLine++;
      }

      if (methodLine < lines.length) {
        const methodMatch = lines[methodLine].match(methodRegex);
        if (methodMatch) {
          const name = fieldName || methodMatch[1];
          const args = methodMatch[2].trim() || undefined;

          operations.push({
            type: operationType,
            name,
            file,
            line: i + 1,
            args: args ? `(${args})` : undefined,
            returnType,
          });
        }
      }
    }
  }

  /**
   * Clean return type string by removing trailing commas, directives, etc.
   */
  private cleanReturnType(raw: string): string {
    let cleaned = raw.trim();
    // Remove trailing commas or directives
    cleaned = cleaned.replace(/\s*@.*$/, '');
    cleaned = cleaned.replace(/,\s*$/, '');
    return cleaned;
  }

  // --- File collection ---

  private collectFiles(dir: string): string[] {
    const files: string[] = [];
    this.walk(dir, files, 0);
    return files;
  }

  private walk(dir: string, result: string[], depth: number): void {
    if (depth > 8) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.graphql') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.walk(fullPath, result, depth + 1);
      } else if (entry.isFile() && this.isRelevantFile(entry.name)) {
        result.push(fullPath);
      }
    }
  }

  private isRelevantFile(name: string): boolean {
    const lower = name.toLowerCase();
    if (lower.endsWith('.graphql') || lower.endsWith('.gql')) return true;
    // Skip parser/scanner files themselves
    if (lower.includes('parser') || lower.includes('scanner')) return false;
    // Only parse code files that are likely to contain GraphQL definitions
    if (lower.endsWith('.ts') || lower.endsWith('.js')) {
      return lower.includes('resolver') ||
        lower.includes('schema') ||
        lower.includes('graphql') ||
        lower.includes('type-defs') ||
        lower.includes('typedefs') ||
        lower.includes('gql');
    }
    if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) return false;
    return false;
  }

  private readSafe(filePath: string): string | null {
    try {
      const stat = fs.statSync(filePath);
      const isGraphqlFile = filePath.endsWith('.graphql') || filePath.endsWith('.gql');
      const maxSize = isGraphqlFile ? MAX_GRAPHQL_FILE_SIZE : MAX_FILE_SIZE;
      if (stat.size > maxSize) return null;
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
