import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GraphStore } from './graph-store';
import { ImpactAnalyzer } from './impact-analyzer';

describe('ImpactAnalyzer', () => {
  let store: GraphStore;
  let analyzer: ImpactAnalyzer;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-impact-test-'));
    store = new GraphStore(path.join(tmpDir, 'graph.db'));
    store.initialize();
    analyzer = new ImpactAnalyzer(store);

    // Set up a realistic service graph:
    // frontend -> api-gateway -> user-service -> database
    //                         -> payment-service (critical)
    store.upsertService({ id: 'web/frontend', repoName: 'web', serviceName: 'frontend', owners: [], criticality: 'medium', lastDiscovered: '2024-01-01' });
    store.upsertService({ id: 'api/gateway', repoName: 'api', serviceName: 'gateway', owners: ['team-platform'], criticality: 'high', lastDiscovered: '2024-01-01' });
    store.upsertService({ id: 'services/user-service', repoName: 'services', serviceName: 'user-service', owners: ['team-identity'], criticality: 'high', lastDiscovered: '2024-01-01' });
    store.upsertService({ id: 'services/payment-service', repoName: 'services', serviceName: 'payment-service', owners: ['team-payments'], criticality: 'critical', lastDiscovered: '2024-01-01' });

    // frontend -> api-gateway (rest)
    store.addConnection({ sourceService: 'web/frontend', targetService: 'api/gateway', protocol: 'rest', dataFlow: 'request', lastVerified: '2024-01-01' });
    // api-gateway -> user-service (rest)
    store.addConnection({ sourceService: 'api/gateway', targetService: 'services/user-service', protocol: 'rest', dataFlow: 'request', lastVerified: '2024-01-01' });
    // api-gateway -> payment-service (rest)
    store.addConnection({ sourceService: 'api/gateway', targetService: 'services/payment-service', protocol: 'rest', dataFlow: 'request', lastVerified: '2024-01-01' });

    // Add a contract
    store.upsertContract({
      id: 'services/user-service/openapi.yaml',
      repoName: 'services',
      filePath: 'user-service/openapi.yaml',
      type: 'openapi',
      version: '3.0.0',
      endpoints: [{ method: 'GET', path: '/users' }, { method: 'POST', path: '/users' }],
      lastModified: '2024-01-01',
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('analyzeFileChange', () => {
    it('should identify affected services when a service code changes', () => {
      const result = analyzer.analyzeFileChange('services', 'user-service/src/handler.ts');

      expect(result.changedService).toBe('services/user-service');
      expect(result.affectedServices.length).toBeGreaterThan(0);
      expect(result.affectedServices[0].serviceName).toBe('gateway');
    });

    it('should flag high risk for contract file changes', () => {
      const result = analyzer.analyzeFileChange('services', 'user-service/openapi.yaml');

      expect(result.riskLevel).toBe('high');
      expect(result.affectedContracts.length).toBeGreaterThan(0);
    });

    it('should return low risk for unknown files', () => {
      const result = analyzer.analyzeFileChange('unknown-repo', 'some-file.ts');

      expect(result.riskLevel).toBe('low');
      expect(result.affectedServices).toHaveLength(0);
    });
  });

  describe('analyzeServiceChange', () => {
    it('should trace transitive dependents', () => {
      const result = analyzer.analyzeServiceChange('services/user-service');

      // gateway depends on user-service directly, frontend depends transitively
      expect(result.affectedServices.length).toBeGreaterThanOrEqual(1);
      expect(result.affectedServices.some((s) => s.serviceName === 'gateway')).toBe(true);
    });

    it('should flag critical risk when critical services are affected', () => {
      const result = analyzer.analyzeServiceChange('services/payment-service');

      // gateway depends on payment-service, frontend depends on gateway
      expect(result.affectedServices.some((s) => s.serviceName === 'gateway')).toBe(true);
    });

    it('should return empty for unknown service', () => {
      const result = analyzer.analyzeServiceChange('nonexistent/service');

      expect(result.affectedServices).toHaveLength(0);
      expect(result.riskLevel).toBe('low');
    });
  });

  describe('analyzeEndpointChange', () => {
    it('should find services consuming the endpoint', () => {
      const result = analyzer.analyzeEndpointChange('services', '/users', 'GET');

      expect(result.affectedContracts.length).toBeGreaterThan(0);
    });

    it('should return low risk for unknown endpoints', () => {
      const result = analyzer.analyzeEndpointChange('services', '/nonexistent', 'GET');

      expect(result.riskLevel).toBe('low');
      expect(result.affectedContracts).toHaveLength(0);
    });
  });

  describe('risk level computation', () => {
    it('should compute critical risk when critical services are affected and contract changes', () => {
      // Add a direct connection to the critical payment service
      store.upsertService({ id: 'infra/shared-lib', repoName: 'infra', serviceName: 'shared-lib', owners: [], criticality: 'medium', lastDiscovered: '2024-01-01' });
      store.addConnection({ sourceService: 'services/payment-service', targetService: 'infra/shared-lib', protocol: 'import', dataFlow: 'import', lastVerified: '2024-01-01' });

      const result = analyzer.analyzeServiceChange('infra/shared-lib');
      // payment-service is critical and depends on shared-lib
      expect(result.affectedServices.some((s) => s.criticality === 'critical')).toBe(true);
      expect(result.riskLevel).toBe('critical');
    });
  });
});
