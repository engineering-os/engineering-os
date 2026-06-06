import * as fs from 'fs';
import * as path from 'path';
import { DependencyVulnerability, Severity } from '@engineering-os/shared';

type Ecosystem = 'npm' | 'python' | 'go' | 'java' | 'rust' | 'ruby';

interface CveEntry {
  package: string;
  vulnerableVersions: string;
  severity: Severity;
  cveId: string;
  title: string;
  patchedIn?: string;
  advisory: string;
  ecosystem: Ecosystem;
}

interface ManifestFile {
  filename: string;
  ecosystem: Ecosystem;
}

const MANIFEST_FILES: ManifestFile[] = [
  { filename: 'package.json', ecosystem: 'npm' },
  { filename: 'requirements.txt', ecosystem: 'python' },
  { filename: 'Pipfile', ecosystem: 'python' },
  { filename: 'pyproject.toml', ecosystem: 'python' },
  { filename: 'go.mod', ecosystem: 'go' },
  { filename: 'pom.xml', ecosystem: 'java' },
  { filename: 'build.gradle', ecosystem: 'java' },
  { filename: 'Cargo.toml', ecosystem: 'rust' },
  { filename: 'Gemfile', ecosystem: 'ruby' },
];

const NPM_CVES: CveEntry[] = [
  { package: 'lodash', vulnerableVersions: '<4.17.21', severity: 'high', cveId: 'CVE-2021-23337', title: 'Command Injection via template', patchedIn: '4.17.21', advisory: 'Prototype pollution and command injection in lodash template function', ecosystem: 'npm' },
  { package: 'lodash', vulnerableVersions: '<4.17.20', severity: 'high', cveId: 'CVE-2020-8203', title: 'Prototype Pollution', patchedIn: '4.17.20', advisory: 'Prototype pollution via zipObjectDeep', ecosystem: 'npm' },
  { package: 'minimist', vulnerableVersions: '<1.2.6', severity: 'critical', cveId: 'CVE-2021-44906', title: 'Prototype Pollution', patchedIn: '1.2.6', advisory: 'Prototype pollution in minimist', ecosystem: 'npm' },
  { package: 'axios', vulnerableVersions: '<1.6.0', severity: 'high', cveId: 'CVE-2023-45857', title: 'CSRF via XSRF-TOKEN cookie', patchedIn: '1.6.0', advisory: 'Cross-site request forgery via cookie exposure', ecosystem: 'npm' },
  { package: 'jsonwebtoken', vulnerableVersions: '<9.0.0', severity: 'high', cveId: 'CVE-2022-23529', title: 'Key confusion attack', patchedIn: '9.0.0', advisory: 'Algorithm confusion allows secret key bypass', ecosystem: 'npm' },
  { package: 'express', vulnerableVersions: '<4.19.2', severity: 'medium', cveId: 'CVE-2024-29041', title: 'Open Redirect', patchedIn: '4.19.2', advisory: 'Open redirect via malformed URLs in res.redirect', ecosystem: 'npm' },
  { package: 'tar', vulnerableVersions: '<6.1.9', severity: 'high', cveId: 'CVE-2021-37713', title: 'Arbitrary file write', patchedIn: '6.1.9', advisory: 'Path traversal during extraction on Windows', ecosystem: 'npm' },
  { package: 'node-fetch', vulnerableVersions: '<2.6.7', severity: 'high', cveId: 'CVE-2022-0235', title: 'Header leak on redirect', patchedIn: '2.6.7', advisory: 'Authorization header leaked to third-party on redirect', ecosystem: 'npm' },
  { package: 'glob-parent', vulnerableVersions: '<5.1.2', severity: 'high', cveId: 'CVE-2020-28469', title: 'ReDoS', patchedIn: '5.1.2', advisory: 'Regular expression denial of service', ecosystem: 'npm' },
  { package: 'path-parse', vulnerableVersions: '<1.0.7', severity: 'medium', cveId: 'CVE-2021-23343', title: 'ReDoS', patchedIn: '1.0.7', advisory: 'Regular expression denial of service via splitDeviceRe', ecosystem: 'npm' },
  { package: 'shell-quote', vulnerableVersions: '<1.7.3', severity: 'critical', cveId: 'CVE-2021-42740', title: 'Command Injection', patchedIn: '1.7.3', advisory: 'Improper neutralization of special characters in shell-quote', ecosystem: 'npm' },
  { package: 'qs', vulnerableVersions: '<6.10.3', severity: 'high', cveId: 'CVE-2022-24999', title: 'Prototype Pollution', patchedIn: '6.10.3', advisory: 'Prototype pollution in qs parse function', ecosystem: 'npm' },
  { package: 'semver', vulnerableVersions: '<7.5.2', severity: 'medium', cveId: 'CVE-2022-25883', title: 'ReDoS', patchedIn: '7.5.2', advisory: 'Regular expression denial of service in semver.clean', ecosystem: 'npm' },
  { package: 'xml2js', vulnerableVersions: '<0.5.0', severity: 'medium', cveId: 'CVE-2023-0842', title: 'Prototype Pollution', patchedIn: '0.5.0', advisory: 'Prototype pollution in xml2js parseStringPromise', ecosystem: 'npm' },
  { package: 'tough-cookie', vulnerableVersions: '<4.1.3', severity: 'medium', cveId: 'CVE-2023-26136', title: 'Prototype Pollution', patchedIn: '4.1.3', advisory: 'Prototype pollution via cookie jar manipulation', ecosystem: 'npm' },
  { package: 'postcss', vulnerableVersions: '<8.4.31', severity: 'medium', cveId: 'CVE-2023-44270', title: 'Line return parsing issue', patchedIn: '8.4.31', advisory: 'External CSS file import manipulation', ecosystem: 'npm' },
  { package: 'undici', vulnerableVersions: '<5.26.2', severity: 'high', cveId: 'CVE-2023-45143', title: 'Cookie header leak', patchedIn: '5.26.2', advisory: 'Cookie headers leaked across redirects to different origins', ecosystem: 'npm' },
  { package: 'protobufjs', vulnerableVersions: '<7.2.4', severity: 'high', cveId: 'CVE-2023-36665', title: 'Prototype Pollution', patchedIn: '7.2.4', advisory: 'Prototype pollution via load/parse functions', ecosystem: 'npm' },
  { package: 'word-wrap', vulnerableVersions: '<1.2.4', severity: 'medium', cveId: 'CVE-2023-26115', title: 'ReDoS', patchedIn: '1.2.4', advisory: 'Regular expression denial of service', ecosystem: 'npm' },
  { package: 'ip', vulnerableVersions: '<2.0.1', severity: 'high', cveId: 'CVE-2024-29415', title: 'SSRF bypass', patchedIn: '2.0.1', advisory: 'isPublic/isPrivate returns incorrect results allowing SSRF', ecosystem: 'npm' },
];

