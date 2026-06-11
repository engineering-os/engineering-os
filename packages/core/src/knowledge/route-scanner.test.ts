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

    it('should detect gorouter from pubspec.yaml', () => {
      writeFile('pubspec.yaml', 'name: app\ndependencies:\n  go_router: ^16.2.4\n');
      const scanner = new RouteScanner(tmpDir);
      expect(scanner.detectFramework()).toBe('gorouter');
    });

    it('should detect autoroute from pubspec.yaml', () => {
      writeFile('pubspec.yaml', 'name: app\ndependencies:\n  auto_route: ^9.0.0\n');
      const scanner = new RouteScanner(tmpDir);
      expect(scanner.detectFramework()).toBe('autoroute');
    });
  });

  describe('Flutter go_router routes', () => {
    it('should detect GoRoute paths with name and builder', () => {
      writeFile('pubspec.yaml', 'name: app\ndependencies:\n  go_router: ^16.2.4\n');
      writeFile('lib/core/router/app_router.dart', `
final router = GoRouter(
  routes: [
    GoRoute(
      path: '/login',
      name: 'login',
      builder: (context, state) => const LoginPage(),
    ),
    GoRoute(
      path: '/work-log/:id',
      builder: (context, state) => WorkLogPage(),
    ),
  ],
);
`);
      const routes = new RouteScanner(tmpDir).scan();
      const paths = routes.map((r) => r.path);
      expect(paths).toContain('/login');
      expect(paths).toContain('/work-log/:id');

      const login = routes.find((r) => r.path === '/login')!;
      expect(login.framework).toBe('gorouter');
      expect(login.method).toBe('SCREEN');
      expect(login.handler).toBe('login'); // name preferred
      expect(login.file).toContain('app_router.dart');
      expect(login.line).toBeGreaterThan(0);
    });

    it('should resolve path/name constant references (lume style)', () => {
      writeFile('pubspec.yaml', 'name: app\ndependencies:\n  go_router: ^16.2.4\n');
      writeFile('lib/core/router/app_router.dart', `
class Routes {
  static const signIn = 'sign-in';
  static const home = 'home';
}
class RoutePaths {
  static const signIn = '/sign-in';
  static const home = '/';
}
final appRouter = GoRouter(
  routes: [
    GoRoute(
      path: RoutePaths.signIn,
      name: Routes.signIn,
      builder: (context, state) => const SignInPage(),
    ),
    GoRoute(
      path: RoutePaths.home,
      name: Routes.home,
      routes: [
        GoRoute(
          path: 'edit',
          name: Routes.workLogEdit,
        ),
      ],
    ),
  ],
);
`);
      const routes = new RouteScanner(tmpDir).scan();
      const paths = routes.map((r) => r.path).sort();
      expect(paths).toContain('/sign-in'); // resolved from RoutePaths.signIn
      expect(paths).toContain('/');        // resolved from RoutePaths.home
      expect(paths).toContain('edit');     // inline literal still works

      const signIn = routes.find((r) => r.path === '/sign-in')!;
      expect(signIn.handler).toBe('sign-in'); // name resolved from Routes.signIn
    });

    it('should detect TypedGoRoute annotation paths', () => {
      writeFile('pubspec.yaml', 'name: app\ndependencies:\n  go_router: ^16.2.4\n');
      writeFile('lib/routes.dart', `
@TypedGoRoute<HomeRoute>(path: '/home')
class HomeRoute extends GoRouteData {}
`);
      const paths = new RouteScanner(tmpDir).scan().map((r) => r.path);
      expect(paths).toContain('/home');
    });
  });

  describe('Flutter auto_route routes', () => {
    it('should detect AutoRoute page and path', () => {
      writeFile('pubspec.yaml', 'name: app\ndependencies:\n  auto_route: ^9.0.0\n');
      writeFile('lib/router.dart', `
@AutoRouterConfig()
class AppRouter extends RootStackRouter {
  List<AutoRoute> get routes => [
    AutoRoute(page: HomeRoute.page, path: '/home'),
    AutoRoute(page: SettingsRoute.page),
  ];
}
`);
      const routes = new RouteScanner(tmpDir).scan();
      const home = routes.find((r) => r.path === '/home');
      expect(home).toBeDefined();
      expect(home!.framework).toBe('autoroute');
      expect(home!.handler).toBe('HomeRoute');
      // page-only route falls back to page name
      expect(routes.some((r) => r.handler === 'SettingsRoute')).toBe(true);
    });
  });
});
