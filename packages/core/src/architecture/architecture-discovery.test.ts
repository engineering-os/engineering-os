import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ArchitectureDiscovery } from './architecture-discovery';

describe('ArchitectureDiscovery — Flutter/Dart', () => {
  let tmpDir: string;
  let discovery: ArchitectureDiscovery;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-arch-flutter-'));
    discovery = new ArchitectureDiscovery(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content = ''): void {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  function scaffoldFlutterApp(): void {
    writeFile('pubspec.yaml', `name: lume
description: A sample Flutter app
dependencies:
  flutter:
    sdk: flutter
  flutter_bloc: ^8.0.0
  firebase_auth: ^4.0.0
dev_dependencies:
  flutter_test:
    sdk: flutter
`);
    writeFile('lib/main.dart', 'void main() {}');
    // feature-first: features/<feature>/{domain,data,presentation}
    writeFile('lib/features/auth/domain/usecases/sign_in.dart', 'class SignIn {}');
    writeFile('lib/features/auth/data/repositories/auth_repository.dart', 'class AuthRepository {}');
    writeFile('lib/features/auth/presentation/bloc/auth_bloc.dart', 'class AuthBloc {}');
    writeFile('lib/features/work_log/presentation/pages/work_log_page.dart', 'class WorkLogPage {}');
    // cross-cutting
    writeFile('lib/core/theme/theme_cubit.dart', 'class ThemeCubit {}');
    writeFile('lib/shared/widgets/error_state_widget.dart', 'class ErrorStateWidget {}');
    // tests in test/
    writeFile('test/features/auth/auth_bloc_test.dart', '');
  }

  it('discovers the root service from pubspec.yaml with parsed deps', async () => {
    scaffoldFlutterApp();
    const services = await discovery.discoverServices();

    const root = services.find((s) => s.name === path.basename(tmpDir));
    expect(root).toBeDefined();
    expect(root!.description).toBe('A sample Flutter app');
    expect(root!.dependencies).toContain('flutter_bloc');
    expect(root!.dependencies).toContain('firebase_auth');
  });

  it('discovers feature modules from lib/features', async () => {
    scaffoldFlutterApp();
    const services = await discovery.discoverServices();
    const names = services.map((s) => s.name);

    expect(names).toContain('auth');
    expect(names).toContain('work_log');

    const auth = services.find((s) => s.name === 'auth')!;
    expect(auth.criticality).toBe('critical'); // auth → critical
  });

  it('discovers core/shared as supporting modules', async () => {
    scaffoldFlutterApp();
    const services = await discovery.discoverServices();
    const names = services.map((s) => s.name);

    expect(names).toContain('shared-core');
    expect(names).toContain('shared-shared');
  });

  it('infers snake_case naming and top-level test directory', async () => {
    scaffoldFlutterApp();
    const conventions = await discovery.inferConventions();
    const byName = Object.fromEntries(conventions.map((c) => [c.name, c.rule]));

    expect(byName['file-naming']).toBe('snake_case');
    expect(byName['test-location']).toBe('in top-level test directory');
  });

  it('detects clean-architecture and bloc patterns from feature layers', async () => {
    scaffoldFlutterApp();
    const services = await discovery.discoverServices();
    const auth = services.find((s) => s.name === 'auth')!;
    expect(auth.patterns).toContain('clean-architecture');
  });

  it('does not double-count lib as its own shared layer', async () => {
    scaffoldFlutterApp();
    const services = await discovery.discoverServices();
    expect(services.find((s) => s.name === 'shared-lib')).toBeUndefined();
  });

  it('detects lume-style stack patterns (bloc, DI, routing, firebase, clean-arch)', async () => {
    scaffoldFlutterApp();
    // enrich pubspec with the real lume stack
    writeFile('pubspec.yaml', `name: lume
description: a personal work journal.
dependencies:
  flutter_bloc: ^9.1.1
  go_router: ^16.2.4
  get_it: ^8.2.0
  injectable: ^2.5.2
  cloud_firestore: ^6.0.2
  firebase_auth: ^6.1.0
  freezed_annotation: ^2.0.0
  dio: ^5.0.0
  shared_preferences: ^2.5.4
`);
    const names = (await discovery.discoverPatterns()).map((p) => p.name);

    expect(names).toContain('feature-first');
    expect(names).toContain('clean-architecture');
    expect(names).toContain('bloc');
    expect(names).toContain('dependency-injection');
    expect(names).toContain('declarative-routing');
    expect(names).toContain('firebase-backend');
    expect(names).toContain('rest-networking');
    expect(names).toContain('local-persistence');
  });

  it('detects alternative stacks (riverpod, mvvm via stacked, getx, signals)', async () => {
    writeFile('lib/main.dart', 'void main() {}');
    writeFile('pubspec.yaml', `name: alt
dependencies:
  hooks_riverpod: ^2.0.0
  stacked: ^3.0.0
  get: ^4.0.0
  signals_flutter: ^5.0.0
  mobx: ^2.0.0
`);
    const names = (await discovery.discoverPatterns()).map((p) => p.name);

    expect(names).toContain('riverpod');
    expect(names).toContain('mvvm'); // stacked
    expect(names).toContain('getx');
    expect(names).toContain('signals');
    expect(names).toContain('mobx');
  });

  it('returns no flutter patterns for a non-Dart project', async () => {
    writeFile('package.json', '{"name":"web"}');
    writeFile('src/app.ts', 'export const x = 1;');
    const names = (await discovery.discoverPatterns()).map((p) => p.name);
    expect(names).not.toContain('bloc');
    expect(names).not.toContain('clean-architecture');
  });

  it('ignores lib/ for JS projects with src/ and no pubspec.yaml', async () => {
    // JS/TS project: src/ is the real source, lib/ is build output.
    writeFile('package.json', '{"name":"web-app"}');
    writeFile('src/features/cart/cart.ts', 'export const cart = 1;');
    writeFile('lib/features/ghost/ghost.js', 'module.exports = {};'); // build output — must be ignored

    const services = await discovery.discoverServices();
    const names = services.map((s) => s.name);
    expect(names).toContain('cart');
    expect(names).not.toContain('ghost');
  });
});
