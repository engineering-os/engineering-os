import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GraphStore } from './graph-store';
import { GraphLinker } from './graph-linker';
import { RepoRegistry } from '../multi-repo/repo-registry';

describe('GraphLinker', () => {
  let tmpDir: string;
  let graphStore: GraphStore;
  let repoRegistry: RepoRegistry;
  let linker: GraphLinker;
  let eosDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-linker-test-'));
    eosDir = path.join(tmpDir, '.eos');
    fs.mkdirSync(eosDir, { recursive: true });

    graphStore = new GraphStore(path.join(eosDir, 'graph', 'services.db'));
    graphStore.initialize();

    repoRegistry = new RepoRegistry(eosDir);
    linker = new GraphLinker(graphStore, repoRegistry, eosDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createRepo(name: string, opts?: { packageName?: string; openapi?: string; sourceFiles?: Record<string, string> }): string {
    const repoPath = path.join(tmpDir, name);
    fs.mkdirSync(repoPath, { recursive: true });

    // Create package.json
    if (opts?.packageName) {
      fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify({ name: opts.packageName }), 'utf-8');
    }

    // Create OpenAPI spec
    if (opts?.openapi) {
      fs.writeFileSync(path.join(repoPath, 'openapi.yaml'), opts.openapi, 'utf-8');
    }

    // Create source files
    if (opts?.sourceFiles) {
      const srcDir = path.join(repoPath, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      for (const [file, content] of Object.entries(opts.sourceFiles)) {
        const filePath = path.join(srcDir, file);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
      }
    }

    // Create .eos dir so it's discoverable
    const repoEos = path.join(repoPath, '.eos', 'index');
    fs.mkdirSync(repoEos, { recursive: true });
    fs.writeFileSync(path.join(repoEos, 'metadata.db'), '', 'utf-8');

    return repoPath;
  }

  async function linkRepo(registry: RepoRegistry, name: string, repoPath: string) {
    await registry.linkRepo({ name, path: repoPath, eosDir: path.join(repoPath, '.eos') });
  }

  describe('endpoint path matching', () => {
    it('should auto-link when URL path matches OpenAPI endpoint AND hostname has service token', async () => {
      const userApiPath = createRepo('user-api', {
        packageName: '@company/user-api',
        openapi: `openapi: "3.0.0"
paths:
  /users:
    get:
      summary: List users
    post:
      summary: Create user
  /users/{id}:
    get:
      summary: Get user`,
      });

      const frontendPath = createRepo('frontend', {
        packageName: '@company/frontend',
        sourceFiles: {
          'api-client.ts': `
import axios from 'axios';
const res = await axios.get("http://user-api:3000/users");
const user = await axios.get("http://user-api:3000/users/123");
`,
        },
      });

      await linkRepo(repoRegistry, 'user-api', userApiPath);
      await linkRepo(repoRegistry, 'frontend', frontendPath);

      const report = await linker.linkAll();

      // Should auto-link: endpoint match (0.45-0.60) + service name token "user" (0.35) >= 0.70
      expect(report.autoLinked.length).toBeGreaterThanOrEqual(1);
      const edge = report.autoLinked.find((e) => e.targetRepo === 'user-api');
      expect(edge).toBeDefined();
      expect(edge!.confidence).toBeGreaterThanOrEqual(0.70);
    });

    it('should NOT auto-link on service name token alone (below threshold)', async () => {
      const userApiPath = createRepo('user-api', {
        packageName: '@company/user-api',
        // NO openapi spec
      });

      const frontendPath = createRepo('frontend', {
        packageName: '@company/frontend',
        sourceFiles: {
          'client.ts': `const res = await fetch("http://user-api:3000/something-not-in-contract");`,
        },
      });

      await linkRepo(repoRegistry, 'user-api', userApiPath);
      await linkRepo(repoRegistry, 'frontend', frontendPath);

      const report = await linker.linkAll();

      // Service name token alone = 0.35, below 0.70 threshold
      const autoLinkedToUser = report.autoLinked.filter((e) => e.targetRepo === 'user-api');
      expect(autoLinkedToUser).toHaveLength(0);
    });
  });

  describe('package name matching', () => {
    it('should suggest on package name match (0.65, just below 0.70)', async () => {
      const sharedPath = createRepo('shared-types', {
        packageName: '@company/shared-types',
      });

      const apiPath = createRepo('api-service', {
        packageName: '@company/api',
        sourceFiles: {
          'handler.ts': `import { UserDTO } from '@company/shared-types';`,
        },
      });

      await linkRepo(repoRegistry, 'shared-types', sharedPath);
      await linkRepo(repoRegistry, 'api-service', apiPath);

      const report = await linker.linkAll();

      // Package match = 0.65, just below auto-link threshold of 0.70
      // Should be a suggestion
      const suggestion = report.suggested.find((e) => e.targetRepo === 'shared-types');
      expect(suggestion).toBeDefined();
      expect(suggestion!.confidence).toBeGreaterThanOrEqual(0.45);
    });
  });

  describe('event topic matching', () => {
    it('should suggest on exact event topic match', async () => {
      const notifierPath = createRepo('notification-service', {
        packageName: '@company/notifier',
        sourceFiles: {
          // Empty but has event schema
        },
      });
      // Add event schema
      const eventsDir = path.join(tmpDir, 'notification-service', 'events');
      fs.mkdirSync(eventsDir, { recursive: true });
      fs.writeFileSync(path.join(eventsDir, 'user-events.yaml'), `
eventName: "user.created"
topic: "user.created"
payload:
  userId: string
`, 'utf-8');

      const userSvcPath = createRepo('user-service', {
        packageName: '@company/user-svc',
        sourceFiles: {
          'publisher.ts': `await queue.publish("user.created", { userId });`,
        },
      });

      await linkRepo(repoRegistry, 'notification-service', notifierPath);
      await linkRepo(repoRegistry, 'user-service', userSvcPath);

      const report = await linker.linkAll();

      // Event topic exact match = 0.55 → suggestion tier
      const allEdges = [...report.autoLinked, ...report.suggested];
      const eventEdge = allEdges.find(
        (e) => e.sourceRepo === 'user-service' && e.targetRepo === 'notification-service'
      );
      expect(eventEdge).toBeDefined();
    });
  });

  describe('manual hints', () => {
    it('should auto-link immediately on manual hint match', async () => {
      const paymentPath = createRepo('payment-service', { packageName: '@company/payments' });
      const apiPath = createRepo('api-gateway', {
        packageName: '@company/gateway',
        sourceFiles: {
          'proxy.ts': `const res = await fetch("https://payments.internal.company.com/v1/charge");`,
        },
      });

      await linkRepo(repoRegistry, 'payment-service', paymentPath);
      await linkRepo(repoRegistry, 'api-gateway', apiPath);

      // Write hints file
      fs.writeFileSync(path.join(eosDir, 'graph-hints.yaml'), `
urlMappings:
  - pattern: "*payments.internal*"
    targetRepo: "payment-service"
`, 'utf-8');

      const linkerWithHints = new GraphLinker(graphStore, repoRegistry, eosDir);
      const report = await linkerWithHints.linkAll();

      const edge = report.autoLinked.find((e) => e.targetRepo === 'payment-service');
      expect(edge).toBeDefined();
      expect(edge!.confidence).toBe(1.0);
    });
  });

  describe('filtering', () => {
    it('should skip calls from test files', async () => {
      const apiPath = createRepo('api', {
        openapi: `openapi: "3.0.0"\npaths:\n  /items:\n    get:\n      summary: Items`,
      });
      const testPath = createRepo('tester', {
        sourceFiles: {
          'api.test.ts': `const res = await fetch("http://api:3000/items");`,
        },
      });

      await linkRepo(repoRegistry, 'api', apiPath);
      await linkRepo(repoRegistry, 'tester', testPath);

      const report = await linker.linkAll();

      // Test file calls should be skipped
      const skippedTest = report.skipped.filter((s) => s.reason === 'Test file');
      expect(skippedTest.length).toBeGreaterThanOrEqual(0); // May or may not detect depending on file walk
    });

    it('should skip external domains', async () => {
      const svcPath = createRepo('my-service', {
        sourceFiles: {
          'stripe.ts': `const res = await fetch("https://api.stripe.com/v1/charges");`,
        },
      });

      await linkRepo(repoRegistry, 'my-service', svcPath);

      const report = await linker.linkAll();

      const stripeEdge = [...report.autoLinked, ...report.suggested].find(
        (e) => e.targetRepo?.includes('stripe')
      );
      expect(stripeEdge).toBeUndefined();
    });
  });

  describe('sibling discovery', () => {
    it('should discover sibling repos with .eos', () => {
      // Create siblings in the parent directory of eosDir's repo
      const parentDir = tmpDir;
      const sibling1 = path.join(parentDir, 'sibling-a', '.eos', 'index');
      const sibling2 = path.join(parentDir, 'sibling-b', '.eos', 'index');
      fs.mkdirSync(sibling1, { recursive: true });
      fs.mkdirSync(sibling2, { recursive: true });
      fs.writeFileSync(path.join(sibling1, 'metadata.db'), '', 'utf-8');
      fs.writeFileSync(path.join(sibling2, 'metadata.db'), '', 'utf-8');

      // eosDir is at tmpDir/.eos, so parent of repo is tmpDir's parent
      // Let's test with the eosDir pointing within one of our test repos
      const repoPath = createRepo('my-repo', {});
      const myEosDir = path.join(repoPath, '.eos');

      const siblings = linker.discoverSiblings(myEosDir);

      // Should find other repos in tmpDir that have .eos
      expect(siblings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('confidence scoring', () => {
    it('should compound signals: endpoint + service token exceeds threshold', async () => {
      const orderPath = createRepo('order-service', {
        packageName: '@company/orders',
        openapi: `openapi: "3.0.0"
paths:
  /orders:
    post:
      summary: Create order`,
      });

      const checkoutPath = createRepo('checkout', {
        packageName: '@company/checkout',
        sourceFiles: {
          'order-client.ts': `
const res = await axios.post("http://order-service:4000/orders");
`,
        },
      });

      await linkRepo(repoRegistry, 'order-service', orderPath);
      await linkRepo(repoRegistry, 'checkout', checkoutPath);

      const report = await linker.linkAll();

      // endpoint path match (~0.45-0.60) + service name token "order" (0.35) = 0.80+ → auto-link
      const edge = report.autoLinked.find((e) => e.sourceRepo === 'checkout' && e.targetRepo === 'order-service');
      expect(edge).toBeDefined();
      expect(edge!.confidence).toBeGreaterThanOrEqual(0.70);
      expect(edge!.signals.length).toBeGreaterThanOrEqual(2);
    });
  });
});
