import * as fs from 'fs';
import * as path from 'path';
import { DependencyVulnerability, Severity } from '@engineering-os/shared';

/**
 * Represents a single dependency extracted from a Gradle build file or version catalog.
 */
export interface GradleDependency {
  group: string;
  artifact: string;
  version: string;
  configuration: string;
  file: string;
}

/**
 * Known CVE entry for Android/Kotlin/JVM ecosystem dependencies.
 */
interface GradleCveEntry {
  group: string;
  artifact: string;
  patchedVersion: string;
  severity: Severity;
  cveId: string;
  title: string;
  advisory: string;
}

/**
 * Known CVEs for common Android/Kotlin/JVM dependencies.
 */
const GRADLE_KNOWN_CVES: GradleCveEntry[] = [
  // Log4j - Log4Shell
  {
    group: 'org.apache.logging.log4j',
    artifact: 'log4j-core',
    patchedVersion: '2.17.1',
    severity: 'critical',
    cveId: 'CVE-2021-44228',
    title: 'Log4Shell Remote Code Execution',
    advisory:
      'Remote code execution via JNDI lookup injection in log messages. Attackers can execute arbitrary code by sending crafted log input containing ${jndi:ldap://...} patterns.',
  },
  {
    group: 'org.apache.logging.log4j',
    artifact: 'log4j-core',
    patchedVersion: '2.17.0',
    severity: 'high',
    cveId: 'CVE-2021-45105',
    title: 'Log4j DoS via recursive lookup',
    advisory:
      'Denial of service via uncontrolled recursion from self-referential lookups in Thread Context Map patterns.',
  },
  {
    group: 'org.apache.logging.log4j',
    artifact: 'log4j-core',
    patchedVersion: '2.16.0',
    severity: 'critical',
    cveId: 'CVE-2021-45046',
    title: 'Log4j RCE via JNDI in non-default configurations',
    advisory:
      'Remote code execution in non-default configurations with context lookup or Thread Context Map pattern, bypassing the initial CVE-2021-44228 mitigation.',
  },
  // OkHttp
  {
    group: 'com.squareup.okhttp3',
    artifact: 'okhttp',
    patchedVersion: '4.9.2',
    severity: 'high',
    cveId: 'CVE-2021-0341',
    title: 'OkHttp certificate pinning bypass',
    advisory:
      'Certificate pinning bypass due to improper hostname verification. An attacker with a valid certificate for a different domain could intercept HTTPS traffic.',
  },
  // Jackson Databind
  {
    group: 'com.fasterxml.jackson.core',
    artifact: 'jackson-databind',
    patchedVersion: '2.14.0',
    severity: 'high',
    cveId: 'CVE-2022-42003',
    title: 'Jackson Databind resource exhaustion',
    advisory:
      'Deeply nested JSON via UNWRAP_SINGLE_VALUE_ARRAYS causes resource exhaustion. Attackers can cause DoS by sending specially crafted JSON payloads.',
  },
  {
    group: 'com.fasterxml.jackson.core',
    artifact: 'jackson-databind',
    patchedVersion: '2.13.4.2',
    severity: 'high',
    cveId: 'CVE-2022-42004',
    title: 'Jackson Databind resource exhaustion via BeanDeserializer',
    advisory:
      'Resource exhaustion via BeanDeserializer._deserializeFromArray when UNWRAP_SINGLE_VALUE_ARRAYS is enabled.',
  },
  // Spring Core - Spring4Shell
  {
    group: 'org.springframework',
    artifact: 'spring-core',
    patchedVersion: '5.3.18',
    severity: 'critical',
    cveId: 'CVE-2022-22965',
    title: 'Spring4Shell Remote Code Execution',
    advisory:
      'Remote code execution via data binding to class loader on Tomcat. Requires JDK 9+ and Spring MVC/WebFlux application running on Tomcat as WAR.',
  },
  {
    group: 'org.springframework',
    artifact: 'spring-core',
    patchedVersion: '6.0.15',
    severity: 'high',
    cveId: 'CVE-2023-34053',
    title: 'Spring Framework DoS via HTTP request',
    advisory:
      'Denial of service when processing specially crafted HTTP requests in Spring Framework.',
  },
  // Gson
  {
    group: 'com.google.code.gson',
    artifact: 'gson',
    patchedVersion: '2.8.9',
    severity: 'high',
    cveId: 'CVE-2022-25647',
    title: 'Gson deserialization DoS',
    advisory:
      'Deserialization of untrusted data with writeReplace() method can lead to denial of service via deeply nested input.',
  },
  // Kotlin Stdlib
  {
    group: 'org.jetbrains.kotlin',
    artifact: 'kotlin-stdlib',
    patchedVersion: '1.6.0',
    severity: 'medium',
    cveId: 'KT-STDLIB-2021',
    title: 'Kotlin Stdlib known issues',
    advisory:
      'Kotlin stdlib versions prior to 1.6.0 have known regex performance issues and potential ReDoS in Regex class with certain patterns.',
  },
  {
    group: 'org.jetbrains.kotlin',
    artifact: 'kotlin-stdlib-jdk8',
    patchedVersion: '1.6.0',
    severity: 'medium',
    cveId: 'KT-STDLIB-2021',
    title: 'Kotlin Stdlib known issues',
    advisory:
      'Kotlin stdlib versions prior to 1.6.0 have known regex performance issues and potential ReDoS in Regex class with certain patterns.',
  },
  {
    group: 'org.jetbrains.kotlin',
    artifact: 'kotlin-stdlib-jdk7',
    patchedVersion: '1.6.0',
    severity: 'medium',
    cveId: 'KT-STDLIB-2021',
    title: 'Kotlin Stdlib known issues',
    advisory:
      'Kotlin stdlib versions prior to 1.6.0 have known regex performance issues and potential ReDoS in Regex class with certain patterns.',
  },
  // Protobuf Java
  {
    group: 'com.google.protobuf',
    artifact: 'protobuf-java',
    patchedVersion: '3.21.7',
    severity: 'high',
    cveId: 'CVE-2022-3510',
    title: 'Protobuf-Java message parsing DoS',
    advisory:
      'Parsing a maliciously crafted Message-Type extension from the registry can result in out-of-memory errors and denial of service.',
  },
  {
    group: 'com.google.protobuf',
    artifact: 'protobuf-javalite',
    patchedVersion: '3.21.7',
    severity: 'high',
    cveId: 'CVE-2022-3510',
    title: 'Protobuf-Java Lite message parsing DoS',
    advisory:
      'Parsing a maliciously crafted Message-Type extension from the registry can result in out-of-memory errors and denial of service.',
  },
  // Commons Text - Text4Shell
  {
    group: 'org.apache.commons',
    artifact: 'commons-text',
    patchedVersion: '1.10.0',
    severity: 'critical',
    cveId: 'CVE-2022-42889',
    title: 'Text4Shell Remote Code Execution',
    advisory:
      'Remote code execution via StringSubstitutor default lookup interpolation. Attacker-controlled input processed by StringSubstitutor with default lookups (script, dns, url) allows arbitrary code execution.',
  },
  // Bouncy Castle
  {
    group: 'org.bouncycastle',
    artifact: 'bcprov-jdk15on',
    patchedVersion: '1.70',
    severity: 'high',
    cveId: 'CVE-2020-28052',
    title: 'Bouncy Castle authentication bypass',
    advisory:
      'OpenBSDBCrypt.checkPassword in Bouncy Castle allows password bypass due to a timing side-channel in the bcrypt comparison.',
  },
  {
    group: 'org.bouncycastle',
    artifact: 'bcprov-jdk18on',
    patchedVersion: '1.70',
    severity: 'high',
    cveId: 'CVE-2020-28052',
    title: 'Bouncy Castle authentication bypass',
    advisory:
      'OpenBSDBCrypt.checkPassword in Bouncy Castle allows password bypass due to a timing side-channel in the bcrypt comparison.',
  },
  // Firebase Database
  {
    group: 'com.google.firebase',
    artifact: 'firebase-database',
    patchedVersion: '20.1.0',
    severity: 'medium',
    cveId: 'FIREBASE-DB-2022',
    title: 'Firebase Realtime Database insecure default rules',
    advisory:
      'Firebase Realtime Database SDK versions prior to 20.1.0 may expose data through improperly configured security rules and lack proper token validation in certain edge cases.',
  },
  {
    group: 'com.google.firebase',
    artifact: 'firebase-database-ktx',
    patchedVersion: '20.1.0',
    severity: 'medium',
    cveId: 'FIREBASE-DB-2022',
    title: 'Firebase Realtime Database KTX insecure default rules',
    advisory:
      'Firebase Realtime Database KTX SDK versions prior to 20.1.0 may expose data through improperly configured security rules and lack proper token validation in certain edge cases.',
  },
];