const PYTHON_CVES: CveEntry[] = [
  { package: 'requests', vulnerableVersions: '<2.31.0', severity: 'medium', cveId: 'CVE-2023-32681', title: 'Proxy-Authorization header leak', patchedIn: '2.31.0', advisory: 'Proxy-Authorization header leaked to destination server on redirect', ecosystem: 'python' },
  { package: 'requests', vulnerableVersions: '<2.32.2', severity: 'medium', cveId: 'CVE-2024-35195', title: 'Session cert verification bypass', patchedIn: '2.32.2', advisory: 'Session object does not verify certificates after making first request with verify=False', ecosystem: 'python' },
  { package: 'flask', vulnerableVersions: '<2.3.2', severity: 'high', cveId: 'CVE-2023-30861', title: 'Cookie confusion in proxy', patchedIn: '2.3.2', advisory: 'Set-Cookie headers not cleared on cross-domain redirects behind proxy', ecosystem: 'python' },
  { package: 'django', vulnerableVersions: '<4.2.7', severity: 'high', cveId: 'CVE-2023-46695', title: 'DoS via file uploads', patchedIn: '4.2.7', advisory: 'Denial-of-service via large file upload names in NFKC normalization', ecosystem: 'python' },
  { package: 'django', vulnerableVersions: '<4.2.11', severity: 'critical', cveId: 'CVE-2024-27351', title: 'ReDoS in Truncator', patchedIn: '4.2.11', advisory: 'Regular expression denial of service in django.utils.text.Truncator.words', ecosystem: 'python' },
  { package: 'pillow', vulnerableVersions: '<10.0.1', severity: 'high', cveId: 'CVE-2023-44271', title: 'DoS via large text chunk', patchedIn: '10.0.1', advisory: 'Uncontrolled resource consumption when processing large text chunks in PIL', ecosystem: 'python' },
  { package: 'pillow', vulnerableVersions: '<10.2.0', severity: 'high', cveId: 'CVE-2023-50447', title: 'Arbitrary code execution', patchedIn: '10.2.0', advisory: 'Arbitrary code execution if PIL.ImageMath.eval used with attacker input', ecosystem: 'python' },
  { package: 'cryptography', vulnerableVersions: '<41.0.6', severity: 'high', cveId: 'CVE-2023-49083', title: 'Null pointer dereference', patchedIn: '41.0.6', advisory: 'NULL-dereference when loading PKCS7 certificates', ecosystem: 'python' },
  { package: 'cryptography', vulnerableVersions: '<42.0.4', severity: 'high', cveId: 'CVE-2024-26130', title: 'NULL pointer in PKCS12', patchedIn: '42.0.4', advisory: 'NULL pointer dereference on PKCS12 deserialization', ecosystem: 'python' },
  { package: 'pyyaml', vulnerableVersions: '<6.0.1', severity: 'high', cveId: 'CVE-2022-1471', title: 'Arbitrary code execution', patchedIn: '6.0.1', advisory: 'Arbitrary code execution via untrusted YAML deserialization', ecosystem: 'python' },
  { package: 'jinja2', vulnerableVersions: '<3.1.3', severity: 'medium', cveId: 'CVE-2024-22195', title: 'XSS via xmlattr filter', patchedIn: '3.1.3', advisory: 'Cross-site scripting via xmlattr filter accepting keys with spaces', ecosystem: 'python' },
  { package: 'jinja2', vulnerableVersions: '<3.1.4', severity: 'medium', cveId: 'CVE-2024-34064', title: 'XSS via xmlattr filter', patchedIn: '3.1.4', advisory: 'Accept-from-untrusted-sources attribute injection in xmlattr', ecosystem: 'python' },
];

