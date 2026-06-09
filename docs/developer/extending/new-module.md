# Extending: Adding a New Module to the Library

How to add a completely new subpath module (e.g. `@xlr8-nest/core/cache`) — source structure,
build entry, package exports, and peer dependency declaration.

---

## Table of Contents

- [When to add a new module](#when-to-add-a-new-module)
- [Step 1: Create the source structure](#step-1-create-the-source-structure)
- [Step 2: Add a tsup entry point](#step-2-add-a-tsup-entry-point)
- [Step 3: Add package.json exports](#step-3-add-packagejson-exports)
- [Step 4: Declare peer dependencies (if any)](#step-4-declare-peer-dependencies-if-any)
- [Step 5: Handle sideEffects](#step-5-handle-sideeffects)
- [Step 6: Build and typecheck](#step-6-build-and-typecheck)
- [Step 7: Update the root barrel (if appropriate)](#step-7-update-the-root-barrel-if-appropriate)
- [Step 8: Write the developer guide](#step-8-write-the-developer-guide)
- [Checklist](#checklist)

---

## When to add a new module

Add a new module when:
- The feature has different peer dependencies than existing modules (e.g. Redis for caching).
- You want consumers to be able to import the feature without pulling in unrelated code.
- The feature is self-contained with its own NestJS `DynamicModule` or its own set of utilities.

If the feature is small and shares all peers with an existing module, consider adding it to
that module's `lib/<existing>/` folder instead.

---

## Step 1: Create the source structure

```
lib/
└── cache/
    ├── cache.module.ts          # DynamicModule: CacheModule.forRoot(options)
    ├── cache.service.ts         # Injectable service
    ├── decorators/
    │   └── inject-cache.decorator.ts
    ├── types/
    │   └── cache-config.interface.ts
    └── index.ts                 # Public barrel — what consumers can import
```

**`index.ts` — the public barrel:**

```typescript
// lib/cache/index.ts
export { CacheModule } from './cache.module';
export { CacheService } from './cache.service';
export { InjectCache } from './decorators/inject-cache.decorator';
export type { CacheModuleConfig } from './types/cache-config.interface';
```

Only export what is part of the public API. Internal helpers, private types, and implementation
details should NOT be exported.

---

## Step 2: Add a tsup entry point

Open [tsup.config.ts](../../../tsup.config.ts) and add:

```typescript
entry: {
  // ... existing entries ...
  'cache/index': 'lib/cache/index.ts',   // ← add this
},
```

The key (`'cache/index'`) determines the output file path: `dist/cache/index.js` / `.mjs` / `.d.ts`.

---

## Step 3: Add package.json exports

Open `package.json` and add a new export condition:

```json
"exports": {
  "./cache": {
    "import": {
      "types": "./dist/cache/index.d.mts",
      "default": "./dist/cache/index.mjs"
    },
    "require": {
      "types": "./dist/cache/index.d.ts",
      "default": "./dist/cache/index.js"
    }
  }
}
```

The export key (`"./cache"`) becomes the subpath: `import { CacheModule } from '@xlr8-nest/core/cache'`.

---

## Step 4: Declare peer dependencies (if any)

If the new module requires a peer (e.g. `ioredis`), add it to both `peerDependencies` and
`peerDependenciesMeta` in `package.json`:

```json
"peerDependencies": {
  "ioredis": "^5.0.0"
},
"peerDependenciesMeta": {
  "ioredis": { "optional": true }
}
```

Mark it `optional: true` — consumers who don't use the cache module should not be forced to
install it. However, consumers who do import `@xlr8-nest/core/cache` MUST install it.

Add `ioredis` to `devDependencies` so it is available during local builds and typechecking:

```json
"devDependencies": {
  "ioredis": "^5.3.0"
}
```

Add it to `tsup.config.ts` `external` list so it is never bundled:

```typescript
external: [
  // ... existing externals ...
  'ioredis',
]
```

---

## Step 5: Handle sideEffects

If the module uses decorators that write to Reflect metadata at import time (e.g. `@Event()`,
`@CommandHandler()`), add the compiled output to the `sideEffects` array in `package.json`:

```json
"sideEffects": [
  "./dist/ddd/index.js",
  "./dist/ddd/index.mjs",
  "./dist/authz/index.js",
  "./dist/authz/index.mjs",
  "./dist/cache/index.js",    // ← add if your module has decorator side-effects
  "./dist/cache/index.mjs"
]
```

Without this, bundlers that perform tree-shaking may eliminate the import entirely if no
named exports are used — causing the decorator metadata to never be written.

---

## Step 6: Build and typecheck

```bash
npm run build
npm run typecheck
```

Fix any TypeScript errors before continuing.

---

## Step 7: Update the root barrel (if appropriate)

The root barrel (`lib/core/index.ts`) currently only re-exports foundation modules: `errors`,
`types`, `constants`, `utils`. Heavy modules that require optional peers are NOT included there.

**Only add to the root barrel if:**
- The module has no optional peer dependencies beyond `@nestjs/common` and `@nestjs/core`.
- OR you are willing to add those peers as hard requirements.

For the cache example, `ioredis` is optional — do NOT add `@xlr8-nest/core/cache` to the root
barrel. Consumers must import it explicitly via `@xlr8-nest/core/cache`.

---

## Step 8: Write the developer guide

Add a guide to `docs/guides/cache.md` following the pattern of existing guides:
- Quick start (registration + basic usage)
- Core concepts
- All public API (classes, methods, decorators, options)
- Patterns and recipes
- Gotchas
- See also links

Update `docs/guides/README.md` to add a row for the new module.
Update `docs/developer/README.md` if the new module has interesting internals.

---

## Checklist

```
[ ] lib/<module>/index.ts   — public barrel with only public exports
[ ] tsup.config.ts          — entry added
[ ] package.json exports    — "./module" condition added
[ ] package.json peers      — peerDependencies + peerDependenciesMeta updated
[ ] package.json devDeps    — peer added as devDependency
[ ] tsup.config.ts external — peer added to external list
[ ] package.json sideEffects — added if module has decorator side-effects
[ ] npm run build           — compiles without errors
[ ] npm run typecheck       — no type errors
[ ] docs/guides/<module>.md — developer guide written
[ ] docs/guides/README.md   — guide index updated
```
