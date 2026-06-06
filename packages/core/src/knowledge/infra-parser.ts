import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', 'vendor', '__pycache__', '.eos', '.turbo', 'target',
]);

const MAX_FILE_SIZE = 512 * 1024;

export interface InfraNode {
  name: string;
  type: 'service' | 'database' | 'cache' | 'queue' | 'storage' | 'ml-pipeline' | 'function' | 'gateway';
  provider?: string;
  file: string;
  line?: number;
  properties: Record<string, string>;
}

export interface InfraConnection {
  from: string;
  to: string;
  type: 'depends_on' | 'connects_to' | 'publishes_to' | 'reads_from' | 'env_ref';
  detail?: string;
  file: string;
}

export interface InfraTopology {
  nodes: InfraNode[];
  connections: InfraConnection[];
}

export class InfraParser {
  constructor(private rootPath: string) {}

  parse(): InfraTopology {
    const nodes: InfraNode[] = [];
    const connections: InfraConnection[] = [];

    const files = this.collectInfraFiles();

    for (const filePath of files) {
      const content = this.readSafe(filePath);
      if (!content) continue;

      const relativePath = path.relative(this.rootPath, filePath);
      const basename = path.basename(filePath).toLowerCase();

      if (basename.startsWith('docker-compose')) {
        this.parseDockerCompose(content, relativePath, nodes, connections);
      } else if (this.isKubernetesManifest(relativePath, content)) {
        this.parseKubernetesManifest(content, relativePath, nodes, connections);
      } else if (basename.endsWith('.tf')) {
        this.parseTerraform(content, relativePath, nodes, connections);
      } else if (this.isEnvFile(basename)) {
        this.parseEnvFile(content, relativePath, nodes, connections);
      } else if (basename === 'procfile') {
        this.parseProcfile(content, relativePath, nodes);
      } else if (basename === 'fly.toml') {
        this.parseFlyToml(content, relativePath, nodes);
      } else if (basename === 'render.yaml' || basename === 'render.yml') {
        this.parseRenderYaml(content, relativePath, nodes);
      }
    }

    return { nodes, connections };
  }

  // --- Docker Compose ---

