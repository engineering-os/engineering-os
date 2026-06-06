import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContractDiscovery } from './contract-discovery';

describe('ContractDiscovery', () => {
  let tmpDir: string;
  let discovery: ContractDiscovery;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-contract-test-'));
    discovery = new ContractDiscovery(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  describe('discoverContracts', () => {
    it('should discover OpenAPI YAML specs', async () => {
      writeFile('openapi.yaml', `
openapi: "3.0.0"
info:
  title: User API
paths:
  /users:
    get:
      summary: List users
    post:
      summary: Create user
  /users/{id}:
    get:
      summary: Get user
`);

      const contracts = await discovery.discoverContracts();
      expect(contracts).toHaveLength(1);
      expect(contracts[0].type).toBe('openapi');
      expect(contracts[0].endpoints.length).toBeGreaterThanOrEqual(3);
      expect(contracts[0].version).toBe('3.0.0');
    });

    it('should discover OpenAPI JSON specs', async () => {
      writeFile('swagger.json', JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/health': { get: { summary: 'Health check' } },
          '/items': { post: { summary: 'Create item' } },
        },
      }));

      const contracts = await discovery.discoverContracts();
      expect(contracts).toHaveLength(1);
      expect(contracts[0].endpoints).toHaveLength(2);
    });

    it('should discover proto files', async () => {
      writeFile('api/user.proto', `
syntax = "proto3";

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(CreateUserRequest) returns (User);
}

service AuthService {
  rpc Login(LoginRequest) returns (Token);
}
`);

      const contracts = await discovery.discoverContracts();
      expect(contracts).toHaveLength(1);
      expect(contracts[0].type).toBe('grpc');
      expect(contracts[0].endpoints).toHaveLength(3);
      expect(contracts[0].endpoints[0].path).toContain('UserService/GetUser');
    });

    it('should discover GraphQL schemas', async () => {
      writeFile('schema.graphql', `
type Query {
  users(limit: Int): [User]
  user(id: ID!): User
}

type Mutation {
  createUser(input: CreateUserInput!): User
  deleteUser(id: ID!): Boolean
}
`);

      const contracts = await discovery.discoverContracts();
      expect(contracts).toHaveLength(1);
      expect(contracts[0].type).toBe('graphql');
      expect(contracts[0].endpoints.length).toBeGreaterThanOrEqual(4);
    });

    it('should discover event schemas', async () => {
      writeFile('events/user-created.yaml', `
eventName: "user.created"
topic: "users"
payload:
  userId: string
  email: string
`);

      const contracts = await discovery.discoverContracts();
      expect(contracts).toHaveLength(1);
      expect(contracts[0].type).toBe('event-schema');
      expect(contracts[0].endpoints.length).toBeGreaterThanOrEqual(1);
    });

    it('should skip node_modules', async () => {
      writeFile('node_modules/some-pkg/openapi.yaml', `openapi: "3.0.0"\npaths:\n  /test:\n    get:\n      summary: test`);
      writeFile('src/openapi.yaml', `openapi: "3.0.0"\npaths:\n  /real:\n    get:\n      summary: real`);

      const contracts = await discovery.discoverContracts();
      expect(contracts).toHaveLength(1);
      expect(contracts[0].filePath).toBe('src/openapi.yaml');
    });
  });

  describe('detectOutboundCalls', () => {
    it('should detect axios calls with URLs', async () => {
      writeFile('src/client.ts', `
import axios from 'axios';

const response = await axios.get("http://user-service:3000/users");
const data = await axios.post("http://payment-service:4000/charge");
`);

      const calls = await discovery.detectOutboundCalls();
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[0].protocol).toBe('rest');
      expect(calls[0].targetUrl).toContain('user-service');
    });

    it('should detect fetch calls', async () => {
      writeFile('src/api.ts', `
const res = await fetch("https://api.internal.com/v1/orders");
`);

      const calls = await discovery.detectOutboundCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].targetUrl).toContain('api.internal.com');
    });

    it('should detect base URL constants', async () => {
      writeFile('src/config.ts', `
const BASE_URL = "http://auth-service:8080";
const API_URL = "https://gateway.prod.internal";
`);

      const calls = await discovery.detectOutboundCalls();
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect event publishing', async () => {
      writeFile('src/publisher.ts', `
await queue.publish("user.created", payload);
channel.send("order.completed");
`);

      const calls = await discovery.detectOutboundCalls();
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[0].protocol).toBe('event');
    });

    it('should detect scoped package imports', async () => {
      writeFile('src/handler.ts', `
import { UserDTO } from '@mycompany/shared-types';
import { validate } from '@mycompany/validation';
import { describe } from '@jest/globals';
`);

      const calls = await discovery.detectOutboundCalls();
      const internalImports = calls.filter((c) => c.protocol === 'import');
      expect(internalImports).toHaveLength(2);
      expect(internalImports[0].targetPackage).toBe('@mycompany/shared-types');
    });
  });
});
