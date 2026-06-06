import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';

import { RepositoryIndexer } from '../knowledge/indexer';
import { MetadataStore } from '../knowledge/metadata-store';
import { ContextBuilder } from '../knowledge/context-builder';
import { DriftDetector } from '../knowledge/drift-detector';
import { DecisionStore } from '../decisions/decision-store';
import { ArchitectureDiscovery } from '../architecture/architecture-discovery';
import { ArchitectureStore } from '../architecture/architecture-store';
import { GraphStore } from '../architecture/graph-store';
import { ImpactAnalyzer } from '../architecture/impact-analyzer';
import { CrossRepoContextBuilder } from '../architecture/cross-repo-context';
import { GraphLinker } from '../architecture/graph-linker';
import { SkillStore } from '../knowledge/skill-store';
import { WorkflowEngine } from '../workflow/workflow-engine';
import { WorkflowMarketplace } from '../workflow/marketplace';
import { ArtifactStore } from '../workflow/artifact-store';
import { RefinementEngine } from '../workflow/refine';
import { Planner } from '../workflow/planner';
import { Validator } from '../workflow/validator';

import { TOOL_DEFINITIONS } from './tool-definitions';
import { ToolHandlers } from './tool-handlers';
import { RateLimiter } from '../security';
import { SecurityScanner, SecurityConventionsStore, DependencyAuditor, OwaspMapper, ThreatModeler } from '../security-intel';
import { RepoRegistry, FederatedSearch, TeamSync, AuditReporter, AnalyticsStore } from '../multi-repo';
import { BudgetTracker, BudgetEnforcer } from '../budget';
import { AuditStore, PostureScorer, KnowledgeExporter } from '../enterprise';
import { ComplianceChecker } from '../compliance';
import { loadConfig } from '../config/config-loader';

export class EosMcpServer {
  private server: Server;
  private rootPath: string;
  private toolHandlers!: ToolHandlers;
  private indexRateLimiter = new RateLimiter(1, 5);

  // Service instances
  private indexer: RepositoryIndexer;
  private metadataStore: MetadataStore;
  private contextBuilder!: ContextBuilder;
  private decisionStore: DecisionStore;
  private architectureDiscovery: ArchitectureDiscovery;
  private architectureStore: ArchitectureStore;
  private workflowEngine: WorkflowEngine;
  private artifactStore: ArtifactStore;
  private refinementEngine: RefinementEngine;
  private planner: Planner;
  private validator: Validator;
  private securityScanner: SecurityScanner;
  private securityConventionsStore: SecurityConventionsStore;
  private dependencyAuditor: DependencyAuditor;
  private owaspMapper: OwaspMapper;
  private threatModeler: ThreatModeler;
  private repoRegistry: RepoRegistry;
  private federatedSearch: FederatedSearch;
  private teamSync: TeamSync;
  private auditReporter: AuditReporter;
  private analyticsStore: AnalyticsStore;
  private marketplace: WorkflowMarketplace;
  private auditStore: AuditStore;
  private complianceChecker: ComplianceChecker;
  private postureScorer: PostureScorer;
  private knowledgeExporter: KnowledgeExporter;
  private graphStore: GraphStore;
  private graphLinker!: GraphLinker;
  private impactAnalyzer!: ImpactAnalyzer;
  private crossRepoContextBuilder!: CrossRepoContextBuilder;
  private skillStore: SkillStore;
  private driftDetector!: DriftDetector;
  private budgetTracker!: BudgetTracker;
  private budgetEnforcer!: BudgetEnforcer;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    const eosDir = path.join(rootPath, '.eos');