const GO_CVES: CveEntry[] = [
  { package: 'golang.org/x/crypto', vulnerableVersions: '<0.17.0', severity: 'critical', cveId: 'CVE-2023-48795', title: 'Terrapin SSH prefix truncation', patchedIn: '0.17.0', advisory: 'SSH handshake prefix truncation attack (Terrapin) allowing message manipulation', ecosystem: 'go' },
  { package: 'golang.org/x/crypto', vulnerableVersions: '<0.16.0', severity: 'high', cveId: 'CVE-2023-44487', title: 'HTTP/2 rapid reset DoS', patchedIn: '0.16.0', advisory: 'Denial of service via HTTP/2 rapid reset attack', ecosystem: 'go' },
  { package: 'golang.org/x/crypto', vulnerableVersions: '<0.7.0', severity: 'high', cveId: 'CVE-2023-28642', title: 'SSH server auth bypass', patchedIn: '0.7.0', advisory: 'Potential SSH server authentication bypass via nil PublicKeyCallback', ecosystem: 'go' },
  { package: 'golang.org/x/net', vulnerableVersions: '<0.17.0', severity: 'high', cveId: 'CVE-2023-39325', title: 'HTTP/2 rapid reset DoS', patchedIn: '0.17.0', advisory: 'HTTP/2 rapid reset can cause excessive goroutine growth', ecosystem: 'go' },
  { package: 'golang.org/x/net', vulnerableVersions: '<0.13.0', severity: 'high', cveId: 'CVE-2023-29406', title: 'HTTP Host header injection', patchedIn: '0.13.0', advisory: 'Insufficient sanitization of Host header in net/http', ecosystem: 'go' },
  { package: 'golang.org/x/net', vulnerableVersions: '<0.7.0', severity: 'high', cveId: 'CVE-2022-41723', title: 'HTTP/2 HPACK decoder DoS', patchedIn: '0.7.0', advisory: 'Excessive memory consumption in HPACK header decoder', ecosystem: 'go' },
];