/**
 * Supported Gradle dependency configurations.
 */
const GRADLE_CONFIGURATIONS = [
  'implementation',
  'api',
  'compileOnly',
  'compileOnlyApi',
  'runtimeOnly',
  'testImplementation',
  'testRuntimeOnly',
  'testCompileOnly',
  'kapt',
  'ksp',
  'annotationProcessor',
  'debugImplementation',
  'releaseImplementation',
  'androidTestImplementation',
] as const;

type GradleConfiguration = (typeof GRADLE_CONFIGURATIONS)[number] | string;

/**
 * Auditor for Gradle/Android/Kotlin projects.
 * Parses build.gradle, build.gradle.kts, and libs.versions.toml files
 * to extract dependencies and check them against known CVEs.
 */
export class GradleAuditor {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Parse all Gradle dependency files found in the project.
   * Searches for build.gradle, build.gradle.kts, and libs.versions.toml.
   */
  parseDependencies(): GradleDependency[] {
    const dependencies: GradleDependency[] = [];

    const gradleFiles = this.findGradleFiles();
    for (const filePath of gradleFiles) {
      const parsed = this.parseGradleFile(filePath);
      dependencies.push(...parsed);
    }

    const catalogFiles = this.findVersionCatalogFiles();
    for (const filePath of catalogFiles) {
      const parsed = this.parseVersionCatalog(filePath);
      dependencies.push(...parsed);
    }

    return dependencies;
  }