  private parseDockerCompose(
    content: string,
    file: string,
    nodes: InfraNode[],
    connections: InfraConnection[],
  ): void {
    const lines = content.split('\n');
    let inServices = false;
    let currentService: string | null = null;
    let serviceIndent = 0;
    let currentSection: string | null = null;
    let sectionIndent = 0;

    const serviceProps: Map<string, Record<string, string>> = new Map();
    const serviceDeps: Map<string, string[]> = new Map();
    const serviceEnvs: Map<string, string[]> = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimEnd();
      const indent = line.length - line.trimStart().length;

      if (trimmed.match(/^services:\s*$/)) {
        inServices = true;
        serviceIndent = indent + 2;
        currentService = null;
        continue;
      }

      if (inServices && indent === 0 && trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('services:')) {
        inServices = false;
        currentService = null;
        continue;
      }

      if (!inServices) continue;

      const serviceMatch = trimmed.match(/^(\w[\w.-]*):\s*$/);
      if (serviceMatch && indent <= serviceIndent) {
        currentService = serviceMatch[1];
        serviceProps.set(currentService, {});
        serviceDeps.set(currentService, []);
        serviceEnvs.set(currentService, []);
        currentSection = null;
        continue;
      }

      if (!currentService) continue;

      const props = serviceProps.get(currentService)!;

      const imageMatch = trimmed.match(/^\s*image:\s*(.+)/);
      if (imageMatch) {
        props['image'] = imageMatch[1].trim().replace(/['"]/g, '');
      }

      const buildMatch = trimmed.match(/^\s*build:\s*(.+)/);
      if (buildMatch && buildMatch[1].trim() !== '') {
        props['build'] = buildMatch[1].trim().replace(/['"]/g, '');
      }

      if (trimmed.match(/^\s*ports:\s*$/)) {
        currentSection = 'ports';
        sectionIndent = indent;
        continue;
      }

      if (trimmed.match(/^\s*depends_on:\s*$/)) {
        currentSection = 'depends_on';
        sectionIndent = indent;
        continue;
      }

      if (trimmed.match(/^\s*environment:\s*$/)) {
        currentSection = 'environment';
        sectionIndent = indent;
        continue;
      }

      if (currentSection && indent <= sectionIndent && trimmed.length > 0 && !trimmed.startsWith('-') && !trimmed.startsWith('#')) {
        currentSection = null;
      }

      if (currentSection === 'ports') {
        const portMatch = trimmed.match(/^\s*-\s*['"]?(\d+(?::\d+)?)['"]?/);
        if (portMatch) {
          const existing = props['ports'];
          props['ports'] = existing ? `${existing},${portMatch[1]}` : portMatch[1];
        }
      }

      if (currentSection === 'depends_on') {
        const depMatch = trimmed.match(/^\s*-\s*(\w[\w.-]*)/);
        if (depMatch) {
          serviceDeps.get(currentService)!.push(depMatch[1]);
        }
        const depKeyMatch = trimmed.match(/^\s*(\w[\w.-]*):\s*$/);
        if (depKeyMatch && indent > sectionIndent) {
          serviceDeps.get(currentService)!.push(depKeyMatch[1]);
        }
      }

      if (currentSection === 'environment') {
        const envLineMatch = trimmed.match(/^\s*-?\s*['"]?(\w+)=(.*)['"]?/);
        if (envLineMatch) {
          serviceEnvs.get(currentService)!.push(`${envLineMatch[1]}=${envLineMatch[2]}`);
        }
        const envKeyMatch = trimmed.match(/^\s*(\w+):\s*(.+)/);
        if (envKeyMatch && indent > sectionIndent) {
          serviceEnvs.get(currentService)!.push(`${envKeyMatch[1]}=${envKeyMatch[2]}`);
        }
      }
    }

    for (const [name, props] of serviceProps) {
      const nodeType = this.inferServiceType(name, props['image'] || '');
      nodes.push({
        name,
        type: nodeType,
        provider: 'docker',
        file,
        properties: props,
      });

      const deps = serviceDeps.get(name) || [];
      for (const dep of deps) {
        connections.push({
          from: name,
          to: dep,
          type: 'depends_on',
          file,
        });
      }

      const envs = serviceEnvs.get(name) || [];
      for (const env of envs) {
        const parsed = this.parseEnvReference(env);
        if (parsed) {
          connections.push({
            from: name,
            to: parsed.target,
            type: 'env_ref',
            detail: parsed.detail,
            file,
          });
        }
      }
    }
  }

  // --- Kubernetes ---

  private isKubernetesManifest(relativePath: string, content: string): boolean {
    const dir = path.dirname(relativePath).toLowerCase();
    const isK8sDir = dir.includes('k8s') || dir.includes('deploy') || dir.includes('kubernetes') || dir.includes('manifests');
    const hasKind = /^kind:\s*(Deployment|Service|ConfigMap|Ingress|StatefulSet|DaemonSet|Job|CronJob)/m.test(content);
    return (isK8sDir || hasKind) && content.includes('apiVersion:');
  }

  private parseKubernetesManifest(
    content: string,
    file: string,
    nodes: InfraNode[],
    connections: InfraConnection[],
  ): void {
    const documents = content.split(/^---\s*$/m);

    for (const doc of documents) {
      if (!doc.trim()) continue;

      const kindMatch = doc.match(/^kind:\s*(\w+)/m);
      if (!kindMatch) continue;
      const kind = kindMatch[1];

      const nameMatch = doc.match(/^\s*name:\s*['"]?([^\s'"]+)/m);
      const name = nameMatch ? nameMatch[1] : 'unknown';

      switch (kind) {
        case 'Deployment':
        case 'StatefulSet':
        case 'DaemonSet':
          this.parseK8sDeployment(doc, name, file, nodes, connections);
          break;
        case 'Service':
          this.parseK8sService(doc, name, file, nodes);
          break;
        case 'ConfigMap':
          this.parseK8sConfigMap(doc, name, file, nodes, connections);
          break;
        case 'Ingress':
          this.parseK8sIngress(doc, name, file, nodes, connections);
          break;
        case 'Job':
        case 'CronJob':
          this.parseK8sJob(doc, name, kind, file, nodes);
          break;
      }
    }
  }

  private parseK8sDeployment(
    doc: string,
    name: string,
    file: string,
    nodes: InfraNode[],
    connections: InfraConnection[],
  ): void {
    const properties: Record<string, string> = {};

    const imageMatch = doc.match(/image:\s*['"]?([^\s'"]+)/);
    if (imageMatch) {
      properties['image'] = imageMatch[1];
    }

    const portMatches = doc.matchAll(/containerPort:\s*(\d+)/g);
    const ports: string[] = [];
    for (const m of portMatches) {
      ports.push(m[1]);
    }
    if (ports.length > 0) {
      properties['ports'] = ports.join(',');
    }

    const replicasMatch = doc.match(/replicas:\s*(\d+)/);
    if (replicasMatch) {
      properties['replicas'] = replicasMatch[1];
    }

    nodes.push({
      name,
      type: 'service',
      provider: 'kubernetes',
      file,
      properties,
    });

    const envMatches = doc.matchAll(/name:\s*(\w+)\s*\n\s*value:\s*['"]?([^\s'"]+)/g);
    for (const m of envMatches) {
      const parsed = this.parseEnvReference(`${m[1]}=${m[2]}`);
      if (parsed) {
        connections.push({
          from: name,
          to: parsed.target,
          type: 'env_ref',
          detail: parsed.detail,
          file,
        });
      }
    }
  }

  private parseK8sService(
    doc: string,
    name: string,
    file: string,
    nodes: InfraNode[],
  ): void {
    const properties: Record<string, string> = {};

    const portMatch = doc.match(/port:\s*(\d+)/);
    if (portMatch) {
      properties['port'] = portMatch[1];
    }

    const targetPortMatch = doc.match(/targetPort:\s*(\d+)/);
    if (targetPortMatch) {
      properties['targetPort'] = targetPortMatch[1];
    }

    const typeMatch = doc.match(/type:\s*(ClusterIP|NodePort|LoadBalancer)/);
    if (typeMatch) {
      properties['serviceType'] = typeMatch[1];
    }

    nodes.push({
      name,
      type: 'service',
      provider: 'kubernetes',
      file,
      properties,
    });
  }

  private parseK8sConfigMap(
    doc: string,
    name: string,
    file: string,
    nodes: InfraNode[],
    connections: InfraConnection[],
  ): void {
    const properties: Record<string, string> = {};

    const dataSection = doc.match(/data:\s*\n([\s\S]*?)(?=\n\w|\n---|\s*$)/);
    if (dataSection) {
      const dataLines = dataSection[1].split('\n');
      for (const line of dataLines) {
        const kvMatch = line.match(/^\s+(\w+):\s*['"]?(.+?)['"]?\s*$/);
        if (kvMatch) {
          properties[kvMatch[1]] = kvMatch[2];
          const parsed = this.parseEnvReference(`${kvMatch[1]}=${kvMatch[2]}`);
          if (parsed) {
            connections.push({
              from: name,
              to: parsed.target,
              type: 'connects_to',
              detail: parsed.detail,
              file,
            });
          }
        }
      }
    }

    nodes.push({
      name,
      type: 'service',
      provider: 'kubernetes',
      file,
      properties,
    });
  }

  private parseK8sIngress(
    doc: string,
    name: string,
    file: string,
    nodes: InfraNode[],
    connections: InfraConnection[],
  ): void {
    const properties: Record<string, string> = {};

    const hostMatches = doc.matchAll(/host:\s*['"]?([^\s'"]+)/g);
    const hosts: string[] = [];
    for (const m of hostMatches) {
      hosts.push(m[1]);
    }
    if (hosts.length > 0) {
      properties['hosts'] = hosts.join(',');
    }

    nodes.push({
      name,
      type: 'gateway',
      provider: 'kubernetes',
      file,
      properties,
    });

    const serviceMatches = doc.matchAll(/service:\s*\n\s*name:\s*['"]?([^\s'"]+)/g);
    for (const m of serviceMatches) {
      connections.push({
        from: name,
        to: m[1],
        type: 'connects_to',
        detail: hosts.length > 0 ? hosts[0] : undefined,
        file,
      });
    }

    const serviceNameMatches = doc.matchAll(/serviceName:\s*['"]?([^\s'"]+)/g);
    for (const m of serviceNameMatches) {
      connections.push({
        from: name,
        to: m[1],
        type: 'connects_to',
        detail: hosts.length > 0 ? hosts[0] : undefined,
        file,
      });
    }
  }

  private parseK8sJob(
    doc: string,
    name: string,
    kind: string,
    file: string,
    nodes: InfraNode[],
  ): void {
    const properties: Record<string, string> = { kind };

    const imageMatch = doc.match(/image:\s*['"]?([^\s'"]+)/);
    if (imageMatch) {
      properties['image'] = imageMatch[1];
    }

    if (kind === 'CronJob') {
      const scheduleMatch = doc.match(/schedule:\s*['"]?([^\s'"]+)/);
      if (scheduleMatch) {
        properties['schedule'] = scheduleMatch[1];
      }
    }

    nodes.push({
      name,
      type: 'function',
      provider: 'kubernetes',
      file,
      properties,
    });
  }

  // --- Terraform ---

  private parseTerraform(
    content: string,
    file: string,
    nodes: InfraNode[],
    connections: InfraConnection[],
  ): void {
    const resourceRegex = /resource\s+"(\w+)"\s+"(\w+)"\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = resourceRegex.exec(content)) !== null) {
      const resourceType = match[1];
      const resourceName = match[2];
      const blockStart = match.index + match[0].length;
      const block = this.extractBlock(content, blockStart);
      const lineNumber = content.substring(0, match.index).split('\n').length;

      const node = this.parseTerraformResource(resourceType, resourceName, block, file, lineNumber);
      if (node) {
        nodes.push(node);
        const refs = this.extractTerraformReferences(block, resourceName, file);
        connections.push(...refs);
      }
    }
  }

  private parseTerraformResource(
    resourceType: string,
    name: string,
    block: string,
    file: string,
    line: number,
  ): InfraNode | null {
    const properties: Record<string, string> = {};

    const nameValMatch = block.match(/name\s*=\s*"([^"]+)"/);
    const displayName = nameValMatch ? nameValMatch[1] : name;

    switch (resourceType) {
      case 'google_cloud_run_service':
        this.extractTfProps(block, properties, ['location', 'image']);
        return { name: displayName, type: 'service', provider: 'gcp', file, line, properties };

      case 'google_sql_database_instance':
        this.extractTfProps(block, properties, ['database_version', 'region', 'tier']);
        return { name: displayName, type: 'database', provider: 'gcp', file, line, properties };

      case 'google_pubsub_topic':
        return { name: displayName, type: 'queue', provider: 'gcp', file, line, properties: { ...properties, system: 'pubsub' } };

      case 'google_redis_instance':
        this.extractTfProps(block, properties, ['memory_size_gb', 'tier', 'region']);
        return { name: displayName, type: 'cache', provider: 'gcp', file, line, properties };

      case 'google_storage_bucket':
        this.extractTfProps(block, properties, ['location', 'storage_class']);
        return { name: displayName, type: 'storage', provider: 'gcp', file, line, properties };

      case 'google_cloudfunctions_function':
      case 'google_cloudfunctions2_function':
        this.extractTfProps(block, properties, ['runtime', 'entry_point', 'region']);
        return { name: displayName, type: 'function', provider: 'gcp', file, line, properties };

      case 'aws_lambda_function':
        this.extractTfProps(block, properties, ['runtime', 'handler', 'memory_size', 'timeout']);
        return { name: displayName, type: 'function', provider: 'aws', file, line, properties };

      case 'aws_sqs_queue':
        this.extractTfProps(block, properties, ['delay_seconds', 'max_message_size']);
        return { name: displayName, type: 'queue', provider: 'aws', file, line, properties: { ...properties, system: 'sqs' } };

      case 'aws_rds_instance':
      case 'aws_db_instance':
        this.extractTfProps(block, properties, ['engine', 'engine_version', 'instance_class', 'allocated_storage']);
        return { name: displayName, type: 'database', provider: 'aws', file, line, properties };

      case 'aws_elasticache_cluster':
      case 'aws_elasticache_replication_group':
        this.extractTfProps(block, properties, ['engine', 'node_type', 'num_cache_nodes']);
        return { name: displayName, type: 'cache', provider: 'aws', file, line, properties };

      case 'aws_s3_bucket':
        this.extractTfProps(block, properties, ['bucket', 'acl']);
        return { name: displayName, type: 'storage', provider: 'aws', file, line, properties };

      case 'aws_sns_topic':
        return { name: displayName, type: 'queue', provider: 'aws', file, line, properties: { ...properties, system: 'sns' } };

      case 'aws_kinesis_stream':
        this.extractTfProps(block, properties, ['shard_count', 'retention_period']);
        return { name: displayName, type: 'queue', provider: 'aws', file, line, properties: { ...properties, system: 'kinesis' } };

      case 'aws_ecs_service':
      case 'aws_ecs_task_definition':
        this.extractTfProps(block, properties, ['family', 'cpu', 'memory']);
        return { name: displayName, type: 'service', provider: 'aws', file, line, properties };

      case 'aws_api_gateway_rest_api':
      case 'aws_apigatewayv2_api':
        this.extractTfProps(block, properties, ['protocol_type']);
        return { name: displayName, type: 'gateway', provider: 'aws', file, line, properties };

      case 'aws_sagemaker_endpoint':
        this.extractTfProps(block, properties, ['endpoint_config_name']);
        return { name: displayName, type: 'ml-pipeline', provider: 'aws', file, line, properties };

      case 'google_vertex_ai_endpoint':
        this.extractTfProps(block, properties, ['display_name', 'region']);
        return { name: displayName, type: 'ml-pipeline', provider: 'gcp', file, line, properties };

      default:
        return null;
    }
  }

  private extractTfProps(block: string, properties: Record<string, string>, keys: string[]): void {
    for (const key of keys) {
      const match = block.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
      if (match) {
        properties[key] = match[1];
      }
    }
  }

  private extractBlock(content: string, startIndex: number): string {
    let depth = 1;
    let i = startIndex;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') depth--;
      i++;
    }
    return content.substring(startIndex, i - 1);
  }

  private extractTerraformReferences(block: string, fromName: string, file: string): InfraConnection[] {
    const connections: InfraConnection[] = [];
    const refRegex = /(\w+)\.(\w+)\.(\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = refRegex.exec(block)) !== null) {
      if (match[1] === 'var' || match[1] === 'local' || match[1] === 'data') continue;
      connections.push({
        from: fromName,
        to: match[2],
        type: 'connects_to',
        detail: `${match[1]}.${match[2]}.${match[3]}`,
        file,
      });
    }

    return connections;
  }

  // --- Env Files ---

  private parseEnvFile(
    content: string,
    file: string,
    nodes: InfraNode[],
    connections: InfraConnection[],
  ): void {
    const lines = content.split('\n');
    const sourceName = path.basename(file).replace(/\.(example|template|sample)$/, '') || 'app';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const kvMatch = trimmed.match(/^(\w+)=(.*)$/);
      if (!kvMatch) continue;

      const key = kvMatch[1];
      const value = kvMatch[2].replace(/['"]/g, '').trim();

      if (this.isDatabaseUrl(key, value)) {
        const dbInfo = this.parseDatabaseUrl(value);
        const dbName = dbInfo.name || key.toLowerCase().replace(/_url$/, '');
        nodes.push({
          name: dbName,
          type: 'database',
          provider: dbInfo.provider,
          file,
          properties: { url: value, engine: dbInfo.engine },
        });
        connections.push({
          from: sourceName,
          to: dbName,
          type: 'connects_to',
          detail: dbInfo.engine,
          file,
        });
      } else if (this.isRedisUrl(key, value)) {
        const redisName = key.toLowerCase().replace(/_url$/, '').replace(/_host$/, '') || 'redis';
        nodes.push({
          name: redisName,
          type: 'cache',
          file,
          properties: { url: value },
        });
        connections.push({
          from: sourceName,
          to: redisName,
          type: 'connects_to',
          detail: 'redis',
          file,
        });
      } else if (this.isQueueRef(key, value)) {
        const queueName = key.toLowerCase().replace(/_(?:url|brokers|host|endpoint)$/, '') || 'queue';
        nodes.push({
          name: queueName,
          type: 'queue',
          file,
          properties: { url: value },
        });
        connections.push({
          from: sourceName,
          to: queueName,
          type: 'connects_to',
          detail: key,
          file,
        });
      } else if (this.isServiceUrl(key, value)) {
        const serviceName = key.toLowerCase()
          .replace(/_(?:url|host|endpoint|base_url|api_url)$/, '')
          .replace(/^service_/, '');
        connections.push({
          from: sourceName,
          to: serviceName,
          type: 'env_ref',
          detail: value,
          file,
        });
      }
    }
  }

  // --- Procfile ---

  private parseProcfile(content: string, file: string, nodes: InfraNode[]): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(\w+):\s*(.+)$/);
      if (match) {
        nodes.push({
          name: match[1],
          type: match[1] === 'web' ? 'service' : 'function',
          provider: 'heroku',
          file,
          line: i + 1,
          properties: { command: match[2].trim() },
        });
      }
    }
  }

  // --- fly.toml ---

  private parseFlyToml(content: string, file: string, nodes: InfraNode[]): void {
    const properties: Record<string, string> = {};

    const appMatch = content.match(/^app\s*=\s*"([^"]+)"/m);
    const appName = appMatch ? appMatch[1] : 'fly-app';

    const regionMatch = content.match(/primary_region\s*=\s*"([^"]+)"/);
    if (regionMatch) properties['region'] = regionMatch[1];

    const portMatch = content.match(/internal_port\s*=\s*(\d+)/);
    if (portMatch) properties['port'] = portMatch[1];

    const buildMatch = content.match(/\[build\]\s*\n\s*(?:image|builder)\s*=\s*"([^"]+)"/);
    if (buildMatch) properties['image'] = buildMatch[1];

    nodes.push({
      name: appName,
      type: 'service',
      provider: 'fly',
      file,
      properties,
    });
  }

  // --- render.yaml ---

  private parseRenderYaml(content: string, file: string, nodes: InfraNode[]): void {
    const serviceRegex = /- type:\s*(\w+)\s*\n\s*name:\s*['"]?([^\s'"]+)/g;
    let match: RegExpExecArray | null;

    while ((match = serviceRegex.exec(content)) !== null) {
      const renderType = match[1];
      const name = match[2];

      let nodeType: InfraNode['type'] = 'service';
      if (renderType === 'redis') nodeType = 'cache';
      else if (renderType === 'pserv') nodeType = 'service';
      else if (renderType === 'worker') nodeType = 'function';
      else if (renderType === 'cron') nodeType = 'function';

      nodes.push({
        name,
        type: nodeType,
        provider: 'render',
        file,
        properties: { renderType },
      });
    }

    const dbRegex = /databases:\s*\n((?:\s+-\s*\n(?:\s+\w+:.*\n)*)*)/;
    const dbSection = content.match(dbRegex);
    if (dbSection) {
      const dbNameMatches = dbSection[1].matchAll(/name:\s*['"]?([^\s'"]+)/g);
      for (const m of dbNameMatches) {
        nodes.push({
          name: m[1],
          type: 'database',
          provider: 'render',
          file,
          properties: { engine: 'postgresql' },
        });
      }
    }
  }

  // --- Helpers ---

  private inferServiceType(name: string, image: string): InfraNode['type'] {
    const lower = (name + ' ' + image).toLowerCase();

    if (lower.includes('postgres') || lower.includes('mysql') || lower.includes('mariadb') ||
        lower.includes('mongo') || lower.includes('cockroach') || lower.includes('timescale')) {
      return 'database';
    }
    if (lower.includes('redis') || lower.includes('memcache') || lower.includes('valkey')) {
      return 'cache';
    }
    if (lower.includes('kafka') || lower.includes('rabbitmq') || lower.includes('nats') ||
        lower.includes('pulsar') || lower.includes('activemq') || lower.includes('sqs')) {
      return 'queue';
    }
    if (lower.includes('minio') || lower.includes('s3') || lower.includes('gcs')) {
      return 'storage';
    }
    if (lower.includes('nginx') || lower.includes('traefik') || lower.includes('envoy') ||
        lower.includes('haproxy') || lower.includes('kong') || lower.includes('gateway')) {
      return 'gateway';
    }
    if (lower.includes('mlflow') || lower.includes('kubeflow') || lower.includes('airflow') ||
        lower.includes('tensorflow') || lower.includes('pytorch')) {
      return 'ml-pipeline';
    }

    return 'service';
  }

  private parseEnvReference(envLine: string): { target: string; detail: string } | null {
    const kvMatch = envLine.match(/^(\w+)=(.*)$/);
    if (!kvMatch) return null;

    const key = kvMatch[1];
    const value = kvMatch[2].replace(/['"]/g, '').trim();

    if (this.isDatabaseUrl(key, value)) {
      const db = this.parseDatabaseUrl(value);
      return { target: db.name || 'database', detail: `${key} (${db.engine})` };
    }

    if (this.isRedisUrl(key, value)) {
      return { target: 'redis', detail: key };
    }

    if (this.isQueueRef(key, value)) {
      return { target: 'queue', detail: key };
    }

    if (this.isServiceUrl(key, value)) {
      const serviceName = key.toLowerCase()
        .replace(/_(?:url|host|endpoint|base_url|api_url)$/, '')
        .replace(/^service_/, '');
      return { target: serviceName, detail: value };
    }

    const hostKeys = ['DB_HOST', 'REDIS_HOST', 'CACHE_HOST', 'QUEUE_HOST', 'BROKER_HOST'];
    if (hostKeys.some(h => key.includes(h.split('_')[0]) && key.includes('HOST'))) {
      return { target: value, detail: key };
    }

    return null;
  }

  private isDatabaseUrl(key: string, value: string): boolean {
    const dbKeys = ['DATABASE_URL', 'DB_URL', 'POSTGRES_URL', 'MYSQL_URL', 'MONGO_URL', 'MONGODB_URI', 'DATABASE_URI'];
    if (dbKeys.some(k => key.toUpperCase().includes(k) || key.toUpperCase() === k)) return true;
    return /^(postgres|postgresql|mysql|mongodb|mongodb\+srv):\/\//.test(value);
  }

  private isRedisUrl(key: string, value: string): boolean {
    if (key.toUpperCase().includes('REDIS')) return true;
    return /^redis:\/\//.test(value);
  }

  private isQueueRef(key: string, value: string): boolean {
    const queueKeys = ['KAFKA_BROKERS', 'KAFKA_URL', 'RABBITMQ_URL', 'AMQP_URL', 'NATS_URL', 'SQS_QUEUE_URL', 'PUBSUB_TOPIC'];
    return queueKeys.some(k => key.toUpperCase().includes(k) || key.toUpperCase() === k);
  }

  private isServiceUrl(key: string, value: string): boolean {
    const servicePatterns = /(?:SERVICE|API|ENDPOINT|HOST).*(?:URL|HOST|ENDPOINT|BASE)/i;
    const urlPatterns = /^https?:\/\//;
    if (key.match(servicePatterns) && value.match(urlPatterns)) return true;
    if (key.match(/_URL$/) && value.match(urlPatterns) && !this.isDatabaseUrl(key, value) && !this.isRedisUrl(key, value)) return true;
    return false;
  }

  private parseDatabaseUrl(url: string): { engine: string; name: string; provider: string } {
    if (url.startsWith('postgres') || url.startsWith('postgresql')) {
      const dbName = url.match(/\/([^/?]+)(?:\?|$)/);
      return { engine: 'postgresql', name: dbName ? dbName[1] : 'postgres', provider: 'postgresql' };
    }
    if (url.startsWith('mysql')) {
      const dbName = url.match(/\/([^/?]+)(?:\?|$)/);
      return { engine: 'mysql', name: dbName ? dbName[1] : 'mysql', provider: 'mysql' };
    }
    if (url.startsWith('mongodb')) {
      const dbName = url.match(/\/([^/?]+)(?:\?|$)/);
      return { engine: 'mongodb', name: dbName ? dbName[1] : 'mongodb', provider: 'mongodb' };
    }
    return { engine: 'unknown', name: 'database', provider: 'unknown' };
  }

  private isEnvFile(basename: string): boolean {
    return basename === '.env.example' || basename === '.env.template' ||
           basename === '.env.sample' || basename === '.env.development' ||
           basename === '.env.production' || basename === '.env.local' ||
           basename.match(/^\.env\./) !== null;
  }

  // --- File Collection ---

  private collectInfraFiles(): string[] {
    const files: string[] = [];
    this.walkForInfra(this.rootPath, files, 0);
    return files;
  }

  private walkForInfra(dir: string, result: string[], depth: number): void {
    if (depth > 6) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && !entry.name.startsWith('.env')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.walkForInfra(fullPath, result, depth + 1);
      } else if (entry.isFile() && this.isInfraFile(entry.name, dir)) {
        const stat = this.statSafe(fullPath);
        if (stat && stat.size <= MAX_FILE_SIZE) {
          result.push(fullPath);
        }
      }
    }
  }

  private isInfraFile(filename: string, dir: string): boolean {
    const lower = filename.toLowerCase();
    const dirLower = dir.toLowerCase();

    if (lower.startsWith('docker-compose')) return true;
    if (lower === 'procfile') return true;
    if (lower === 'fly.toml') return true;
    if (lower === 'render.yaml' || lower === 'render.yml') return true;
    if (lower.endsWith('.tf')) return true;
    if (this.isEnvFile(lower)) return true;

    if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
      if (dirLower.includes('k8s') || dirLower.includes('deploy') ||
          dirLower.includes('kubernetes') || dirLower.includes('manifests')) {
        return true;
      }
    }

    return false;
  }

  private readSafe(filePath: string): string | null {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) return null;
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  private statSafe(filePath: string): fs.Stats | null {
    try {
      return fs.statSync(filePath);
    } catch {
      return null;
    }
  }
}