const JAVA_CVES: CveEntry[] = [
  { package: 'log4j', vulnerableVersions: '<2.17.1', severity: 'critical', cveId: 'CVE-2021-44228', title: 'Log4Shell RCE', patchedIn: '2.17.1', advisory: 'Remote code execution via JNDI lookup injection in log messages', ecosystem: 'java' },
  { package: 'log4j', vulnerableVersions: '<2.17.0', severity: 'high', cveId: 'CVE-2021-45105', title: 'DoS via recursive lookup', patchedIn: '2.17.0', advisory: 'Denial of service via uncontrolled recursion in lookup evaluation', ecosystem: 'java' },
  { package: 'log4j', vulnerableVersions: '<2.16.0', severity: 'critical', cveId: 'CVE-2021-45046', title: 'RCE via JNDI', patchedIn: '2.16.0', advisory: 'Remote code execution in non-default configurations with context lookup', ecosystem: 'java' },
  { package: 'spring-core', vulnerableVersions: '<5.3.18', severity: 'critical', cveId: 'CVE-2022-22965', title: 'Spring4Shell RCE', patchedIn: '5.3.18', advisory: 'Remote code execution via data binding to class loader on Tomcat', ecosystem: 'java' },
  { package: 'spring-core', vulnerableVersions: '<6.0.15', severity: 'high', cveId: 'CVE-2023-34053', title: 'DoS via HTTP request', patchedIn: '6.0.15', advisory: 'Denial of service when processing specially crafted HTTP requests', ecosystem: 'java' },
  { package: 'jackson-databind', vulnerableVersions: '<2.14.0', severity: 'high', cveId: 'CVE-2022-42003', title: 'Resource exhaustion', patchedIn: '2.14.0', advisory: 'Deeply nested JSON via UNWRAP_SINGLE_VALUE_ARRAYS causes resource exhaustion', ecosystem: 'java' },
  { package: 'jackson-databind', vulnerableVersions: '<2.13.4.2', severity: 'high', cveId: 'CVE-2022-42004', title: 'Resource exhaustion', patchedIn: '2.13.4.2', advisory: 'Resource exhaustion via BeanDeserializer._deserializeFromArray', ecosystem: 'java' },
  { package: 'commons-text', vulnerableVersions: '<1.10.0', severity: 'critical', cveId: 'CVE-2022-42889', title: 'Text4Shell RCE', patchedIn: '1.10.0', advisory: 'Remote code execution via StringSubstitutor default lookup interpolation', ecosystem: 'java' },
];

const RUST_CVES: CveEntry[] = [
  { package: 'hyper', vulnerableVersions: '<0.14.27', severity: 'high', cveId: 'CVE-2023-26964', title: 'HTTP/2 DoS', patchedIn: '0.14.27', advisory: 'Denial of service via HTTP/2 peer sending more HEADERS than configured MAX_CONCURRENT_STREAMS', ecosystem: 'rust' },
  { package: 'hyper', vulnerableVersions: '<1.4.0', severity: 'medium', cveId: 'CVE-2024-5514', title: 'HTTP request smuggling', patchedIn: '1.4.0', advisory: 'Lenient parsing of Content-Length headers allows request smuggling', ecosystem: 'rust' },
  { package: 'openssl-src', vulnerableVersions: '<300.2.2', severity: 'high', cveId: 'CVE-2024-0727', title: 'NULL dereference', patchedIn: '300.2.2', advisory: 'NULL pointer dereference in PKCS12 parsing with empty contentInfo', ecosystem: 'rust' },
  { package: 'openssl-src', vulnerableVersions: '<300.1.6', severity: 'high', cveId: 'CVE-2023-5678', title: 'DoS via DH key generation', patchedIn: '300.1.6', advisory: 'Excessive time spent checking DH q parameter value', ecosystem: 'rust' },
  { package: 'openssl-src', vulnerableVersions: '<300.1.4', severity: 'critical', cveId: 'CVE-2023-4807', title: 'POLY1305 MAC corruption', patchedIn: '300.1.4', advisory: 'POLY1305 MAC state corruption on Windows ARM64 leading to auth bypass', ecosystem: 'rust' },
];

