import { describe, it, expect } from 'vitest';
import { TypeScriptExtractor } from './typescript-extractor';
import { PythonExtractor } from './python-extractor';
import { GoExtractor } from './go-extractor';
import { RustExtractor } from './rust-extractor';
import { JavaExtractor } from './java-extractor';
import { RubyExtractor } from './ruby-extractor';
import { CSharpExtractor } from './csharp-extractor';
import { PhpExtractor } from './php-extractor';
import { ShellExtractor } from './shell-extractor';
import { DartExtractor } from './dart-extractor';
import { getExtractorForFile } from './index';

describe('Language Extractors', () => {
  describe('getExtractorForFile', () => {
    it('returns correct extractor for TypeScript', () => {
      const ext = getExtractorForFile('app.ts');
      expect(ext).toBeInstanceOf(TypeScriptExtractor);
    });

    it('returns correct extractor for Go', () => {
      const ext = getExtractorForFile('main.go');
      expect(ext).toBeInstanceOf(GoExtractor);
    });

    it('returns correct extractor for C#', () => {
      const ext = getExtractorForFile('Program.cs');
      expect(ext).toBeInstanceOf(CSharpExtractor);
    });

    it('returns correct extractor for PHP', () => {
      const ext = getExtractorForFile('index.php');
      expect(ext).toBeInstanceOf(PhpExtractor);
    });

    it('returns correct extractor for Shell', () => {
      const ext = getExtractorForFile('deploy.sh');
      expect(ext).toBeInstanceOf(ShellExtractor);
    });

    it('returns correct extractor for Bash', () => {
      const ext = getExtractorForFile('build.bash');
      expect(ext).toBeInstanceOf(ShellExtractor);
    });

    it('returns correct extractor for Dart', () => {
      const ext = getExtractorForFile('main.dart');
      expect(ext).toBeInstanceOf(DartExtractor);
    });

    it('returns null for unsupported files', () => {
      expect(getExtractorForFile('file.txt')).toBeNull();
    });
  });

  describe('GoExtractor', () => {
    const extractor = new GoExtractor();

    it('extracts functions', () => {
      const content = 'func HandleRequest(w http.ResponseWriter, r *http.Request) {\n  w.Write([]byte("ok"))\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'handler.go');
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].name).toBe('HandleRequest');
      expect(chunks[0].type).toBe('function');
    });

    it('extracts structs', () => {
      const content = 'type User struct {\n  Name string\n  Email string\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'models.go');
      expect(chunks[0].name).toBe('User');
      expect(chunks[0].type).toBe('class');
    });

    it('extracts imports', () => {
      const content = 'import (\n  "fmt"\n  "net/http"\n)\n';
      const imports = extractor.extractImports(content);
      expect(imports).toContain('fmt');
      expect(imports).toContain('net/http');
    });

    it('extracts exports (uppercase names)', () => {
      const content = 'func PublicFunc() {}\nfunc privateFunc() {}\ntype PublicStruct struct{}\n';
      const exports = extractor.extractExports(content);
      expect(exports).toContain('PublicFunc');
      expect(exports).toContain('PublicStruct');
      expect(exports).not.toContain('privateFunc');
    });
  });

  describe('RustExtractor', () => {
    const extractor = new RustExtractor();

    it('extracts functions', () => {
      const content = 'pub fn process(data: &str) -> Result<(), Error> {\n    Ok(())\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'lib.rs');
      expect(chunks[0].name).toBe('process');
      expect(chunks[0].type).toBe('function');
    });

    it('extracts structs and enums', () => {
      const content = 'pub struct Config {\n  port: u16,\n}\n\npub enum Status {\n  Active,\n  Inactive,\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'types.rs');
      expect(chunks.some((c) => c.name === 'Config' && c.type === 'class')).toBe(true);
      expect(chunks.some((c) => c.name === 'Status' && c.type === 'type')).toBe(true);
    });

    it('extracts imports', () => {
      const content = 'use std::collections::HashMap;\nuse crate::models::User;\n';
      const imports = extractor.extractImports(content);
      expect(imports).toContain('std::collections::HashMap');
    });
  });

  describe('JavaExtractor', () => {
    const extractor = new JavaExtractor();

    it('extracts classes', () => {
      const content = 'public class UserService {\n  public void save() {\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'UserService.java');
      expect(chunks.some((c) => c.name === 'UserService' && c.type === 'class')).toBe(true);
    });

    it('extracts methods', () => {
      const content = 'public class Svc {\n  public String getName() {\n    return name;\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Svc.java');
      expect(chunks.some((c) => c.name === 'getName' && c.type === 'method')).toBe(true);
    });

    it('extracts imports', () => {
      const content = 'import java.util.List;\nimport static org.junit.Assert.*;\n';
      const imports = extractor.extractImports(content);
      expect(imports).toContain('java.util.List');
    });
  });

  describe('RubyExtractor', () => {
    const extractor = new RubyExtractor();

    it('extracts methods', () => {
      const content = 'def calculate_total\n  items.sum(&:price)\nend\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'cart.rb');
      expect(chunks[0].name).toBe('calculate_total');
      expect(chunks[0].type).toBe('function');
    });

    it('extracts classes and modules', () => {
      const content = 'module Payments\n  class Processor\n    def run\n    end\n  end\nend\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'payments.rb');
      expect(chunks.some((c) => c.name === 'Payments' && c.type === 'module')).toBe(true);
      expect(chunks.some((c) => c.name === 'Processor' && c.type === 'class')).toBe(true);
    });

    it('extracts imports', () => {
      const content = "require 'json'\nrequire_relative 'helpers'\n";
      const imports = extractor.extractImports(content);
      expect(imports).toContain('json');
      expect(imports).toContain('helpers');
    });
  });

  describe('CSharpExtractor', () => {
    const extractor = new CSharpExtractor();

    it('extracts classes', () => {
      const content = 'public class UserService {\n  public void Save() {\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'UserService.cs');
      expect(chunks.some((c) => c.name === 'UserService' && c.type === 'class')).toBe(true);
    });

    it('extracts interfaces', () => {
      const content = 'public interface IUserRepository {\n  Task<User> GetById(int id);\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'IUserRepository.cs');
      expect(chunks.some((c) => c.name === 'IUserRepository' && c.type === 'interface')).toBe(true);
    });

    it('extracts structs', () => {
      const content = 'public readonly struct Point {\n  public int X { get; }\n  public int Y { get; }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Point.cs');
      expect(chunks.some((c) => c.name === 'Point' && c.type === 'class')).toBe(true);
    });

    it('extracts records', () => {
      const content = 'public record Person(string Name, int Age);\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Person.cs');
      expect(chunks.some((c) => c.name === 'Person' && c.type === 'class')).toBe(true);
    });

    it('extracts methods', () => {
      const content = 'public class Svc {\n  public async Task<string> GetName() {\n    return name;\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Svc.cs');
      expect(chunks.some((c) => c.name === 'GetName' && c.type === 'method')).toBe(true);
    });

    it('extracts enums', () => {
      const content = 'public enum Status {\n  Active,\n  Inactive\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Status.cs');
      expect(chunks.some((c) => c.name === 'Status' && c.type === 'type')).toBe(true);
    });

    it('extracts imports (using statements)', () => {
      const content = 'using System;\nusing System.Collections.Generic;\nusing static System.Math;\n';
      const imports = extractor.extractImports(content);
      expect(imports).toContain('System');
      expect(imports).toContain('System.Collections.Generic');
      expect(imports).toContain('System.Math');
    });

    it('extracts exports (public types)', () => {
      const content = 'public class UserService {\n}\npublic interface IRepo {\n}\ninternal class Helper {\n}\n';
      const exports = extractor.extractExports(content);
      expect(exports).toContain('UserService');
      expect(exports).toContain('IRepo');
      expect(exports).not.toContain('Helper');
    });

    it('skips control-flow keywords in method extraction', () => {
      const content = 'public class Svc {\n  public void Run() {\n    if (true) {\n    }\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Svc.cs');
      expect(chunks.some((c) => c.name === 'if')).toBe(false);
    });
  });

  describe('PhpExtractor', () => {
    const extractor = new PhpExtractor();

    it('extracts classes', () => {
      const content = 'class UserController {\n  public function index() {\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'UserController.php');
      expect(chunks.some((c) => c.name === 'UserController' && c.type === 'class')).toBe(true);
    });

    it('extracts abstract classes', () => {
      const content = 'abstract class BaseModel {\n  abstract public function save();\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'BaseModel.php');
      expect(chunks.some((c) => c.name === 'BaseModel' && c.type === 'class')).toBe(true);
    });

    it('extracts interfaces', () => {
      const content = 'interface Cacheable {\n  public function getCacheKey(): string;\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Cacheable.php');
      expect(chunks.some((c) => c.name === 'Cacheable' && c.type === 'interface')).toBe(true);
    });

    it('extracts traits', () => {
      const content = 'trait HasTimestamps {\n  public function getCreatedAt() {\n    return $this->created_at;\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'HasTimestamps.php');
      expect(chunks.some((c) => c.name === 'HasTimestamps' && c.type === 'module')).toBe(true);
    });

    it('extracts enums', () => {
      const content = 'enum Status {\n  case Active;\n  case Inactive;\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Status.php');
      expect(chunks.some((c) => c.name === 'Status' && c.type === 'type')).toBe(true);
    });

    it('extracts standalone functions', () => {
      const content = 'function helper_format($value) {\n  return trim($value);\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'helpers.php');
      expect(chunks.some((c) => c.name === 'helper_format' && c.type === 'function')).toBe(true);
    });

    it('extracts methods', () => {
      const content = 'class Svc {\n  public static function getInstance() {\n    return self::$instance;\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Svc.php');
      expect(chunks.some((c) => c.name === 'getInstance' && c.type === 'method')).toBe(true);
    });

    it('extracts imports (use and require)', () => {
      const content = "use App\\Models\\User;\nuse Illuminate\\Http\\Request;\nrequire_once 'config.php';\n";
      const imports = extractor.extractImports(content);
      expect(imports).toContain('App\\Models\\User');
      expect(imports).toContain('Illuminate\\Http\\Request');
      expect(imports).toContain('config.php');
    });

    it('extracts exports (namespaces and classes)', () => {
      const content = 'namespace App\\Controllers;\n\nclass UserController {\n}\n';
      const exports = extractor.extractExports(content);
      expect(exports).toContain('App\\Controllers');
      expect(exports).toContain('UserController');
    });
  });

  describe('ShellExtractor', () => {
    const extractor = new ShellExtractor();

    it('extracts function keyword style', () => {
      const content = 'function deploy() {\n  echo "deploying"\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'deploy.sh');
      expect(chunks.some((c) => c.name === 'deploy' && c.type === 'function')).toBe(true);
    });

    it('extracts paren style functions', () => {
      const content = 'build() {\n  make -j4\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'build.sh');
      expect(chunks.some((c) => c.name === 'build' && c.type === 'function')).toBe(true);
    });

    it('extracts function keyword without parens', () => {
      const content = 'function cleanup {\n  rm -rf tmp/\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'cleanup.sh');
      expect(chunks.some((c) => c.name === 'cleanup' && c.type === 'function')).toBe(true);
    });

    it('skips shell keywords', () => {
      const content = 'if () {\n  echo "no"\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'test.sh');
      expect(chunks.some((c) => c.name === 'if')).toBe(false);
    });

    it('extracts imports (source and dot)', () => {
      const content = 'source ./env.sh\n. /etc/profile\nsource "lib/utils.sh"\n';
      const imports = extractor.extractImports(content);
      expect(imports).toContain('./env.sh');
      expect(imports).toContain('/etc/profile');
      expect(imports).toContain('lib/utils.sh');
    });

    it('extracts exports', () => {
      const content = 'export PATH\nexport DB_HOST="localhost"\nexport -f my_func\n';
      const exports = extractor.extractExports(content);
      expect(exports).toContain('PATH');
      expect(exports).toContain('DB_HOST');
    });

    it('handles nested braces', () => {
      const content = 'function outer() {\n  if [ -f file ]; then\n    echo "found" # comment with }\n  fi\n  echo "done"\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'nested.sh');
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].name).toBe('outer');
    });
  });

  describe('DartExtractor', () => {
    const extractor = new DartExtractor();

    it('extracts classes', () => {
      const content = 'class HomePage extends StatelessWidget {\n  const HomePage({super.key});\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'home_page.dart');
      expect(chunks.some((c) => c.name === 'HomePage' && c.type === 'class')).toBe(true);
    });

    it('extracts abstract and sealed classes', () => {
      const content = 'abstract class Repository {\n}\n\nsealed class Shape {\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'models.dart');
      expect(chunks.some((c) => c.name === 'Repository' && c.type === 'class')).toBe(true);
      expect(chunks.some((c) => c.name === 'Shape' && c.type === 'class')).toBe(true);
    });

    it('extracts stacked Dart 3 class modifiers', () => {
      const content = 'abstract base class Animal {\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'animal.dart');
      expect(chunks.some((c) => c.name === 'Animal' && c.type === 'class')).toBe(true);
    });

    it('extracts mixins', () => {
      const content = 'mixin Walkable {\n  void walk() {}\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'walkable.dart');
      expect(chunks.some((c) => c.name === 'Walkable' && c.type === 'module')).toBe(true);
    });

    it('extracts enums', () => {
      const content = 'enum Status { active, inactive }\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'status.dart');
      expect(chunks.some((c) => c.name === 'Status' && c.type === 'type')).toBe(true);
    });

    it('extracts enhanced enums with members and methods', () => {
      const content =
        'enum Planet {\n  earth(5.97),\n  mars(6.42);\n\n  const Planet(this.mass);\n  final double mass;\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'planet.dart');
      expect(chunks.some((c) => c.name === 'Planet' && c.type === 'type')).toBe(true);
    });

    it('extracts extensions', () => {
      const content = "extension StringX on String {\n  bool get isBlank => trim().isEmpty;\n}\n";
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'string_x.dart');
      expect(chunks.some((c) => c.name === 'StringX' && c.type === 'class')).toBe(true);
    });

    it('extracts extension types (Dart 3.3+) and not as functions', () => {
      const content = 'extension type Meters(int value) {\n  Meters operator +(Meters o) => Meters(value + o.value);\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'meters.dart');
      expect(chunks.some((c) => c.name === 'Meters' && c.type === 'class')).toBe(true);
      expect(chunks.some((c) => c.name === 'Meters' && c.type === 'function')).toBe(false);
    });

    it('extracts extension types with const and implements clause', () => {
      const content = 'extension type const NumberI(int i) implements int {\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'number.dart');
      expect(chunks.some((c) => c.name === 'NumberI' && c.type === 'class')).toBe(true);
    });

    it('captures primary-constructor classes (3.13) as class, not function', () => {
      const content = 'class Point(final int x, final int y);\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'point.dart');
      expect(chunks.some((c) => c.name === 'Point' && c.type === 'class')).toBe(true);
      expect(chunks.some((c) => c.name === 'Point' && c.type === 'function')).toBe(false);
    });

    it('extracts top-level functions (keyword-less)', () => {
      const content = "Future<void> main() async {\n  runApp(const MyApp());\n}\n";
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'main.dart');
      expect(chunks.some((c) => c.name === 'main' && c.type === 'function')).toBe(true);
    });

    it('extracts arrow expression functions', () => {
      const content = 'int add(int a, int b) => a + b;\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'math.dart');
      expect(chunks.some((c) => c.name === 'add' && c.type === 'function')).toBe(true);
    });

    it('extracts methods inside a class', () => {
      const content =
        'class HomePage extends StatelessWidget {\n  @override\n  Widget build(BuildContext context) {\n    return Scaffold();\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'home_page.dart');
      expect(chunks.some((c) => c.name === 'build' && c.type === 'method')).toBe(true);
    });

    it('extracts getters', () => {
      const content = 'class Cart {\n  int get total => 42;\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'cart.dart');
      expect(chunks.some((c) => c.name === 'total' && c.type === 'method')).toBe(true);
    });

    it('extracts imports, exports, and parts', () => {
      const content =
        "import 'package:flutter/material.dart';\nimport 'dart:async' show Future;\nexport 'src/widgets.dart';\npart 'home.g.dart';\n";
      const imports = extractor.extractImports(content);
      expect(imports).toContain('package:flutter/material.dart');
      expect(imports).toContain('dart:async');
      expect(imports).toContain('src/widgets.dart');
      expect(imports).toContain('home.g.dart');
    });

    it('extracts exports (export directives and public declarations)', () => {
      const content = "export 'src/api.dart';\nclass PublicWidget {\n}\nclass _PrivateState {\n}\n";
      const exports = extractor.extractExports(content);
      expect(exports).toContain('src/api.dart');
      expect(exports).toContain('PublicWidget');
      expect(exports).not.toContain('_PrivateState');
    });

    it('skips control-flow keywords in function extraction', () => {
      const content =
        'void run() {\n  if (ready) {\n    doWork();\n  }\n  for (var i = 0; i < 3; i++) {\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'run.dart');
      expect(chunks.some((c) => c.name === 'if')).toBe(false);
      expect(chunks.some((c) => c.name === 'for')).toBe(false);
    });
  });
});