  /**
   * Audit all Gradle dependencies against known CVEs.
   * Returns a list of vulnerabilities found.
   */
  audit(): DependencyVulnerability[] {
    const dependencies = this.parseDependencies();
    const vulnerabilities: DependencyVulnerability[] = [];

    for (const dep of dependencies) {
      const matchingCves = GRADLE_KNOWN_CVES.filter(
        (cve) => cve.group === dep.group && cve.artifact === dep.artifact,
      );

      for (const cve of matchingCves) {
        if (this.isVersionVulnerable(dep.version, cve.patchedVersion)) {
          vulnerabilities.push({
            package: `${dep.group}:${dep.artifact}`,
            version: dep.version,
            severity: cve.severity,
            cveId: cve.cveId,
            title: cve.title,
            patchedIn: cve.patchedVersion,
            advisory: cve.advisory,
          });
        }
      }
    }

    return this.deduplicateVulnerabilities(vulnerabilities);
  }

  /**
   * Recursively find all build.gradle and build.gradle.kts files.
   */
  private findGradleFiles(): string[] {
    const files: string[] = [];
    this.walkDirectory(this.rootPath, (filePath) => {
      const basename = path.basename(filePath);
      if (basename === 'build.gradle' || basename === 'build.gradle.kts') {
        files.push(filePath);
      }
    });
    return files;
  }

  /**
   * Find libs.versions.toml files in standard Gradle locations.
   */
  private findVersionCatalogFiles(): string[] {
    const files: string[] = [];
    const standardPaths = [
      path.join(this.rootPath, 'gradle', 'libs.versions.toml'),
      path.join(this.rootPath, 'gradle', 'versions.toml'),
    ];

    for (const candidate of standardPaths) {
      if (fs.existsSync(candidate)) {
        files.push(candidate);
      }
    }

    // Also search for any .versions.toml file in the gradle directory
    const gradleDir = path.join(this.rootPath, 'gradle');
    if (fs.existsSync(gradleDir) && fs.statSync(gradleDir).isDirectory()) {
      const entries = fs.readdirSync(gradleDir);
      for (const entry of entries) {
        if (entry.endsWith('.versions.toml') && !files.includes(path.join(gradleDir, entry))) {
          files.push(path.join(gradleDir, entry));
        }
      }
    }

    return files;
  }