const KNOWN_CVES: CveEntry[] = [
  ...NPM_CVES,
  ...PYTHON_CVES,
  ...GO_CVES,
  ...JAVA_CVES,
  ...RUST_CVES,
];

export interface EcosystemDependencyVulnerability extends DependencyVulnerability {
  ecosystem: Ecosystem;
}

export class DependencyAuditor {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async audit(packageFile?: string): Promise<EcosystemDependencyVulnerability[]> {
    if (packageFile) {
      return this.auditSingleFile(packageFile);
    }

    return this.auditAllManifests();
  }

  private async auditAllManifests(): Promise<EcosystemDependencyVulnerability[]> {
    const vulnerabilities: EcosystemDependencyVulnerability[] = [];

    for (const manifest of MANIFEST_FILES) {
      const manifestPath = path.join(this.rootPath, manifest.filename);
      if (fs.existsSync(manifestPath)) {
        const deps = this.parseDependencies(manifestPath, manifest.ecosystem);
        const results = this.checkDependencies(deps, manifest.ecosystem);
        vulnerabilities.push(...results);
      }
    }

    return vulnerabilities;
  }

  private async auditSingleFile(packageFile: string): Promise<EcosystemDependencyVulnerability[]> {
    const pkgPath = path.resolve(this.rootPath, packageFile);

    if (!fs.existsSync(pkgPath)) {
      return [];
    }

    const filename = path.basename(pkgPath);
    const manifest = MANIFEST_FILES.find((m) => m.filename === filename);
    const ecosystem = manifest?.ecosystem ?? 'npm';

    const deps = this.parseDependencies(pkgPath, ecosystem);
    return this.checkDependencies(deps, ecosystem);
  }

