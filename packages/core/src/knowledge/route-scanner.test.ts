import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RouteScanner } from './route-scanner';

describe('RouteScanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-route-scanner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  describe('Express routes', () => {
    it('should detect app.get route', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { express: '^4.18.0' } }));
      writeFile('src/routes.ts', `
import express from 'express';
const app = express();
app.get('/users', listUsers);
app.post('/users', createUser);
`);

      const scanner = new RouteScanner(tmpDir);
      const routes = scanner.scan();

      expect(routes).toHaveLength(2);
      expect(routes[0]).toMatchObject({
        method: 'GET',
        path: '/users',
        framework: 'express',
      });
      expect(routes[0].handler).toBe('listUsers');
      expect(routes[1]).toMatchObject({
        method: 'POST',
        path: '/users',
        framework: 'express',
      });
      expect(routes[1].handler).toBe('createUser');
    });

    it('should detect router.get route', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { express: '^4.18.0' } }));
      writeFile('src/user-routes.ts', `
import { Router } from 'express';
const router = Router();
router.get('/users/:id', getUserById);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
`);

      const scanner = new RouteScanner(tmpDir);
      const routes = scanner.scan();

      expect(routes).toHaveLength(3);
      expect(routes[0]).toMatchObject({ method: 'GET', path: '/users/:id', framework: 'express' });
      expect(routes[1]).toMatchObject({ method: 'PUT', path: '/users/:id', framework: 'express' });
      expect(routes[2]).toMatchObject({ method: 'DELETE', path: '/users/:id', framework: 'express' });
    });

    it('should detect router.route chained methods', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { express: '^4.18.0' } }));
      writeFile('src/chain-routes.ts', `
import { Router } from 'express';
const router = Router();
router.route('/items')
  .get(listItems)
  .post(createItem)
`);

      const scanner = new RouteScanner(tmpDir);
      const routes = scanner.scan();

      expect(routes).toHaveLength(2);
      expect(routes[0]).toMatchObject({ method: 'GET', path: '/items', framework: 'express' });
      expect(routes[1]).toMatchObject({ method: 'POST', path: '/items', framework: 'express' });
    });
  });

  describe('NestJS routes', () => {
    it('should detect @Controller with @Get decorator', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0', '@nestjs/common': '^10.0.0' } }));
      writeFile('src/users.controller.ts', `
import { Controller, Get, Post } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne() {}

  @Post()
  async create() {}
}
`);

      const scanner = new RouteScanner(tmpDir);
      const routes = scanner.scan();

      expect(routes).toHaveLength(2);
      expect(routes[0]).toMatchObject({
        method: 'GET',
        path: '/users/:id',
        framework: 'nestjs',
      });
      expect(routes[0].handler).toBe('findOne');
      expect(routes[1]).toMatchObject({
        method: 'POST',
        path: '/users',
        framework: 'nestjs',
      });
      expect(routes[1].handler).toBe('create');
    });

    it('should handle @Controller with no path argument', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } }));
      writeFile('src/health.controller.ts', `
import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  async check() {}
}
`);

      const scanner = new RouteScanner(tmpDir);
      const routes = scanner.scan();

      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({
        method: 'GET',
        path: '/health',
        framework: 'nestjs',
      });
      expect(routes[0].handler).toBe('check');
    });
  });

  describe('Fastify routes', () => {
    it('should detect fastify.get shorthand', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { fastify: '^4.0.0' } }));
      writeFile('src/items.ts', `
import Fastify from 'fastify';
const fastify = Fastify();
fastify.get('/items', async (request, reply) => {
  return { items: [] };
});
fastify.post('/items', async (request, reply) => {
  return { created: true };
});
`);

      const scanner = new RouteScanner(tmpDir);
      const routes = scanner.scan();

      expect(routes).toHaveLength(2);
      expect(routes[0]).toMatchObject({
        method: 'GET',
        path: '/items',
        framework: 'fastify',
      });
      expect(routes[1]).toMatchObject({
        method: 'POST',
        path: '/items',
        framework: 'fastify',
      });
    });

    it('should detect fastify.route object style', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { fastify: '^4.0.0' } }));
      writeFile('src/orders.ts', `
import Fastify from 'fastify';
const fastify = Fastify();
fastify.route({
  method: 'GET',
  url: '/orders/:id',
  handler: async (request, reply) => {}
});
`);

      const scanner = new RouteScanner(tmpDir);
      const routes = scanner.scan();

      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({
        method: 'GET',
        path: '/orders/:id',
        framework: 'fastify',
      });
    });
  });

  describe('Next.js App Router routes', () => {
    it('should detect exported GET function in route.ts', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { next: '^14.0.0' } }));
      writeFile('app/api/users/route.ts', `
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  return NextResponse.json({ users: [] });
}

export async function POST(request: Request) {
  return NextResponse.json({ created: true });
}
`);

      const scanner = new RouteScanner(tmpDir);
      const routes = scanner.scan();

      expect(routes).toHaveLength(2);
      expect(routes[0]).toMatchObject({
        method: 'GET',
        path: '/api/users',
        framework: 'nextjs',
      });
      expect(routes[1]).toMatchObject({
        method: 'POST',
        path: '/api/users',
        framework: 'nextjs',
      });
    });

    it('should handle dynamic route segments', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { next: '^14.0.0' } }));
      writeFile('app/api/users/[id]/route.ts', `
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return NextResponse.json({ id: params.id });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  return NextResponse.json({ deleted: true });
}
`);

      const scanner = new RouteScanner(tmpDir);
      const routes = scanner.scan();

      expect(routes).toHaveLength(2);
      expect(routes[0]).toMatchObject({
        method: 'GET',
        path: '/api/users/:id',
        framework: 'nextjs',
      });
      expect(routes[1]).toMatchObject({
        method: 'DELETE',
        path: '/api/users/:id',
        framework: 'nextjs',
      });
    });
  });

  describe('detectFramework', () => {
    it('should detect express from package.json', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { express: '^4.18.0' } }));

      const scanner = new RouteScanner(tmpDir);
      expect(scanner.detectFramework()).toBe('express');
    });

    it('should detect nestjs from package.json', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0', '@nestjs/common': '^10.0.0' } }));

      const scanner = new RouteScanner(tmpDir);
      expect(scanner.detectFramework()).toBe('nestjs');
    });

    it('should detect fastify from package.json', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { fastify: '^4.0.0' } }));

      const scanner = new RouteScanner(tmpDir);
      expect(scanner.detectFramework()).toBe('fastify');
    });

    it('should return null when no framework is detected', () => {
      writeFile('package.json', JSON.stringify({ dependencies: { lodash: '^4.0.0' } }));

      const scanner = new RouteScanner(tmpDir);
      expect(scanner.detectFramework()).toBeNull();
    });
  });
});