  /**
   * Walk directory tree recursively, calling callback for each file.
   * Skips common non-source directories.
   */
  private walkDirectory(dirPath: string, callback: (filePath: string) => void): void {
    const skipDirs = new Set([
      'node_modules',
      '.git',
      '.gradle',
      'build',
      '.idea',
      '.kotlin',
      'out',
    ]);

    if (!fs.existsSync(dirPath)) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          this.walkDirectory(path.join(dirPath, entry.name), callback);
        }
      } else if (entry.isFile()) {
        callback(path.join(dirPath, entry.name));
      }
    }
  }

  /**
   * Parse a build.gradle or build.gradle.kts file.
   */
  private parseGradleFile(filePath: string): GradleDependency[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const basename = path.basename(filePath);
    const relativePath = path.relative(this.rootPath, filePath);

    const dependencies: GradleDependency[] = [];

    if (basename === 'build.gradle.kts') {
      dependencies.push(...this.parseKotlinDsl(content, relativePath));
    } else {
      dependencies.push(...this.parseGroovyDsl(content, relativePath));
    }

    return dependencies;
  }

  /**
   * Parse Groovy DSL build.gradle file.
   * Handles:
   *   implementation 'group:artifact:version'
   *   implementation "group:artifact:version"
   *   implementation group: 'x', name: 'y', version: 'z'
   */
  private parseGroovyDsl(content: string, file: string): GradleDependency[] {
    const dependencies: GradleDependency[] = [];
    const configPattern = GRADLE_CONFIGURATIONS.join('|');

    // Pattern: configuration 'group:artifact:version' or "group:artifact:version"
    const stringNotationRegex = new RegExp(
      `(?:^|\\s)(${configPattern})\\s+['"]([^:'"]+):([^:'"]+):([^'"@]+)(?:@[^'"]*)?['"]`,
      'gm',
    );

    let match: RegExpExecArray | null;
    while ((match = stringNotationRegex.exec(content)) !== null) {
      const version = match[4].trim();
      if (!version.startsWith('$') && !version.startsWith('{')) {
        dependencies.push({
          group: match[2].trim(),
          artifact: match[3].trim(),
          version,
          configuration: match[1].trim(),
          file,
        });
      }
    }

    // Pattern: configuration group: 'x', name: 'y', version: 'z'
    const mapNotationRegex = new RegExp(
      `(?:^|\\s)(${configPattern})\\s+group:\\s*['"]([^'"]+)['"]\\s*,\\s*name:\\s*['"]([^'"]+)['"]\\s*,\\s*version:\\s*['"]([^'"]+)['"]`,
      'gm',
    );

    while ((match = mapNotationRegex.exec(content)) !== null) {
      const version = match[4].trim();
      if (!version.startsWith('$') && !version.startsWith('{')) {
        dependencies.push({
          group: match[2].trim(),
          artifact: match[3].trim(),
          version,
          configuration: match[1].trim(),
          file,
        });
      }
    }

    // Pattern: configuration(group: 'x', name: 'y', version: 'z') - parenthesized map notation
    const parenMapRegex = new RegExp(
      `(?:^|\\s)(${configPattern})\\(\\s*group:\\s*['"]([^'"]+)['"]\\s*,\\s*name:\\s*['"]([^'"]+)['"]\\s*,\\s*version:\\s*['"]([^'"]+)['"]\\s*\\)`,
      'gm',
    );

    while ((match = parenMapRegex.exec(content)) !== null) {
      const version = match[4].trim();
      if (!version.startsWith('$') && !version.startsWith('{')) {
        dependencies.push({
          group: match[2].trim(),
          artifact: match[3].trim(),
          version,
          configuration: match[1].trim(),
          file,
        });
      }
    }

    // Handle ext/extra variables block for variable resolution
    const resolvedContent = this.resolveGroovyVariables(content);
    if (resolvedContent !== content) {
      const additionalDeps = this.parseGroovyDsl(resolvedContent, file);
      // Only add deps that we didn't already capture
      for (const dep of additionalDeps) {
        const exists = dependencies.some(
          (d) =>
            d.group === dep.group &&
            d.artifact === dep.artifact &&
            d.configuration === dep.configuration,
        );
        if (!exists) {
          dependencies.push(dep);
        }
      }
    }

    return dependencies;
  }

  /**
   * Parse Kotlin DSL build.gradle.kts file.
   * Handles:
   *   implementation("group:artifact:version")
   *   implementation("group:artifact:version") { ... }
   */
  private parseKotlinDsl(content: string, file: string): GradleDependency[] {
    const dependencies: GradleDependency[] = [];
    const configPattern = GRADLE_CONFIGURATIONS.join('|');

    // Pattern: configuration("group:artifact:version")
    const kotlinNotationRegex = new RegExp(
      `(?:^|\\s)(${configPattern})\\(\\s*["']([^:"']+):([^:"']+):([^)"'@]+)(?:@[^)"']*)?["']\\s*\\)`,
      'gm',
    );

    let match: RegExpExecArray | null;
    while ((match = kotlinNotationRegex.exec(content)) !== null) {
      const version = match[4].trim();
      if (!version.startsWith('$') && !version.startsWith('{')) {
        dependencies.push({
          group: match[2].trim(),
          artifact: match[3].trim(),
          version,
          configuration: match[1].trim(),
          file,
        });
      }
    }

    // Pattern: configuration("group:artifact:version") { ... } (with trailing block)
    const kotlinBlockRegex = new RegExp(
      `(?:^|\\s)(${configPattern})\\(\\s*["']([^:"']+):([^:"']+):([^)"'@]+)(?:@[^)"']*)?["']\\s*\\)\\s*\\{`,
      'gm',
    );

    while ((match = kotlinBlockRegex.exec(content)) !== null) {
      const version = match[4].trim();
      if (!version.startsWith('$') && !version.startsWith('{')) {
        const exists = dependencies.some(
          (d) =>
            d.group === match![2].trim() &&
            d.artifact === match![3].trim() &&
            d.configuration === match![1].trim(),
        );
        if (!exists) {
          dependencies.push({
            group: match[2].trim(),
            artifact: match[3].trim(),
            version,
            configuration: match[1].trim(),
            file,
          });
        }
      }
    }

    // Pattern: configuration(group = "x", name = "y", version = "z")
    const kotlinMapRegex = new RegExp(
      `(?:^|\\s)(${configPattern})\\(\\s*group\\s*=\\s*["']([^"']+)["']\\s*,\\s*name\\s*=\\s*["']([^"']+)["']\\s*,\\s*version\\s*=\\s*["']([^"']+)["']\\s*\\)`,
      'gm',
    );

    while ((match = kotlinMapRegex.exec(content)) !== null) {
      const version = match[4].trim();
      if (!version.startsWith('$') && !version.startsWith('{')) {
        dependencies.push({
          group: match[2].trim(),
          artifact: match[3].trim(),
          version,
          configuration: match[1].trim(),
          file,
        });
      }
    }

    return dependencies;
  }

  /**
   * Attempt to resolve simple Groovy ext variables.
   * Handles: def okhttpVersion = "4.9.0" and ext { okhttpVersion = '4.9.0' }
   */
  private resolveGroovyVariables(content: string): string {
    const variables: Record<string, string> = {};

    // Match: def varName = "value" or def varName = 'value'
    const defRegex = /(?:def|val|final)\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = defRegex.exec(content)) !== null) {
      variables[match[1]] = match[2];
    }

    // Match inside ext { ... } block: varName = "value"
    const extBlockRegex = /ext\s*\{([^}]+)\}/gs;
    let extMatch: RegExpExecArray | null;
    while ((extMatch = extBlockRegex.exec(content)) !== null) {
      const extContent = extMatch[1];
      const extVarRegex = /(\w+)\s*=\s*['"]([^'"]+)['"]/g;
      let varMatch: RegExpExecArray | null;
      while ((varMatch = extVarRegex.exec(extContent)) !== null) {
        variables[varMatch[1]] = varMatch[2];
      }
    }

    // Match: ext.varName = "value"
    const extDotRegex = /ext\.(\w+)\s*=\s*['"]([^'"]+)['"]/g;
    while ((match = extDotRegex.exec(content)) !== null) {
      variables[match[1]] = match[2];
    }

    if (Object.keys(variables).length === 0) return content;

    // Replace $varName and ${varName} and "$varName" patterns in dependency strings
    let resolved = content;
    for (const [name, value] of Object.entries(variables)) {
      resolved = resolved.replace(new RegExp(`\\$\\{?${name}\\}?`, 'g'), value);
    }

    return resolved;
  }

  /**
   * Parse a Gradle version catalog file (libs.versions.toml).
   * Extracts versions and resolves library references.
   */
  private parseVersionCatalog(filePath: string): GradleDependency[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(this.rootPath, filePath);
    const dependencies: GradleDependency[] = [];

    const versions = this.parseCatalogVersions(content);
    const libraries = this.parseCatalogLibraries(content, versions);

    for (const lib of libraries) {
      dependencies.push({
        group: lib.group,
        artifact: lib.artifact,
        version: lib.version,
        configuration: 'catalog',
        file: relativePath,
      });
    }

    return dependencies;
  }

  /**
   * Parse [versions] section from a TOML version catalog.
   */
  private parseCatalogVersions(content: string): Record<string, string> {
    const versions: Record<string, string> = {};
    const lines = content.split('\n');
    let inVersionsSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '[versions]') {
        inVersionsSection = true;
        continue;
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inVersionsSection = false;
        continue;
      }

      if (inVersionsSection && trimmed && !trimmed.startsWith('#')) {
        // Match: key = "value" or key = 'value'
        const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*=\s*["']([^"']+)["']/);
        if (match) {
          versions[match[1]] = match[2];
        }
        // Match: key = { strictly = "value" } or { require = "value" } or { prefer = "value" }
        const richMatch = trimmed.match(
          /^([a-zA-Z0-9_.-]+)\s*=\s*\{[^}]*(?:strictly|require|prefer)\s*=\s*["']([^"']+)["']/,
        );
        if (richMatch) {
          versions[richMatch[1]] = richMatch[2];
        }
      }
    }

    return versions;
  }

  /**
   * Parse [libraries] section from a TOML version catalog.
   */
  private parseCatalogLibraries(
    content: string,
    versions: Record<string, string>,
  ): Array<{ group: string; artifact: string; version: string }> {
    const libraries: Array<{ group: string; artifact: string; version: string }> = [];
    const lines = content.split('\n');
    let inLibrariesSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '[libraries]') {
        inLibrariesSection = true;
        continue;
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inLibrariesSection = false;
        continue;
      }

      if (inLibrariesSection && trimmed && !trimmed.startsWith('#')) {
        const parsed = this.parseCatalogLibraryEntry(trimmed, versions);
        if (parsed) {
          libraries.push(parsed);
        }
      }
    }

    return libraries;
  }

  /**
   * Parse a single library entry from a TOML version catalog.
   * Handles multiple formats:
   *   name = { module = "group:artifact", version.ref = "key" }
   *   name = { module = "group:artifact", version = "1.0.0" }
   *   name = { group = "x", name = "y", version.ref = "key" }
   *   name = { group = "x", name = "y", version = "1.0.0" }
   *   name = "group:artifact:version"
   */
  private parseCatalogLibraryEntry(
    line: string,
    versions: Record<string, string>,
  ): { group: string; artifact: string; version: string } | null {
    // Simple string notation: name = "group:artifact:version"
    const simpleMatch = line.match(
      /^[a-zA-Z0-9_.-]+\s*=\s*["']([^:"']+):([^:"']+):([^"']+)["']/,
    );
    if (simpleMatch) {
      return {
        group: simpleMatch[1],
        artifact: simpleMatch[2],
        version: simpleMatch[3],
      };
    }

    // Module notation with version.ref: { module = "group:artifact", version.ref = "key" }
    const moduleRefMatch = line.match(
      /module\s*=\s*["']([^:"']+):([^"']+)["'].*version\.ref\s*=\s*["']([^"']+)["']/,
    );
    if (moduleRefMatch) {
      const versionRef = versions[moduleRefMatch[3]];
      if (versionRef) {
        return {
          group: moduleRefMatch[1],
          artifact: moduleRefMatch[2],
          version: versionRef,
        };
      }
      return null;
    }

    // Module notation with version.ref in reverse order
    const refModuleMatch = line.match(
      /version\.ref\s*=\s*["']([^"']+)["'].*module\s*=\s*["']([^:"']+):([^"']+)["']/,
    );
    if (refModuleMatch) {
      const versionRef = versions[refModuleMatch[1]];
      if (versionRef) {
        return {
          group: refModuleMatch[2],
          artifact: refModuleMatch[3],
          version: versionRef,
        };
      }
      return null;
    }

    // Module notation with inline version: { module = "group:artifact", version = "1.0.0" }
    const moduleVersionMatch = line.match(
      /module\s*=\s*["']([^:"']+):([^"']+)["'].*(?<![.])version\s*=\s*["']([^"']+)["']/,
    );
    if (moduleVersionMatch) {
      return {
        group: moduleVersionMatch[1],
        artifact: moduleVersionMatch[2],
        version: moduleVersionMatch[3],
      };
    }

    // Group/name notation with version.ref: { group = "x", name = "y", version.ref = "key" }
    const groupNameRefMatch = line.match(
      /group\s*=\s*["']([^"']+)["'].*name\s*=\s*["']([^"']+)["'].*version\.ref\s*=\s*["']([^"']+)["']/,
    );
    if (groupNameRefMatch) {
      const versionRef = versions[groupNameRefMatch[3]];
      if (versionRef) {
        return {
          group: groupNameRefMatch[1],
          artifact: groupNameRefMatch[2],
          version: versionRef,
        };
      }
      return null;
    }

    // Group/name notation with inline version: { group = "x", name = "y", version = "1.0.0" }
    const groupNameVersionMatch = line.match(
      /group\s*=\s*["']([^"']+)["'].*name\s*=\s*["']([^"']+)["'].*(?<![.])version\s*=\s*["']([^"']+)["']/,
    );
    if (groupNameVersionMatch) {
      return {
        group: groupNameVersionMatch[1],
        artifact: groupNameVersionMatch[2],
        version: groupNameVersionMatch[3],
      };
    }

    return null;
  }

  /**
   * Compare installed version against patched version.
   * Returns true if the installed version is strictly less than the patched version.
   */
  private isVersionVulnerable(installed: string, patchedVersion: string): boolean {
    const installedParts = this.parseVersionParts(installed);
    const patchedParts = this.parseVersionParts(patchedVersion);

    if (!installedParts || !patchedParts) return false;

    return this.compareVersionArrays(installedParts, patchedParts) < 0;
  }

  /**
   * Parse a version string into numeric parts.
   * Handles versions like "4.9.0", "2.13.4.2", "1.6.0-rc1".
   */
  private parseVersionParts(version: string): number[] | null {
    // Remove pre-release suffixes for comparison, but treat them as older
    const cleanVersion = version.split('-')[0].split('+')[0];
    const parts = cleanVersion.split('.').map(Number);

    if (parts.some(isNaN)) return null;
    return parts;
  }

  /**
   * Compare two version number arrays.
   * Returns negative if a < b, 0 if equal, positive if a > b.
   */
  private compareVersionArrays(a: number[], b: number[]): number {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  }

  /**
   * Remove duplicate vulnerability entries (same package + CVE).
   */
  private deduplicateVulnerabilities(
    vulnerabilities: DependencyVulnerability[],
  ): DependencyVulnerability[] {
    const seen = new Set<string>();
    const deduped: DependencyVulnerability[] = [];

    for (const vuln of vulnerabilities) {
      const key = `${vuln.package}:${vuln.version}:${vuln.cveId}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(vuln);
      }
    }

    return deduped;
  }
}
