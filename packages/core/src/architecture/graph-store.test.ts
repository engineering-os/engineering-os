import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GraphStore } from './graph-store';
import { GraphService, GraphConnection, GraphContract } from '@engineering-os/shared';

describe('GraphStore', () => {
  let store: GraphStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-graph-test-'));
    store = new GraphStore(path.join(tmpDir, 'graph.db'));
    store.initialize();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeService = (overrides?: Partial<GraphService>): GraphService => ({
    id: 'repo-a/api-service',
    repoName: 'repo-a',
    serviceName: 'api-service',
    description: 'Main API',
    owners: ['team-backend'],
    criticality: 'high',
    lastDiscovered: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  const makeConnection = (overrides?: Partial<GraphConnection>): GraphConnection => ({
    sourceService: 'repo-b/frontend',
    targetService: 'repo-a/api-service',
    protocol: 'rest',
    dataFlow: 'request',
    lastVerified: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  describe('services', () => {
    it('should upsert and retrieve a service', () => {
      const service = makeService();
      store.upsertService(service);

      const retrieved = store.getService('repo-a/api-service');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.serviceName).toBe('api-service');
      expect(retrieved!.owners).toEqual(['team-backend']);
      expect(retrieved!.criticality).toBe('high');
    });

    it('should update on upsert', () => {
      store.upsertService(makeService());
      store.upsertService(makeService({ description: 'Updated' }));

      const retrieved = store.getService('repo-a/api-service');
      expect(retrieved!.description).toBe('Updated');
    });

    it('should get services by repo', () => {
      store.upsertService(makeService({ id: 'repo-a/svc1', serviceName: 'svc1' }));
      store.upsertService(makeService({ id: 'repo-a/svc2', serviceName: 'svc2' }));
      store.upsertService(makeService({ id: 'repo-b/svc3', repoName: 'repo-b', serviceName: 'svc3' }));

      const repoAServices = store.getServicesByRepo('repo-a');
      expect(repoAServices).toHaveLength(2);
    });

    it('should delete services by repo', () => {
      store.upsertService(makeService({ id: 'repo-a/svc1', serviceName: 'svc1' }));
      store.upsertService(makeService({ id: 'repo-b/svc2', repoName: 'repo-b', serviceName: 'svc2' }));

      const deleted = store.deleteServicesByRepo('repo-a');
      expect(deleted).toBe(1);
      expect(store.getAllServices()).toHaveLength(1);
    });
  });

  describe('connections', () => {
    beforeEach(() => {
      store.upsertService(makeService({ id: 'repo-a/api-service' }));
      store.upsertService(makeService({ id: 'repo-b/frontend', repoName: 'repo-b', serviceName: 'frontend' }));
    });

    it('should add and retrieve connections', () => {
      const id = store.addConnection(makeConnection());
      expect(id).toBeGreaterThan(0);

      const from = store.getConnectionsFrom('repo-b/frontend');
      expect(from).toHaveLength(1);
      expect(from[0].targetService).toBe('repo-a/api-service');
      expect(from[0].protocol).toBe('rest');

      const to = store.getConnectionsTo('repo-a/api-service');
      expect(to).toHaveLength(1);
    });

    it('should find consumers of a service', () => {
      store.addConnection(makeConnection());
      const consumers = store.findConsumers('repo-a/api-service');
      expect(consumers).toHaveLength(1);
      expect(consumers[0].service.serviceName).toBe('frontend');
    });

    it('should find providers for a service', () => {
      store.addConnection(makeConnection());
      const providers = store.findProviders('repo-b/frontend');
      expect(providers).toHaveLength(1);
      expect(providers[0].service.serviceName).toBe('api-service');
    });
  });

  describe('contracts', () => {
    it('should upsert and retrieve contracts', () => {
      const contract: GraphContract = {
        id: 'repo-a/openapi.yaml',
        repoName: 'repo-a',
        filePath: 'openapi.yaml',
        type: 'openapi',
        version: '3.0.0',
        endpoints: [{ method: 'GET', path: '/users' }, { method: 'POST', path: '/users' }],
        lastModified: '2024-01-01T00:00:00Z',
      };

      store.upsertContract(contract);
      const retrieved = store.getContract('repo-a/openapi.yaml');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.endpoints).toHaveLength(2);
      expect(retrieved!.type).toBe('openapi');
    });

    it('should get contracts by repo', () => {
      store.upsertContract({ id: 'repo-a/api', repoName: 'repo-a', filePath: 'api.yaml', type: 'openapi', endpoints: [], lastModified: '2024-01-01' });
      store.upsertContract({ id: 'repo-b/api', repoName: 'repo-b', filePath: 'api.yaml', type: 'openapi', endpoints: [], lastModified: '2024-01-01' });

      expect(store.getContractsByRepo('repo-a')).toHaveLength(1);
    });
  });

  describe('data ownership', () => {
    beforeEach(() => {
      store.upsertService(makeService({ id: 'repo-a/user-service', serviceName: 'user-service' }));
    });

    it('should set and query ownership', () => {
      store.setOwnership({ entity: 'User', ownerService: 'repo-a/user-service', accessType: 'owner' });
      store.setOwnership({ entity: 'User', ownerService: 'repo-b/auth-service', accessType: 'reader' });

      const owners = store.getOwnersOf('User');
      expect(owners).toHaveLength(2);

      const entities = store.getEntitiesOwnedBy('repo-a/user-service');
      expect(entities).toHaveLength(1);
      expect(entities[0].entity).toBe('User');
    });
  });

  describe('graph queries', () => {
    beforeEach(() => {
      store.upsertService(makeService({ id: 'a/svc1', repoName: 'a', serviceName: 'svc1' }));
      store.upsertService(makeService({ id: 'b/svc2', repoName: 'b', serviceName: 'svc2' }));
      store.upsertService(makeService({ id: 'c/svc3', repoName: 'c', serviceName: 'svc3' }));
      store.addConnection({ sourceService: 'a/svc1', targetService: 'b/svc2', protocol: 'rest', dataFlow: 'request', lastVerified: '2024-01-01' });
      store.addConnection({ sourceService: 'b/svc2', targetService: 'c/svc3', protocol: 'event', dataFlow: 'publish', lastVerified: '2024-01-01' });
    });

    it('should find path between services', () => {
      const pathResult = store.findPath('a/svc1', 'c/svc3');
      expect(pathResult).not.toBeNull();
      expect(pathResult).toHaveLength(3);
      expect(pathResult![0].id).toBe('a/svc1');
      expect(pathResult![2].id).toBe('c/svc3');
    });

    it('should return null for no path', () => {
      const pathResult = store.findPath('c/svc3', 'a/svc1');
      expect(pathResult).toBeNull();
    });
  });

  describe('diagram generation', () => {
    it('should generate Mermaid diagram', () => {
      store.upsertService(makeService({ id: 'a/api', repoName: 'a', serviceName: 'api' }));
      store.upsertService(makeService({ id: 'b/web', repoName: 'b', serviceName: 'web' }));
      store.addConnection({ sourceService: 'b/web', targetService: 'a/api', protocol: 'rest', dataFlow: 'request', lastVerified: '2024-01-01' });

      const diagram = store.generateMermaidDiagram();
      expect(diagram.mermaid).toContain('graph LR');
      expect(diagram.mermaid).toContain('rest');
      expect(diagram.services).toBe(2);
      expect(diagram.connections).toBe(1);
    });

    it('should filter by repo', () => {
      store.upsertService(makeService({ id: 'a/api', repoName: 'a', serviceName: 'api' }));
      store.upsertService(makeService({ id: 'b/web', repoName: 'b', serviceName: 'web' }));
      store.upsertService(makeService({ id: 'c/worker', repoName: 'c', serviceName: 'worker' }));
      store.addConnection({ sourceService: 'b/web', targetService: 'a/api', protocol: 'rest', dataFlow: 'request', lastVerified: '2024-01-01' });
      store.addConnection({ sourceService: 'c/worker', targetService: 'c/worker', protocol: 'event', dataFlow: 'subscribe', lastVerified: '2024-01-01' });

      const diagram = store.generateMermaidDiagram({ repoFilter: 'a' });
      expect(diagram.services).toBe(2); // a/api + b/web (connected)
      expect(diagram.connections).toBe(1);
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      store.upsertService(makeService({ id: 'a/s1', repoName: 'a', serviceName: 's1' }));
      store.upsertService(makeService({ id: 'b/s2', repoName: 'b', serviceName: 's2' }));
      store.addConnection({ sourceService: 'a/s1', targetService: 'b/s2', protocol: 'rest', dataFlow: 'request', lastVerified: '2024-01-01' });
      store.upsertContract({ id: 'c1', repoName: 'a', filePath: 'api.yaml', type: 'openapi', endpoints: [], lastModified: '2024-01-01' });
      store.setOwnership({ entity: 'User', ownerService: 'a/s1', accessType: 'owner' });

      const stats = store.getStats();
      expect(stats.services).toBe(2);
      expect(stats.connections).toBe(1);
      expect(stats.contracts).toBe(1);
      expect(stats.entities).toBe(1);
    });
  });
});