    // Initialize the MCP server
    this.server = new Server(
      { name: 'engineering-os', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    // Initialize all services with paths relative to .eos/
    this.indexer = new RepositoryIndexer(rootPath);
    this.metadataStore = new MetadataStore(path.join(eosDir, 'index', 'metadata.db'));
    this.decisionStore = new DecisionStore(path.join(eosDir, 'knowledge', 'decisions'));
    this.architectureDiscovery = new ArchitectureDiscovery(rootPath);
    this.architectureStore = new ArchitectureStore(path.join(eosDir, 'knowledge', 'architecture'));
    this.workflowEngine = new WorkflowEngine(path.join(eosDir, 'workflows'));
    this.artifactStore = new ArtifactStore(path.join(eosDir, 'features'));
    this.refinementEngine = new RefinementEngine();
    this.planner = new Planner(path.join(eosDir, 'features'));
    this.validator = new Validator(rootPath);
    this.securityScanner = new SecurityScanner(rootPath);
    this.securityConventionsStore = new SecurityConventionsStore(path.join(eosDir, 'knowledge'));
    this.dependencyAuditor = new DependencyAuditor(rootPath);
    this.owaspMapper = new OwaspMapper();
    this.threatModeler = new ThreatModeler();
    this.marketplace = new WorkflowMarketplace(
      path.join(eosDir, 'workflows'),
      path.join(eosDir, 'workflows', 'registry.yaml')
    );
    this.repoRegistry = new RepoRegistry(eosDir);
    this.federatedSearch = new FederatedSearch(this.repoRegistry);
    this.teamSync = new TeamSync(eosDir);
    this.auditReporter = new AuditReporter(eosDir);
    this.analyticsStore = new AnalyticsStore(path.join(eosDir, 'traces', 'analytics.db'));
    this.auditStore = new AuditStore(path.join(eosDir, 'traces', 'audit.db'));
    this.complianceChecker = new ComplianceChecker(rootPath);
    this.postureScorer = new PostureScorer(path.join(eosDir, 'traces', 'analytics.db'));
    this.knowledgeExporter = new KnowledgeExporter(eosDir);
    this.graphStore = new GraphStore(path.join(eosDir, 'graph', 'services.db'));
    this.skillStore = new SkillStore(eosDir);
  }

  async initialize(): Promise<void> {
    // Load project config for budget enforcement
    const config = await loadConfig(this.rootPath);
    const enforcement = config.budgets.enforcement ?? { mode: 'soft', warnThreshold: 0.8 };
    this.budgetTracker = new BudgetTracker(config.budgets);
    this.budgetEnforcer = new BudgetEnforcer(this.budgetTracker, enforcement, config.budgets);

    // Initialize stores that require async setup
    this.metadataStore.initialize();
    this.analyticsStore.initialize();
    this.auditStore.initialize();
    this.postureScorer.initialize();
    this.graphStore.initialize();

    // Initialize v2 cross-repo architecture intelligence
    this.graphLinker = new GraphLinker(this.graphStore, this.repoRegistry, path.join(this.rootPath, '.eos'));
    this.impactAnalyzer = new ImpactAnalyzer(this.graphStore);
    this.crossRepoContextBuilder = new CrossRepoContextBuilder(this.graphStore, this.repoRegistry);

    // Create DriftDetector (depends on initialized metadataStore)
    this.driftDetector = new DriftDetector(this.rootPath, this.metadataStore, this.indexer);

    // Create ContextBuilder (depends on initialized stores)
    this.contextBuilder = new ContextBuilder(this.metadataStore, {
      decisionStore: this.decisionStore,
      architectureStore: this.architectureStore,
      artifactStore: this.artifactStore,
    });

    // Create tool handlers with all service dependencies
    this.toolHandlers = new ToolHandlers({
      indexer: this.indexer,
      metadataStore: this.metadataStore,
      contextBuilder: this.contextBuilder,
      decisionStore: this.decisionStore,
      architectureDiscovery: this.architectureDiscovery,
      architectureStore: this.architectureStore,
      graphStore: this.graphStore,
      graphLinker: this.graphLinker,
      impactAnalyzer: this.impactAnalyzer,
      crossRepoContextBuilder: this.crossRepoContextBuilder,
      workflowEngine: this.workflowEngine,
      artifactStore: this.artifactStore,
      refinementEngine: this.refinementEngine,
      planner: this.planner,
      validator: this.validator,
      securityScanner: this.securityScanner,
      securityConventionsStore: this.securityConventionsStore,
      dependencyAuditor: this.dependencyAuditor,
      owaspMapper: this.owaspMapper,
      threatModeler: this.threatModeler,
      repoRegistry: this.repoRegistry,
      federatedSearch: this.federatedSearch,
      teamSync: this.teamSync,
      auditReporter: this.auditReporter,
      analyticsStore: this.analyticsStore,
      budgetEnforcer: this.budgetEnforcer,
      budgetTracker: this.budgetTracker,
      marketplace: this.marketplace,
      auditStore: this.auditStore,
      complianceChecker: this.complianceChecker,
      postureScorer: this.postureScorer,
      knowledgeExporter: this.knowledgeExporter,
      driftDetector: this.driftDetector,
      skillStore: this.skillStore,
      rootPath: this.rootPath,
    });

    // Register MCP tool handlers
    this.registerTools();
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  private registerTools(): void {
    // Register ListTools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOL_DEFINITIONS.map((def) => ({
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema,
        })),
      };
    });

    // Register CallTool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Rate-limit expensive operations that walk the filesystem
      if (name === 'eos_index' || name === 'eos_security_scan' || name === 'eos_security_audit') {
        return this.indexRateLimiter.execute(() =>
          this.toolHandlers.handle(name, (args as Record<string, unknown>) ?? {})
        );
      }

      return this.toolHandlers.handle(name, (args as Record<string, unknown>) ?? {});
    });
  }
}
