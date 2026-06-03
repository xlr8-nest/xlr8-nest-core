# @xlr8-nest/core — Improvement & Maintenance Plan

All P0 items and most P2 items have been resolved. This plan tracks what remains.

**Priority bands.**
- **P1 — next**: structural risk multipliers (only testing remains here).
- **P2 — then**: remaining medium correctness / packaging / DX items.
- **P3 — roadmap**: features and larger refactors.

---

## P1 — next

### 1.1 `high` · testing · whole repo — Zero tests, no test runner, publish-only CI
No `*.spec.ts`/`*.test.ts` anywhere; `package.json` has no `test` script; CI runs only on tag push (`typecheck` + `build`).
- **Fix**: add **vitest**; a `test` script; a `pull_request`/`push` CI job (lint + typecheck + build + test). Seed with the highest-blast-radius pure logic: `permissionMatches`, fail-open/deny-by-default guard paths, `normalizeUnknownException`, `formatZodErrors`, outbox claim/terminal transitions (Postgres testcontainer), `CompositeKey`/event delivery.


---

## P2 — remaining

**Authz**
- `medium` `PolicyHandler` `ModuleRef.get(..,{strict:false})` hidden cycle → extract a shared `RequirementEvaluator` both depend on (`lib/authz/handlers/policy.handler.ts`).
- `medium` `registerAsync` only async-configures policies; no `forFeature` → support `useClass`/`useFactory` for resolver/handlers + feature-scoped policies.
- `medium` (feature) **OR/NOT combinators** — `checkAll` is AND-only.

**Response / types**
- `medium` (feature) Pagination/list-envelope helper — no `SuccessResponse<T[]>` with pagination meta in the type layer; only a Swagger-only schema exists.

**Validator**
- `medium` `@Validate` applies the same schema to both `body` and `query` when a handler has both → document footgun prominently; consider per-source schema map API.
- `medium` Output is typed generically; no `createZodDto(schema)` convenience that infers the class type from the schema.

**OpenAPI**
- `medium` Schema drifts from the runtime envelope — hand-built inline, omits the optional top-level `statusCode`. Add a conformance test or derive from the `response` module's constants.
- `medium` Dead/unused schema classes (`ApiResponseSchema`, `SuccessResponseSchema<T>`, `ErrorResponseSchema`) — delete or make the decorators actually use them.
- `medium` `@nestjs/swagger` optional-but-hard-imported in all openapi source files → remove from root barrel re-exports or promote to required peer.

**DDD**
- `medium` Saga observable errors are now logged but the stream is NOT automatically restarted after an error — use `catchError + EMPTY` to fully recover the outer stream and reconnect.
- `low` Throw typed errors for handler-not-found / domain guard (`DomainService.guard`) — currently uses plain `Error`.
- `low` `Entity.equals` uses `===` for non-CompositeKey ids — two equal-by-value `ValueObject` ids compare unequal.

**Database**
- `medium` `getPendingMigrations` returns a placeholder string, not real pending migration names.
- `medium` CLI runner has no `bin` entry and prints literal `<prefix>` in help text; `process.exit(1)` inside command runners.
- `low` No nested-transaction/savepoint support; expose `isInTransaction()` on `IUnitOfWork`.

**Messaging**
- `medium` Postgres-only SQL in outbox repository (`$1` placeholders, `FOR UPDATE SKIP LOCKED`) vs advertised multi-DB support → add an explicit dialect guard (throw if `dataSource.options.type !== 'postgres'`) or add per-dialect branches.
- `medium` `toPayload()` JSON round-trip doesn't handle `Date` → ISO and `bigint` gracefully on all runtimes — document or add an explicit serializer hook.
- `low` CLI commands use `console.*` + `process.exit` → inject Nest `Logger`, let the bootstrap handle exit codes.

**Core / utils**
- `medium` `StatusCode` enum and `CommonErrors` still omit common codes needed by apps (405 Method Not Allowed, 406, 415, 502/504). Expand or document the intentional subset.

**Build / typing**
- `medium` `strictNullChecks` is still off (`"strictNullChecks": false` in `tsconfig.json`). Re-enable and fix the resulting diagnostics — the emitted `.d.ts` types are weaker than they should be with full `strict`.
- `medium` `verbatimModuleSyntax` not set — type-only symbols imported value-style risk runtime imports under strict ESM resolvers. Add `"verbatimModuleSyntax": true` and convert to `import type` where needed.
- `low` Node.js builtins use bare specifiers (`crypto`, `async_hooks`, `fs`, `path`) — switch to `node:` prefix for correctness under strict ESM.

**Cross-cutting hardening**
- `medium` `BaseOrm` uses `Object.assign(this, orm)` — if `orm` is sourced from a request body, prototype-pollution is possible. Document the safe-usage constraint explicitly.
- `low` `outbox-admin.service.ts` migration template SQL uses a raw SQL comment inside a template literal (the `--` line inside `queryRunner.query(\`...\``)) — most TypeORM query methods strip SQL comments correctly, but verify on all dialects.

---

## P3 — roadmap (features)

**Authorization**
- OR/NOT/composite combinators; configurable permission separator + specified grammar.
- `forFeature` policies; async resolver/handler config; `@Resource()` param decorator + per-request resource caching.
- Transport-agnostic context (GraphQL/WS/RPC).
- Integrate `UserIdentity` with `AuthorizationPrincipal`.

**Messaging**
- DLQ + selective requeue; published-row archival/TTL; metrics/observability; payload schema/versioning + envelope headers; graceful-shutdown drain.

**Database**
- Idempotent seeders (`seeder_executions` table); multiple named connections; read-replica splitting; isolation level / timeout / deadlock-retry; real pending-migration listing + dry-run; concurrency-safe auto-migration (advisory lock).

**DDD**
- Adopt `DiscoveryService` (graduates from P1.5); multiple handlers per event with error isolation; outbox/`publishAfterCommit` integration with the UoW; richer `ValueObject` ergonomics.

**Response / types / openapi**
- Pagination/list-envelope helper + shared `PaginationMeta` type; `stack`/`cause` preservation; `requestId`/`timestamp`/`traceId` metadata slot; i18n/message-provider hook.

**Validator**
- Typed DTO inference (`createZodDto`); param/header validation; async (`safeParseAsync`) support; structured error formatting.

---

## Guardrails to add (prevent regressions)

- **Tests + CI gate on PRs** (the master guardrail — currently P1.1).
- **Lint rules**: ban deep `../../sibling/internal` imports (route through public barrels), require `import type` for type-only symbols, require `node:` builtins.
- **Exports-map ⇄ tsup-entry** consistency check in CI.
- **Structural conformance tests**: `CommonErrors`⇄`ERROR_DEFAULTS`⇄error classes; openapi schema classes ⇄ `types` interfaces.
- **`npm pack --dry-run`** check in CI.
