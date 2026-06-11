# Dart Language Extractor — Implementation Plan

> Context document for implementing `DartExtractor`. Written so any engineer (or AI
> assistant) can pick up the task with full context: **what** to build, **how**, and
> **why** each decision was made. Verified against the actual codebase and the
> canonical Dart grammar — not assumptions.

---

## 1. Goal

Add Dart/Flutter support to Engineering OS by implementing a `DartExtractor`.

**Before:** Flutter projects index only ~5 YAML files (`pubspec.yaml`, etc.).
**After:** EOS indexes every `.dart` source file — classes, mixins, enums, extensions,
functions, methods, and imports — making them searchable (`eos_search`), part of the
context bundle (`eos_context`), and nodes in the dependency graph (`eos_dependencies`).

### Files to create / edit
| Action | File | Change |
|---|---|---|
| CREATE | `packages/core/src/knowledge/lang/dart-extractor.ts` | Implement `LanguageExtractor` |
| EDIT | `packages/core/src/knowledge/lang/index.ts` | Register `DartExtractor` in `ALL_EXTRACTORS` + re-export |
| EDIT | `packages/core/src/knowledge/lang/lang-extractors.test.ts` | Add `getExtractorForFile` case + `describe('DartExtractor')` |

### Out of scope (deliberately — keep the PR small and reviewable)
- **Melos monorepo support** — separate PR later.
- **tree-sitter / true-AST parsing** — separate project-wide RFC (see §7).
- **Flutter framework semantics** — widget tree, routing, state management (see §6).

---

## 2. How the extractor system works (read this first)

All 10 existing extractors implement one interface (`index.ts`):

```ts
export interface LanguageExtractor {
  language: string;
  extensions: string[];
  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[];
  extractImports(content: string): string[];
  extractExports(content: string): string[];
}
```

`CodeChunk.type` is a **fixed union** — you may only emit these 7 values
(`packages/shared/src/types/knowledge.ts`):

```ts
type: 'function' | 'class' | 'interface' | 'module' | 'export' | 'method' | 'type'
```

**The universal 3-step algorithm** every extractor follows:
1. Run a regex per construct to find the **name** and **start line**.
2. Call `findBlockEnd(lines, startIdx)` to find the **end line** by counting `{ }` braces
   (exported from `typescript-extractor.ts`). It falls back to `startIdx + 10` if braces
   never balance — this is the shared accuracy ceiling, accepted by all languages.
3. Push a `CodeChunk { filePath, startLine, endLine, content, language, type, name }`.

Dart is the **11th** extractor and follows this exact pattern. **Use `kotlin-extractor.ts`
as the template** — it is the closest match (annotation prefixes, modifier keywords,
expression bodies with `=>` / `=`, brace-delimited blocks).

---

## 3. The one hard problem: Dart functions have no keyword

This is the **only** thing that makes Dart harder than Go/Kotlin/TS.

| Language | How a function is found | Difficulty |
|---|---|---|
| TS/JS | starts with `function` | trivial — keyword |
| Go | starts with `func` | trivial — keyword |
| Kotlin | starts with `fun` | trivial — keyword |
| **Dart** | `ReturnType? name(params) <body>` — **no keyword** | **must anchor on shape** |

