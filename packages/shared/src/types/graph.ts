/** Service node in the cross-repo dependency graph */
export interface GraphService {
  id: string;
  repoName: string;
  serviceName: string;
  description?: string;
  owners: string[];
  criticality: 'low' | 'medium' | 'high' | 'critical';
  lastDiscovered: string;
}

/** Connection (edge) between two services */
export interface GraphConnection {
  id?: number;
  sourceService: string;
  targetService: string;
  protocol: ConnectionProtocol;
  contractRef?: string;
  dataFlow: DataFlowType;
  description?: string;
  lastVerified: string;
}

export type ConnectionProtocol = 'rest' | 'grpc' | 'graphql' | 'event' | 'import' | 'database';
export type DataFlowType = 'request' | 'publish' | 'subscribe' | 'import' | 'query';

/** API contract shared between services */
export interface GraphContract {
  id: string;
  repoName: string;
  filePath: string;
  type: ContractType;
  version?: string;
  endpoints: ContractEndpoint[];
  lastModified: string;
}

export type ContractType = 'openapi' | 'grpc' | 'graphql' | 'typescript' | 'event-schema';

export interface ContractEndpoint {
  method?: string;
  path: string;
  name?: string;
  description?: string;
}

/** Data ownership mapping */
export interface DataOwnership {
  entity: string;
  ownerService: string;
  accessType: 'owner' | 'reader' | 'writer';
}

/** Impact analysis result */
export interface ImpactResult {
  changedService: string;
  changedFile: string;
  affectedServices: AffectedService[];
  affectedContracts: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
}

export interface AffectedService {
  serviceId: string;
  repoName: string;
  serviceName: string;
  protocol: ConnectionProtocol;
  contractRef?: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
}

/** Cross-repo context bundle (appended to regular context) */
export interface CrossRepoContext {
  currentService?: GraphService;
  consumers: ServiceConsumer[];
  providers: ServiceProvider[];
  relevantContracts: GraphContract[];
  conventions: string[];
  warnings: string[];
}

export interface ServiceConsumer {
  service: GraphService;
  protocol: ConnectionProtocol;
  endpoints: string[];
}

export interface ServiceProvider {
  service: GraphService;
  protocol: ConnectionProtocol;
  endpoints: string[];
}

/** Mermaid diagram output */
export interface GraphDiagram {
  mermaid: string;
  services: number;
  connections: number;
}

/** Contract discovery result from scanning a repo */
export interface DiscoveredContract {
  filePath: string;
  type: ContractType;
  endpoints: ContractEndpoint[];
  version?: string;
}

/** Detected outbound call from code analysis */
export interface DetectedCall {
  sourceFile: string;
  targetUrl?: string;
  targetPackage?: string;
  protocol: ConnectionProtocol;
  evidence: string;
}
