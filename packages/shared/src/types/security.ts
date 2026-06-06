export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory =
  | 'secret'
  | 'injection'
  | 'xss'
  | 'path-traversal'
  | 'insecure-config'
  | 'dependency';

export interface SecurityFinding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  description: string;
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  remediation: string;
  cweId?: string;
  owaspCategory?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SecurityScanResult {
  scanId: string;
  timestamp: string;
  duration: number;
  filesScanned: number;
  filesExcluded?: number;
  findings: SecurityFinding[];
  summary: Record<Severity, number>;
}

export interface SecurityConvention {
  id: string;
  category: string;
  rule: string;
  description: string;
  language: string;
  severity: Severity;
  examples: { bad: string; good: string }[];
  references: string[];
}

export interface DependencyVulnerability {
  package: string;
  version: string;
  severity: Severity;
  cveId: string;
  title: string;
  patchedIn?: string;
  advisory: string;
}

export interface SecurityAuditResult {
  scanResult: SecurityScanResult;
  dependencyVulnerabilities: DependencyVulnerability[];
  owaspCoverage: Record<string, { findings: number; status: 'pass' | 'warn' | 'fail' }>;
  overallRisk: Severity;
  recommendations: string[];
}

export interface Detector {
  category: FindingCategory;
  detect(filePath: string, content: string, lines: string[]): SecurityFinding[];
}

export type ThreatCategory =
  | 'spoofing'
  | 'tampering'
  | 'repudiation'
  | 'information-disclosure'
  | 'denial-of-service'
  | 'elevation-of-privilege';

export interface Threat {
  id: string;
  category: ThreatCategory;
  title: string;
  description: string;
  severity: Severity;
  affectedComponent: string;
  mitigations: string[];
}

export interface ThreatModel {
  featureSlug: string;
  timestamp: string;
  dataFlows: string[];
  trustBoundaries: string[];
  threats: Threat[];
  recommendations: string[];
}