A Dart function/method is (verified against the canonical
[tree-sitter-dart grammar](https://github.com/UserNobody14/tree-sitter-dart) —
`function_signature` = `optional(returnType), name, formalParameterPart`):

```
<modifiers?> <returnType?> name ( params ) [async|async*|sync*]?  { … }   // block body
<modifiers?> <returnType?> name ( params ) [async]? => expr ;            // arrow body
```

**Solution:** anchor on the trailing shape — *a name immediately followed by `(...)` and
then a body opener* (`{`, `=>`, `async`, or `;` for abstract) — instead of a leading
keyword. Then exclude false positives with a control-flow denylist.

**This is not a novel risk.** `TypeScriptExtractor` already detects keyword-less **methods**
exactly this way (`typescript-extractor.ts:23`):

```ts
const methodPatternInClass = /^[ \t]+(?:(?:public|private|protected|static|async|readonly)\s+){0,5}(\w+)\s*\([^)]*\)/gm;
// ...skips: if / for / while / switch / catch / constructor
```

We extend the same proven pattern to Dart **top-level** functions as well as methods.

---

## 4. What to extract → which `CodeChunk.type`

Verified against the full Dart member set that tree-sitter tags
([`queries/tags.scm`](https://github.com/UserNobody14/tree-sitter-dart/blob/master/queries/tags.scm)):

| Dart construct | Example | `type` | Rationale |
|---|---|---|---|
| class (+ `abstract`/`sealed`/`base`/`final`/`interface`/`mixin class`) | `sealed class Shape {` | `class` | Dart 3 modifiers precede `class`, like Kotlin |
| mixin | `mixin Walkable {` | `module` | trait-like; matches PHP `trait` → `module` |
| enum (incl. enhanced enums) | `enum Status { active, inactive }` | `type` | matches C#/Rust/PHP enum → `type` |
| extension | `extension StringX on String {` | `class` | named declaration; closest fit in the union |
| top-level function | `Future<void> main() async {` | `function` | keyword-less — see §3 |
| method / getter / setter / operator | `Widget build(BuildContext c) {` | `method` | indented; keyword-less |
| import / export / part | `import 'package:flutter/material.dart';` | `module` | matches how other langs map imports |

**Member forms the function/method regex must also handle** (from grammar.js):
- getter: `int get count => …`
- setter: `set count(int v) { … }`
- named constructor: `Foo.named() { … }`
- factory: `factory Foo() => …`
- operator: `operator +(o) { … }`

> Constructors look identical to return-type-less functions (`Foo(...)`). That's fine —
> tree-sitter tags them too. Capturing them is correct, not a bug.

---

## 5. Implementation detail per method

### `language` / `extensions`
```ts
language = 'dart';
extensions = ['.dart'];
```

### `extractChunks`
Build these regexes (model on `kotlin-extractor.ts`). All use the `m` flag; class-like
ones anchor at `^[ \t]*` to allow leading indentation/modifiers.

1. **Classes** — covers all Dart 3 modifiers:
   `/^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*(?:abstract\s+|base\s+|final\s+|sealed\s+|interface\s+|mixin\s+)*class\s+(\w+)/gm`
2. **Mixins** — `mixin Name` and `mixin class Name`:
   `/^[ \t]*(?:base\s+)?mixin(?:\s+class)?\s+(\w+)/gm` → type `module`
3. **Enums** — `/^[ \t]*enum\s+(\w+)/gm` → type `type`
4. **Extensions** — `/^[ \t]*extension\s+(\w+)\s+on\s+/gm` → type `class`
   (skip anonymous `extension on X` — no name to index)
5. **Top-level functions** — keyword-less, anchored on `name(...)` + body. Require the
   match to be at column 0 (top-level) and be followed by `{`, `=>`, or an `async`/`sync*`
   modifier. Denylist: `if for while switch catch return throw assert do else` + bare
   control words.
6. **Methods** — same shape but indented (`^[ \t]+`). Reuse the TS denylist
   (`if/for/while/switch/catch/constructor`) plus Dart additions.

Use a `findBlockEnd` for block bodies and a Kotlin-style `findFunctionEnd` for `=>`
expression bodies (Kotlin already solves arrow/expression bodies — copy that logic).

**Dedup** identical to Kotlin: filter on `${name}:${startLine}:${type}` to drop overlaps
between the class regex and the more specific modifier regex, and between top-level and
method matches.

### `extractImports`
Dart import paths are **quoted strings** (unlike Kotlin's bare paths). Handle `import`,
`export`, and `part`:
```ts
/^\s*(?:import|export|part)\s+(['"])(.+?)\1/gm   // capture group 2 = the path
```
Strip trailing `show` / `hide` / `as` / `deferred` clauses — they are not part of the path.

### `extractExports`
Dart has explicit `export '...'` directives **and** a naming convention: a leading
underscore (`_Foo`) means library-private. So exports =
- every path in an `export '...'` directive, **plus**
- every top-level declaration whose name does **not** start with `_`.

---

## 6. Will this actually help Flutter apps? (honest scope)

**Yes — for the symbol/search/dependency half, which is EOS's core.** A real widget:
```dart
class HomePage extends StatelessWidget {
  const HomePage({super.key});
  @override
  Widget build(BuildContext context) { return Scaffold(/* … */); }
}
```
Extractor captures `HomePage` (class) and `build` (method) + imports → searchable,
in-context, graphed. Today EOS sees none of this. That's the win, and it reaches **parity
with Go/Kotlin/TS** for symbol indexing.

**What it does NOT do (and shouldn't pretend to):**
- No Flutter framework intelligence — widget tree, `setState`, `Navigator`/`GoRouter`
  routing, `BuildContext` flow are framework patterns, not language symbols.
- No routes — Flutter **client** apps have no HTTP endpoints, so EOS's route/architecture
  features (a large part of `eos_context` for backends) stay empty. This is a
  framework-domain gap, **not** an extractor weakness.
- `endLine` can drift on deeply nested `build()` trees if braces appear in strings/comments
  — the **same** limitation every other extractor has via `findBlockEnd`. Symbol name and
  start line are always correct.

PR description should say *"indexes Dart source symbols,"* not *"understands Flutter."*

---

## 7. Why regex, not tree-sitter (decision record)

- `eos_recall_decision` returned **no prior decision** on extractor architecture.
- All 10 existing extractors are **regex, synchronous, zero parser dependencies**.
- `eos_impact` on `index.ts` = **LOW** risk; this change only *appends* to `ALL_EXTRACTORS`
  and does **not** touch the `LanguageExtractor` interface.

**100% accuracy with regex is impossible** — Dart's grammar is recursive (nested generics
`Future<Map<String,List<int>>>`, function-typed params, multi-line signatures, arbitrary
expression bodies). Regex cannot balance `<>`/`()`. **But no extractor in this repo hits
100%** — they all sit at heuristic ~90–95%. **Dart at parity is the correct contribution.**

A true-AST approach (`web-tree-sitter` WASM + tree-sitter-dart + its `tags.scm`) is the only
path to ~100%, but it adds a WASM dependency and forces the synchronous `extractChunks`
interface to become async across **all 10** extractors + callers — HIGH risk, project-wide.
That belongs in a separate **"RFC: tree-sitter backend for all extractors"** issue, decided
by maintainers — not smuggled into a "add Dart support" PR.

**Decision: regex heuristic, kotlin-extractor template. Matches architecture, LOW risk,
mergeable.**

---

## 8. Tests to add (`lang-extractors.test.ts`)

Follow the existing per-language `describe` style. Each test builds `content`, splits to
`lines`, calls `extractChunks`, and asserts `chunks.some(c => c.name === … && c.type === …)`.

1. `getExtractorForFile('main.dart')` → `DartExtractor` (add import at top of test file).
2. class: `class HomePage extends StatelessWidget {` → `HomePage` / `class`
3. abstract & sealed class → `class`
4. mixin: `mixin Walkable {` → `module`
5. enum: `enum Status { active, inactive }` → `type`
6. enhanced enum (with members/methods) → `type`
7. extension: `extension StringX on String {` → `class`
8. top-level function: `Future<void> main() async {` → `main` / `function`
9. arrow function: `int add(int a, int b) => a + b;` → `add` / `function`
10. method: `Widget build(BuildContext c) {` inside a class → `build` / `method`
11. imports: `import 'package:flutter/material.dart';` → path in `extractImports`
12. control-flow skip: `if (x) { … }` inside a method must **not** produce a chunk named `if`

---

## 9. Definition of done
- [ ] `dart-extractor.ts` created, implements `LanguageExtractor`, modeled on Kotlin.
- [ ] `index.ts`: imported, added to `ALL_EXTRACTORS`, re-exported.
- [ ] Tests added and passing (`vitest`).
- [ ] `getExtractorForFile('x.dart')` returns a `DartExtractor`.
- [ ] No change to the `LanguageExtractor` interface or any other extractor.
- [ ] Call `eos_learn` to record any Dart-specific gotchas discovered during implementation.

---

*Verified against: `kotlin-extractor.ts`, `typescript-extractor.ts`, `go-extractor.ts`,
`index.ts`, `lang-extractors.test.ts`, `packages/shared/src/types/knowledge.ts`, and the
canonical [tree-sitter-dart](https://github.com/UserNobody14/tree-sitter-dart) grammar +
[Dart language spec](https://dart.dev/language).*
