/**
 * MCP Tool definitions for Engineering OS.
 * Each tool is defined with its name, description, and JSON Schema input.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'eos_search',
    description: 'Semantic search across code, docs, decisions, and patterns',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        scope: {
          type: 'string',
          enum: ['code', 'docs', 'decisions', 'all'],
          description: 'Search scope (defaults to all)',
        },
        limit: { type: 'number', description: 'Max results to return', default: 10 },
        format: { type: 'string', enum: ['markdown', 'json'], description: 'Output format (defaults to markdown)', default: 'markdown' },
      },
      required: ['query'],
    },
  },
  {
    name: 'eos_context',
    description: 'Assemble a focused context bundle for a task (optimized for token budget)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task: { type: 'string', description: 'Task description to build context for' },
        maxTokens: {
          type: 'number',
          description: 'Maximum token budget for the context bundle',
          default: 8000,
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'eos_explain',
    description: 'Explain a service/module at system level including boundaries, purpose, and dependencies',
    inputSchema: {
      type: 'object' as const,
      properties: {
        target: { type: 'string', description: 'Service or module name to explain' },
      },
      required: ['target'],
    },
  },
  {
    name: 'eos_dependencies',
    description: 'Map dependencies for a file or module (what it imports and what depends on it)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        target: { type: 'string', description: 'File path or module name to analyze' },
      },
      required: ['target'],
    },
  },
  {
    name: 'eos_decide',
    description: 'Record an engineering decision with rationale, alternatives, and context',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Decision title' },
        context: { type: 'string', description: 'Context and background for the decision' },
        decision: { type: 'string', description: 'The decision that was made' },
        rationale: { type: 'string', description: 'Why this decision was chosen' },
        alternatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              option: { type: 'string', description: 'Alternative option considered' },
              proscons: { type: 'string', description: 'Pros and cons of the alternative' },
            },
            required: ['option'],
          },
          description: 'Alternatives that were considered',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization',
        },
        status: {
          type: 'string',
          enum: ['accepted', 'proposed', 'deprecated', 'superseded'],
          description: 'Decision status',
          default: 'accepted',
        },
      },
      required: ['title', 'context', 'decision', 'rationale'],
    },
  },
  {
    name: 'eos_recall_decision',
    description: 'Retrieve why a past engineering choice was made by searching decision records',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query to find relevant decisions' },
      },
      required: ['query'],
    },
  },
  {
    name: 'eos_alternatives',
    description: 'Show what options were considered and rejected for a given decision',
    inputSchema: {
      type: 'object' as const,
      properties: {
        decisionId: { type: 'string', description: 'Decision ID (e.g., DEC-001)' },
      },
      required: ['decisionId'],
    },
  },
  {
    name: 'eos_architecture',
    description: 'Return service boundaries, ownership, dependencies, and contracts',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service: {
          type: 'string',
          description: 'Optional service name to filter results. Omit for full architecture overview.',
        },
      },
      required: [],
    },
  },
  {
    name: 'eos_patterns',
    description: 'Return preferred implementation patterns for a given code area',
    inputSchema: {
      type: 'object' as const,
      properties: {
        area: {
          type: 'string',
          description: 'Code area or pattern type (e.g., "frontend", "backend", "api")',
        },
      },
      required: [],
    },
  },
  {
    name: 'eos_conventions',
    description: 'Return team conventions including naming, file structure, error handling, and export style',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'eos_refine',
    description: 'Refine a raw requirement into a structured specification with user stories, acceptance criteria, edge cases, and risks',
    inputSchema: {
      type: 'object' as const,
      properties: {
        requirement: {
          type: 'string',
          description: 'Raw requirement text to refine into a structured specification',
        },
      },
      required: ['requirement'],
    },
  },
  {
    name: 'eos_plan',
    description: 'Generate an execution plan with parallel task groups from a specification',
    inputSchema: {
      type: 'object' as const,
      properties: {
        featureSlug: {
          type: 'string',
          description: 'Feature identifier slug (e.g., "user-auth", "payment-flow")',
        },
        requirement: {
          type: 'string',
          description: 'Requirement text to plan from. If omitted, uses existing refined spec.',
        },
      },
      required: ['featureSlug'],
    },
  },
  {
    name: 'eos_validate',
    description: 'Validate implementation against the execution plan and conventions',
    inputSchema: {
      type: 'object' as const,
      properties: {
        featureSlug: {
          type: 'string',
          description: 'Feature identifier slug to validate',
        },
      },
      required: ['featureSlug'],
    },
  },
  {
    name: 'eos_review',
    description: 'Generate architecture-aware code review based on patterns, conventions, and the execution plan',
    inputSchema: {
      type: 'object' as const,
      properties: {
        featureSlug: {
          type: 'string',
          description: 'Feature identifier slug to review',
        },
      },
      required: ['featureSlug'],
    },
  },
  {
    name: 'eos_index',
    description: 'Index or re-index the repository for semantic search. Parses code into chunks and stores embeddings.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific file paths to index. If omitted, indexes entire repository.',
        },
        force: {
          type: 'boolean',
          description: 'Force re-index even if files have not changed',
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: 'eos_status',
    description: 'Show current workflow state, progress of active features, and next actionable stages',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'eos_health',
    description: 'Report knowledge quality metrics including index coverage, staleness, and relationship completeness',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'eos_security_scan',
    description: 'Scan codebase for security vulnerabilities (secrets, injection, XSS, path traversal, insecure configs) using regex and entropy analysis',
    inputSchema: {
      type: 'object' as const,
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific paths to scan (defaults to entire repo)',
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['secret', 'injection', 'xss', 'path-traversal', 'insecure-config'],
          },
          description: 'Filter by finding category',
        },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low', 'info'],
          description: 'Minimum severity threshold (only report this severity and above)',
        },
        excludePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional regex patterns for files to exclude (test files and convention definitions are excluded by default)',
        },
        includeTestFiles: {
          type: 'boolean',
          description: 'Set to true to disable default test/fixture file exclusions (default: false)',
        },
      },
      required: [],
    },
  },
  {
    name: 'eos_security_conventions',
    description: 'Return project security conventions and best practices',
    inputSchema: {
      type: 'object' as const,
      properties: {
        language: { type: 'string', description: 'Filter by programming language' },
        category: {
          type: 'string',
          description: 'Filter by security category (auth, crypto, input-validation, secrets, logging, config)',
        },
      },
      required: [],
    },
  },
  {
    name: 'eos_security_audit',
    description: 'Full security audit: vulnerability scan + dependency CVE check + OWASP Top 10 mapping',
    inputSchema: {
      type: 'object' as const,
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths to audit (defaults to entire repo)',
        },
        includeDependencies: {
          type: 'boolean',
          description: 'Include dependency vulnerability check',
          default: true,
        },
      },
      required: [],
    },
  },
  {
    name: 'eos_dependency_check',
    description: 'Check project dependencies for known CVEs by parsing package.json',
    inputSchema: {
      type: 'object' as const,
      properties: {
        packageFile: {
          type: 'string',
          description: 'Path to package.json (defaults to project root)',
        },
      },
      required: [],
    },
  },
  {
    name: 'eos_threat_model',
    description: 'Generate a STRIDE-based threat model for a feature specification',
    inputSchema: {
      type: 'object' as const,
      properties: {
        featureSlug: {
          type: 'string',
          description: 'Feature identifier slug',
        },
        specification: {
          type: 'string',
          description: 'Feature specification text to analyze for threats',
        },
        components: {
          type: 'array',
          items: { type: 'string' },
          description: 'Components involved in the feature (for threat attribution)',
        },
      },
      required: ['featureSlug', 'specification'],
    },
  },
  {
    name: 'eos_link_repo',
    description: 'Link another repository for federated search and knowledge sharing',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the linked repo (e.g., "backend-api")' },
        path: { type: 'string', description: 'Absolute path to the repository' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for filtering (e.g., "backend", "frontend", "shared")',
        },
      },
      required: ['name', 'path'],
    },
  },
  {
    name: 'eos_unlink_repo',
    description: 'Remove a linked repository from the multi-repo graph',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name of the linked repo to remove' },
      },
      required: ['name'],
    },
  },
  {
    name: 'eos_search_all',
    description: 'Search across all linked repositories (federated search)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        repos: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific repo names (defaults to all linked repos)',
        },
        limit: { type: 'number', description: 'Max results per repo', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'eos_team_sync',
    description: 'View or manage team conventions, patterns, and security policies',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'add-convention', 'add-pattern', 'add-policy', 'sync'],
          description: 'Action to perform',
        },
        name: { type: 'string', description: 'Name for the convention/pattern/policy' },
        rule: { type: 'string', description: 'Rule text for conventions/policies' },
        description: { type: 'string', description: 'Description of the convention/pattern' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Severity for security policies' },
        category: { type: 'string', description: 'Category for security policies' },
        usage: { type: 'string', description: 'Usage area for patterns' },
        enforced: { type: 'boolean', description: 'Whether to enforce this rule', default: true },
        remotePath: { type: 'string', description: 'Path to remote .eos/ dir for sync action' },
      },
      required: ['action'],
    },
  },
  {
    name: 'eos_audit_report',
    description: 'Generate or retrieve exportable security audit reports',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['generate', 'list', 'get', 'export'],
          description: 'Action to perform',
        },
        reportId: { type: 'string', description: 'Report ID for get/export actions' },
        format: {
          type: 'string',
          enum: ['json', 'markdown'],
          description: 'Export format (defaults to markdown)',
          default: 'markdown',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'eos_analytics',
    description: 'View tool usage analytics and performance metrics',
    inputSchema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'week', 'month', 'all'],
          description: 'Time period for stats (defaults to month)',
          default: 'month',
        },
      },
      required: [],
    },
  },
  {
    name: 'eos_marketplace',
    description: 'Browse, install, or manage workflow templates from the marketplace',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'install', 'categories'],
          description: 'Action to perform',
        },
        name: { type: 'string', description: 'Template name (for get/install actions)' },
        category: { type: 'string', description: 'Filter by category (for list action)' },
        yaml: { type: 'string', description: 'YAML content to install (for install action)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'eos_posture_score',
    description: 'Compute security posture score (0-100) from scan results, dependency vulns, and convention compliance. Tracks trend over time.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Number of days for trend history (default 30)', default: 30 },
      },
      required: [],
    },
  },
  {
    name: 'eos_compliance_check',
    description: 'Check codebase against a compliance framework (SOC2, HIPAA, PCI-DSS)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        framework: {
          type: 'string',
          enum: ['soc2', 'hipaa', 'pci-dss'],
          description: 'Compliance framework to check against',
        },
      },
      required: ['framework'],
    },
  },
  {
    name: 'eos_export',
    description: 'Export .eos/ knowledge as a portable JSON archive for air-gapped/on-prem environments',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outputPath: { type: 'string', description: 'File path to write the archive (defaults to .eos/exports/<timestamp>.json)' },
        repoName: { type: 'string', description: 'Repository name for the archive metadata' },
      },
      required: [],
    },
  },
  {
    name: 'eos_audit_log',
    description: 'Query the audit trail of all MCP tool calls (timestamps, users, args, results)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tool: { type: 'string', description: 'Filter by tool name' },
        user: { type: 'string', description: 'Filter by user' },
        since: { type: 'string', description: 'Start time (ISO 8601)' },
        until: { type: 'string', description: 'End time (ISO 8601)' },
        limit: { type: 'number', description: 'Max entries to return (default 50)', default: 50 },
      },
      required: [],
    },
  },
  // --- Cross-Repo Architecture Intelligence (v2) ---
  {
    name: 'eos_graph',
    description: 'Query the cross-repo service dependency graph. List services, connections, find paths between services, and generate architecture diagrams.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['list-services', 'list-connections', 'find-path', 'diagram', 'stats'],
          description: 'Graph query action',
        },
        repo: { type: 'string', description: 'Filter by repository name' },
        from: { type: 'string', description: 'Source service ID (for find-path)' },
        to: { type: 'string', description: 'Target service ID (for find-path)' },
        protocol: { type: 'string', enum: ['rest', 'grpc', 'graphql', 'event', 'import', 'database'], description: 'Filter connections by protocol' },
      },
      required: ['action'],
    },
  },
  {
    name: 'eos_impact',
    description: 'Analyze the impact of a change. Shows which services, repos, and contracts would be affected by modifying a file, service, or endpoint.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['file', 'service', 'endpoint'],
          description: 'Type of change to analyze',
        },
        repo: { type: 'string', description: 'Repository containing the change' },
        target: { type: 'string', description: 'File path, service ID, or endpoint path' },
        method: { type: 'string', description: 'HTTP method (for endpoint type)' },
      },
      required: ['type', 'target'],
    },
  },
  {
    name: 'eos_contracts',
    description: 'List and view API contracts between services. Shows OpenAPI specs, gRPC protos, GraphQL schemas, and event schemas discovered across repos.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        repo: { type: 'string', description: 'Filter by repository' },
        type: { type: 'string', enum: ['openapi', 'grpc', 'graphql', 'typescript', 'event-schema'], description: 'Filter by contract type' },
        id: { type: 'string', description: 'Get a specific contract by ID' },
      },
      required: [],
    },
  },
  {
    name: 'eos_owners',
    description: 'Query ownership of services and data entities. Shows which team owns a service or which services access a data entity.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service: { type: 'string', description: 'Service ID to look up owners for' },
        entity: { type: 'string', description: 'Data entity name to look up ownership for' },
      },
      required: [],
    },
  },
  {
    name: 'eos_cross_context',
    description: 'Get cross-repo context for a task. Returns consumers, providers, contracts, and conventions relevant to the current service and task.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task: { type: 'string', description: 'Task description to build cross-repo context for' },
        repo: { type: 'string', description: 'Current repository name' },
        maxTokens: { type: 'number', description: 'Max token budget for cross-repo context', default: 4000 },
      },
      required: ['task'],
    },
  },
  {
    name: 'eos_discover_contracts',
    description: 'Scan a repository to discover API contracts and outbound service calls. Updates the service dependency graph.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        repo: { type: 'string', description: 'Repository name to scan (defaults to current)' },
        path: { type: 'string', description: 'Path to the repository root' },
      },
      required: [],
    },
  },
  {
    name: 'eos_learn',
    description: 'Record a discovery, pattern, gotcha, or connection learned during this session. EOS remembers it permanently for all future sessions. Use this whenever you discover something about the codebase that would be valuable to know next time.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['connection', 'pattern', 'gotcha', 'convention', 'shortcut'],
          description: 'What kind of knowledge: connection (service A calls B), pattern (how to do X), gotcha (don\'t do X because Y), convention (always do X this way), shortcut (file X is at path Y)',
        },
        name: { type: 'string', description: 'Short name for this skill (e.g., "FlatList useMemo gotcha")' },
        content: { type: 'string', description: 'What was learned — the actual knowledge to retain' },
        context: { type: 'string', description: 'When this applies — what triggers this knowledge to be relevant' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for searchability (e.g., ["react-native", "performance", "FlatList"])',
        },
      },
      required: ['type', 'content'],
    },
  },
  {
    name: 'eos_recall_skills',
    description: 'Recall learned skills relevant to the current task. Returns gotchas, patterns, and shortcuts that were previously discovered.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'What are you working on? Skills matching this context are returned.' },
        type: { type: 'string', enum: ['connection', 'pattern', 'gotcha', 'convention', 'shortcut', 'all'], description: 'Filter by skill type (default: all)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'eos_build',
    description: 'Autonomously plan a feature: validates the requirement (product), maps to services (tech), creates an execution plan with specialist assignments. Returns a structured plan that can be executed step by step.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        requirement: { type: 'string', description: 'What to build — a feature requirement in plain English' },
        mode: {
          type: 'string',
          enum: ['plan-only', 'implement', 'full'],
          description: 'plan-only: just produce the plan. implement: plan + implementation prompts. full: plan + implement + test + review.',
          default: 'plan-only',
        },
        repos: {
          type: 'array',
          items: { type: 'string' },
          description: 'Limit to specific repos (defaults to all workspace repos)',
        },
      },
      required: ['requirement'],
    },
  },
];