  private parseDependencies(
    filePath: string,
    ecosystem: Ecosystem,
  ): Record<string, string> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);

    switch (ecosystem) {
      case 'npm':
        return this.parsePackageJson(content);
      case 'python':
        if (filename === 'requirements.txt') return this.parseRequirementsTxt(content);
        if (filename === 'Pipfile') return this.parsePipfile(content);
        if (filename === 'pyproject.toml') return this.parsePyprojectToml(content);
        return {};
      case 'go':
        return this.parseGoMod(content);
      case 'java':
        if (filename === 'pom.xml') return this.parsePomXml(content);
        if (filename === 'build.gradle') return this.parseBuildGradle(content);
        return {};
      case 'rust':
        return this.parseCargoToml(content);
      case 'ruby':
        return this.parseGemfile(content);
      default:
        return {};
    }
  }

  private parsePackageJson(content: string): Record<string, string> {
    try {
      const pkg = JSON.parse(content);
      return {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
    } catch {
      return {};
    }
  }

  private parseRequirementsTxt(content: string): Record<string, string> {
    const deps: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

      // Handles: package==1.2.3, package>=1.2.3, package~=1.2.3, package<=1.2.3
      const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*([><=~!]+)\s*([^\s,;#]+)/);
      if (match) {
        deps[match[1].toLowerCase()] = match[3];
      } else {
        // Package without version pinned
        const nameOnly = trimmed.match(/^([a-zA-Z0-9_.-]+)/);
        if (nameOnly) {
          deps[nameOnly[1].toLowerCase()] = '*';
        }
      }
    }

    return deps;
  }

  private parsePipfile(content: string): Record<string, string> {
    const deps: Record<string, string> = {};
    let inPackagesSection = false;

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '[packages]' || trimmed === '[dev-packages]') {
        inPackagesSection = true;
        continue;
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inPackagesSection = false;
        continue;
      }

      if (inPackagesSection) {
        // Handles: package = "==1.2.3" or package = ">=1.2.3" or package = "*"
        const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*=\s*"([^"]+)"/);
        if (match) {
          const version = match[2].replace(/^[><=~!]+/, '');
          deps[match[1].toLowerCase()] = version;
        }
      }
    }

    return deps;
  }

  private parsePyprojectToml(content: string): Record<string, string> {
    const deps: Record<string, string> = {};
    let inDependencies = false;

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === 'dependencies = [' || trimmed.startsWith('[project.dependencies]') || trimmed.startsWith('[tool.poetry.dependencies]')) {
        inDependencies = true;
        continue;
      }

      if (inDependencies) {
        if (trimmed === ']' || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          inDependencies = false;
          continue;
        }

        // Handles: "package>=1.2.3", "package==1.2.3"
        const match = trimmed.match(/["']([a-zA-Z0-9_.-]+)\s*([><=~!]+)\s*([^"',\s]+)/);
        if (match) {
          deps[match[1].toLowerCase()] = match[3];
        }

        // Handles poetry-style: package = "^1.2.3" or package = {version = "^1.2.3"}
        const poetryMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*=\s*"([^"]+)"/);
        if (poetryMatch) {
          const version = poetryMatch[2].replace(/^[\^~>=<]+/, '');
          deps[poetryMatch[1].toLowerCase()] = version;
        }

        const poetryDictMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*=\s*\{.*version\s*=\s*"([^"]+)"/);
        if (poetryDictMatch) {
          const version = poetryDictMatch[2].replace(/^[\^~>=<]+/, '');
          deps[poetryDictMatch[1].toLowerCase()] = version;
        }
      }
    }

    return deps;
  }

  private parseGoMod(content: string): Record<string, string> {
    const deps: Record<string, string> = {};
    let inRequireBlock = false;

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('require (')) {
        inRequireBlock = true;
        continue;
      }
      if (inRequireBlock && trimmed === ')') {
        inRequireBlock = false;
        continue;
      }

      // Single-line require: require module v1.2.3
      const singleMatch = trimmed.match(/^require\s+(\S+)\s+(v[\d.]+)/);
      if (singleMatch) {
        deps[singleMatch[1]] = singleMatch[2].replace(/^v/, '');
        continue;
      }

      // Inside require block: module v1.2.3
      if (inRequireBlock) {
        const blockMatch = trimmed.match(/^(\S+)\s+(v[\d.]+[^\s]*)/);
        if (blockMatch) {
          deps[blockMatch[1]] = blockMatch[2].replace(/^v/, '');
        }
      }
    }

    return deps;
  }

  private parsePomXml(content: string): Record<string, string> {
    const deps: Record<string, string> = {};

    // Match <dependency> blocks with groupId, artifactId, and version
    const depRegex = /<dependency>\s*<groupId>[^<]*<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g;
    let match: RegExpExecArray | null;

    while ((match = depRegex.exec(content)) !== null) {
      const artifactId = match[1].trim();
      const version = match[2].trim();
      // Skip property references like ${project.version}
      if (!version.startsWith('$')) {
        deps[artifactId] = version;
      }
    }

    // Also try alternate ordering: artifactId before groupId
    const altRegex = /<dependency>\s*<artifactId>([^<]+)<\/artifactId>\s*<groupId>[^<]*<\/groupId>\s*<version>([^<]+)<\/version>/g;
    while ((match = altRegex.exec(content)) !== null) {
      const artifactId = match[1].trim();
      const version = match[2].trim();
      if (!version.startsWith('$')) {
        deps[artifactId] = version;
      }
    }

    return deps;
  }

  private parseBuildGradle(content: string): Record<string, string> {
    const deps: Record<string, string> = {};

    // Match: implementation 'group:artifact:version' or compile 'group:artifact:version'
    const singleQuote = /(?:implementation|compile|api|runtimeOnly|testImplementation)\s*['"]([^:]+):([^:]+):([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = singleQuote.exec(content)) !== null) {
      const artifactId = match[2].trim();
      const version = match[3].trim();
      deps[artifactId] = version;
    }

    // Match: implementation group: 'x', name: 'y', version: 'z'
    const mapStyle = /(?:implementation|compile|api|runtimeOnly|testImplementation)\s+group:\s*['"]([^'"]+)['"]\s*,\s*name:\s*['"]([^'"]+)['"]\s*,\s*version:\s*['"]([^'"]+)['"]/g;
    while ((match = mapStyle.exec(content)) !== null) {
      const artifactId = match[2].trim();
      const version = match[3].trim();
      deps[artifactId] = version;
    }

    return deps;
  }

  private parseCargoToml(content: string): Record<string, string> {
    const deps: Record<string, string> = {};
    let inDependencies = false;

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '[dependencies]' || trimmed === '[dev-dependencies]' || trimmed === '[build-dependencies]') {
        inDependencies = true;
        continue;
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inDependencies = false;
        continue;
      }

      if (inDependencies) {
        // Simple form: package = "1.2.3"
        const simpleMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
        if (simpleMatch) {
          deps[simpleMatch[1]] = simpleMatch[2];
          continue;
        }

        // Table form: package = { version = "1.2.3", ... }
        const tableMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{.*version\s*=\s*"([^"]+)"/);
        if (tableMatch) {
          deps[tableMatch[1]] = tableMatch[2];
        }
      }
    }

    return deps;
  }

  private parseGemfile(content: string): Record<string, string> {
    const deps: Record<string, string> = {};

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Match: gem 'name', '~> 1.2.3' or gem "name", ">= 1.2.3"
      const match = trimmed.match(/^gem\s+['"]([^'"]+)['"]\s*,\s*['"][~><=]+\s*([^'"]+)['"]/);
      if (match) {
        deps[match[1]] = match[2];
        continue;
      }

      // Match: gem 'name', '1.2.3' (exact version)
      const exactMatch = trimmed.match(/^gem\s+['"]([^'"]+)['"]\s*,\s*['"]([0-9][^'"]*)['"]/);
      if (exactMatch) {
        deps[exactMatch[1]] = exactMatch[2];
        continue;
      }

      // Match: gem 'name' (no version specified)
      const nameOnly = trimmed.match(/^gem\s+['"]([^'"]+)['"]/);
      if (nameOnly) {
        deps[nameOnly[1]] = '*';
      }
    }

    return deps;
  }

  private checkDependencies(
    deps: Record<string, string>,
    ecosystem: Ecosystem,
  ): EcosystemDependencyVulnerability[] {
    const vulnerabilities: EcosystemDependencyVulnerability[] = [];
    const ecosystemCves = KNOWN_CVES.filter((c) => c.ecosystem === ecosystem);

    for (const [name, versionSpec] of Object.entries(deps)) {
      if (versionSpec === '*') continue;

      const version = this.cleanVersion(versionSpec);
      const cves = ecosystemCves.filter((c) => c.package === name);

      for (const cve of cves) {
        if (this.isVulnerable(version, cve.vulnerableVersions, cve.patchedIn)) {
          vulnerabilities.push({
            package: name,
            version: versionSpec,
            severity: cve.severity,
            cveId: cve.cveId,
            title: cve.title,
            patchedIn: cve.patchedIn,
            advisory: cve.advisory,
            ecosystem,
          });
        }
      }
    }

    return vulnerabilities;
  }

  private cleanVersion(spec: string): string {
    return spec.replace(/^[\^~>=<]+/, '').split(' ')[0];
  }

  private isVulnerable(installed: string, vulnerableRange: string, patchedIn?: string): boolean {
    if (!patchedIn) return true;

    const installedParts = this.parseVersion(installed);
    const patchedParts = this.parseVersion(patchedIn);

    if (!installedParts || !patchedParts) return false;

    return this.compareVersions(installedParts, patchedParts) < 0;
  }

  private parseVersion(version: string): number[] | null {
    const clean = version.replace(/^[\^~>=<]+/, '').split('-')[0];
    const parts = clean.split('.').map(Number);
    if (parts.some(isNaN)) return null;
    return parts;
  }

  private compareVersions(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  }
}
