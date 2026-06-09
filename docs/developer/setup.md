# Build & Development Setup

Everything you need to clone, modify, build, and publish `@xlr8-nest/core`.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Repository layout](#repository-layout)
- [Install dependencies](#install-dependencies)
- [Build](#build)
- [TypeScript configuration](#typescript-configuration)
- [Type-check (without building)](#type-check-without-building)
- [Lint](#lint)
- [Format](#format)
- [Adding a new subpath module](#adding-a-new-subpath-module)
- [Versioning & publishing](#versioning--publishing)
- [Peer dependency matrix](#peer-dependency-matrix)
- [Known tooling gaps](#known-tooling-gaps)

---

## Prerequisites

| Tool | Minimum version | Why |
|---|---|---|
| Node.js | 18.0.0 | Runtime; `AsyncLocalStorage` requires ≥16, crypto UUID requires ≥18 |
| npm | 8.0.0 | Workspace scripts |
| TypeScript | 5.x (devDep) | Compiler; the library targets ES2021 |

---

## Repository layout

```
xlr8-nest-core/
├── lib/                    # All source code (TypeScript)
│   ├── core/               # Foundation: constants, utils, root barrel
│   │   ├── constants/      # StatusCode, CommonErrors
│   │   ├── utils/          # validateInput (Zod → BadRequestError)
│   │   └── index.ts        # Root barrel (re-exports foundation only)
│   ├── types/              # Pure TypeScript contracts (no runtime)
│   ├── errors/             # BaseError + HTTP subclasses
│   ├── response/           # Response builders + GlobalExceptionFilter
│   ├── validator/          # @Validate + ZodValidationPipe
│   ├── openapi/            # Swagger composite decorators
│   ├── authz/              # Authorization framework
│   ├── ddd/                # DDD primitives + CQRS/Event buses
│   ├── database/           # TypeORM extension + Unit of Work
│   └── messaging/          # Transactional outbox
├── dist/                   # Compiled output (generated; not in VCS)
├── docs/                   # Documentation (you are here)
├── tsup.config.ts          # Build configuration
├── tsconfig.json           # TypeScript compiler options
├── eslint.config.mjs       # ESLint flat config
├── .prettierrc             # Prettier config
└── package.json
```

---

## Install dependencies

```bash
npm install
```

This installs all `devDependencies` (NestJS, TypeORM, RxJS, Zod, tsup, etc.). The library's own
`peerDependencies` are declared as `devDependencies` so they are available during local builds and
typechecking.

---

## Build

```bash
npm run build
```

Runs `tsup` using [tsup.config.ts](../../tsup.config.ts). What it does:

1. **Multiple entry points** — each subpath (`ddd`, `authz`, `database`, …) gets its own entry file,
   corresponding directly to a `package.json` `"exports"` key.
2. **Dual format** — every entry is compiled to both `cjs` (`.js`) and `esm` (`.mjs`).
3. **Type declarations** — `dts: true` generates `.d.ts` and `.d.mts` for each entry.
4. **Source maps** — `.js.map` / `.mjs.map` for debugging.
5. **Externals** — peer dependencies (`@nestjs/*`, `typeorm`, `rxjs`, `zod`, etc.) are never bundled.
6. **No minification** — `minify: false` keeps the output readable (library code, not application code).
7. **Tree-shaking** — `treeshake: true` eliminates unused exports within each entry.
8. **Clean on build** — `clean: true` removes the `dist/` folder before each build.

Output structure mirrors the entry map:

```
dist/
├── index.js / index.mjs / index.d.ts / index.d.mts   (root barrel)
├── ddd/index.js, index.mjs, index.d.ts, index.d.mts
├── authz/...
├── database/...
├── messaging/...
├── constants/...
├── errors/...
├── openapi/...
├── response/...
├── types/...
├── utils/...      (also aliased as ./util in package.json exports)
├── validator/...
└── authz/...
```

---

## TypeScript configuration

Key settings in [tsconfig.json](../../tsconfig.json):

| Setting | Value | Notes |
|---|---|---|
| `target` | `ES2021` | Supports `AsyncLocalStorage`, `??=`, `?.` natively |
| `module` | `NodeNext` | Required for `package.json` exports conditional imports |
| `moduleResolution` | `NodeNext` | Matches `module: NodeNext` |
| `strict` | `true` | All strict checks enabled … |
| `strictNullChecks` | `false` | … except null checks (known gap; tracked in improvement plan) |
| `experimentalDecorators` | `true` | Required for NestJS / reflect-metadata decorators |
| `emitDecoratorMetadata` | `true` | Required for NestJS DI parameter type emission |
| `isolatedModules` | `true` | Ensures each file is independently compilable (compatible with tsup/SWC) |
| `noEmit` | `true` | `tsc` is used only for type-checking; `tsup` does the actual emit |

---

## Type-check (without building)

```bash
npm run typecheck
```

Runs `tsc --noEmit`. Catches type errors across all source files without producing any output.
Run this before every commit.

---

## Lint

```bash
npm run lint          # Report lint errors
npm run lint:fix      # Auto-fix fixable errors
```

Uses ESLint with `typescript-eslint` (flat config in `eslint.config.mjs`).

---

## Format

```bash
npm run format
```

Runs Prettier over all `*.ts`, `*.json`, and `*.md` files. Run after writing new code or docs.

---

## Adding a new subpath module

When you add a completely new module (e.g. `@xlr8-nest/core/cache`):

1. Create `lib/cache/` with source files and an `index.ts` barrel.
2. Add an entry to `tsup.config.ts`:
   ```typescript
   'cache/index': 'lib/cache/index.ts',
   ```
3. Add an export entry to `package.json`:
   ```json
   "./cache": {
     "import": { "types": "./dist/cache/index.d.mts", "default": "./dist/cache/index.mjs" },
     "require": { "types": "./dist/cache/index.d.ts",  "default": "./dist/cache/index.js" }
   }
   ```
4. If the module uses side-effects (decorators writing reflect-metadata), add it to `sideEffects`:
   ```json
   "sideEffects": ["./dist/cache/index.js", "./dist/cache/index.mjs"]
   ```
5. Run `npm run build && npm run typecheck` to validate.

See [extending/new-module.md](./extending/new-module.md) for a complete step-by-step walkthrough.

---

## Versioning & publishing

The library follows **semantic versioning** (`MAJOR.MINOR.PATCH`):

| Change type | Version bump | Notes |
|---|---|---|
| Breaking API change | MAJOR | Removing/renaming exports, changing constructor signatures, changing default behavior |
| New feature (backward-compatible) | MINOR | New exports, new optional parameters |
| Bug fix | PATCH | Behavior corrections that don't break the public API |

Publishing steps:

```bash
# 1. Bump the version in package.json
npm version patch   # or minor / major

# 2. Build (prepublishOnly script runs this automatically)
npm run build

# 3. Typecheck
npm run typecheck

# 4. Update CHANGELOG.md

# 5. Publish to npm
npm publish
```

`prepublishOnly` in `package.json` runs `npm run build` automatically before `npm publish`.

The `"files"` field in `package.json` controls what is shipped to npm:
```json
"files": ["dist", "README.md", "CHANGELOG.md"]
```

Source files (`lib/`), docs, and config files are intentionally excluded from the published package.

---

## Peer dependency matrix

| Peer | Optional? | Required by |
|---|---|---|
| `@nestjs/common` + `@nestjs/core` | no | every NestJS module |
| `@nestjs/event-emitter` | yes | `@xlr8-nest/core/ddd` (EventBus) |
| `@nestjs/swagger` | yes | `@xlr8-nest/core/openapi` |
| `@nestjs/typeorm` + `typeorm` | yes | `@xlr8-nest/core/database`, `@xlr8-nest/core/messaging` |
| `rxjs` | yes | `@xlr8-nest/core/ddd` (EventBus saga streams) |
| `reflect-metadata` | yes | `@xlr8-nest/core/ddd` (decorator metadata) |
| `zod` | yes | `@xlr8-nest/core/validator`, `@xlr8-nest/core/utils` |
| `nest-commander` | yes | `@xlr8-nest/core/database` CLI commands |
| `@faker-js/faker` | yes | `@xlr8-nest/core/database` (`BaseFactory`) |
| `@sqltools/formatter` | yes | `@xlr8-nest/core/database` (migration generation) |

"Optional" means the peer is declared as optional in `peerDependenciesMeta`. However, installing
the module that uses it without the peer will cause a runtime error — optional here means the peer
is only needed if the consumer uses that particular feature, not that it can be absent on install.

---

## Known tooling gaps

- **No test runner** — there are currently zero automated tests. Every `npm run build` + `npm run typecheck` is the entire CI gate. The improvement plan tracks this as a critical gap.
- **No Jest/Vitest config** — if you are adding tests, you will need to bootstrap the test runner configuration first.
- **`strictNullChecks: false`** — the compiler does not catch null/undefined misuse. Fix this incrementally: flip the flag, fix each error as you touch a file.
