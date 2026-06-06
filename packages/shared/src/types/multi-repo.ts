/** Configuration for a linked repository in the multi-repo graph */
export interface LinkedRepo {
  name: string;
  path: string;
  eosDir: string;
  lastSynced?: string;
  tags?: string[];
}

/** Multi-repo configuration stored in .eos/config.yaml */
export interface MultiRepoConfig {
  linkedRepos: LinkedRepo[];
  syncConventions: boolean;
  syncPatterns: boolean;
  syncDecisions: boolean;
}

/** Result from a federated search across multiple repos */
export interface FederatedSearchResult {
  repo: string;
  repoPath: string;
  results: FederatedResultItem[];
}

export interface FederatedResultItem {
  type: 'code' | 'decision' | 'pattern' | 'convention';
  filePath: string;
  name: string;
  score: number;
  content: string;
  startLine?: number;
  endLine?: number;
}

/** Team sync manifest — shared across team members via git */
export interface TeamManifest {
  version: string;
  team: string;
  lastUpdated: string;
  conventions: ConventionEntry[];
  patterns: PatternEntry[];
  securityPolicies: SecurityPolicyEntry[];
}

export interface ConventionEntry {
  id: string;
  name: string;
  rule: string;
  description: string;
  examples: string[];
  enforced: boolean;
  addedBy?: string;
  addedAt?: string;
}

export interface PatternEntry {
  id: string;
  name: string;
  description: string;
  usage: string;
  template?: string;
  addedBy?: string;
  addedAt?: string;
}

export interface SecurityPolicyEntry {
  id: string;
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  enforced: boolean;
}

/** Analytics event for tracking tool usage */
export interface AnalyticsEvent {
  timestamp: string;
  tool: string;
  duration: number;
  success: boolean;
  repoName?: string;
  metadata?: Record<string, unknown>;
  tokensEmitted?: number;
  stage?: string;
  featureSlug?: string;
}

/** Security audit report (exportable) */
export interface AuditReport {
  id: string;
  generatedAt: string;
  repoName: string;
  summary: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    dependencyVulnerabilities: number;
    owaspCoverage: Record<string, string>;
  };
  findings: AuditReportFinding[];
  recommendations: string[];
}

export interface AuditReportFinding {
  severity: string;
  title: string;
  filePath: string;
  line: number;
  category: string;
  cweId?: string;
  remediation: string;
  snippet: string;
}
