# Architecture Overview — @xlr8-nest/core

`@xlr8-nest/core` is a NestJS utility library distributed as a single npm package with **tree-shakeable subpath exports**. It bundles eight feature areas plus a foundation layer, each independently importable.

## 1. What it is

A toolkit, not a framework: most modules are pure functions, decorators, base classes, and dynamic NestJS modules you opt into. There is no global runtime except the dynamic modules you import (`CqrsModule`, `EventModule`, `DatabaseExtensionModule`, `MessagingModule`, `AuthzModule`).

## 2. Module map

| Subpath | Layer | Runtime? | Responsibility |
| --- | --- | --- | --- |
| `@xlr8-nest/core/constants` | foundation | no | `StatusCode` enum, `CommonErrors` table |
| `@xlr8-nest/core/utils` (alias `/util`) | foundation | sync | `validateInput` (Zod → `BadRequestError` with per-field detail) |
| `@xlr8-nest/core/types` | foundation | no | response envelope, `ErrorType`/`ErrorDetails`, `UserIdentity` |
| `@xlr8-nest/core/errors` | foundation | no | `BaseError` + 6 HTTP subclasses (extend native `Error`) |
| `@xlr8-nest/core/response` | edge | sync | success/error builders, exception normalizer, guards |
| `@xlr8-nest/core/validator` | edge | request | `@Validate` decorator + `ZodValidationPipe` |
| `@xlr8-nest/core/openapi` | edge | build-time | Swagger envelope/error/endpoint decorators + schema classes |
| `@xlr8-nest/core/authz` | edge | request | RBAC / permission / policy / resource authorization |
| `@xlr8-nest/core/ddd` | domain/runtime | init+runtime | DDD tactical primitives + hand-rolled CQRS/event buses |
| `@xlr8-nest/core/database` | infra/runtime | init+runtime | TypeORM extension, Unit of Work (AsyncLocalStorage), migration/seeder + CLI |
| `@xlr8-nest/core/messaging` | infra/runtime | init+background | transactional outbox, integration events, polling worker, CLI |
| `@xlr8-nest/core` (root `.`) | barrel | — | re-exports foundation layers only: `errors`, `types`, `constants`, `utils` |

## 3. Design patterns in use

- **Barrel / Facade** — `lib/core/index.ts` aggregates the package root.
- **Single-Source-of-Truth constants** — `StatusCode`, `CommonErrors` (`as const satisfies`).
- **Discriminated union** — the `Response<T>` success/error envelope.
- **Exception hierarchy + Template Method** — `BaseError` + fixed-status subclasses.
- **Adapter / Normalizer + two-phase pipeline** — `normalizeUnknownException` → `buildErrorResponse`.
- **Decorator + Pipe** — `@Validate` ⇄ `ZodValidationPipe`; `@Api*` composite decorators via `applyDecorators`.
- **DDD tactical** — `Entity`, `AggregateRoot` (collect-then-dispatch events), `ValueObject`, `CompositeKey`, `DomainService`.
- **CQRS + Mediator + reflection Discovery** — `CommandBus`/`QueryBus`/`EventBus` scan the DI container at `OnModuleInit`; Saga/Process-Manager via RxJS.
- **Unit of Work + Ambient Context** — `TypeOrmClient` over `AsyncLocalStorage`.
- **Transactional Outbox + Strategy + Polling Consumer + Port/Adapter** — `OutboxPublisher`, `IDomainEventTranslator`, `IMessagePublisher`, `OutboxWorker`.
- **Strategy + Registry (type-dispatched)** — authz `RequirementHandler`s behind one guard.
- **Dynamic Module (`forRoot`/`register`/`registerAsync`)** — every runtime module's composition root.
- **Multi-provider aggregation** — `useFactory: (...instances) => instances, inject: [...classes]` (translators, authz handlers).

## 4. Internal dependency graph

```
                         ┌─────────────────────────────────────────────┐
                         │                 foundation                   │
           types ◀────── core/constants ──▶ (StatusCode, CommonErrors)  │
            ▲   ▲          ▲       ▲                                     │
            │   │          │       │                                     │
        errors  └── response└─ openapi                                   │
            ▲        ▲  ▲        ▲                                       │
            │        │  │        │                                       │
   ┌────────┴───┐    │  │   ┌────┴─────┐                                 │
   │  authz     │────┘  │   │ validator│──▶ core/utils ──▶ (zod, @nestjs/common)
   └────────────┘       │   └──────────┘                                 │
                        │                                                 │
   ddd ────────────────┘                                                 │
    ▲                                                                     │
    │   database ──────────────────────────────────────────────────────┐ │
    │      ▲   ▲                                                         │ │
    └──────┘   └──── messaging ──▶ (ddd, database, @sqltools/formatter†) │ │
                         † optional peer (CLI feature)                  └─┘
```

Key edges (cited in the improvement plan):

- **`core/constants` → `types`** — constants imports `ErrorType` from types (one-way; the former reverse leg `types/api-response → StatusCode` was removed, breaking the cycle).
- **`messaging → database`** via deep internal imports. `IUnitOfWork` now exposes `manager: EntityManager` directly (no more `(uow as TypeOrmClient).client` cast required).
- **`validator → core/utils`** — `validateInput`/`formatZodErrors` live in `core/utils` and are also published at `/utils`; validation error contract ownership is split across two subpaths.
- **`ddd → @nestjs/core`** — discovery now uses the official `DiscoveryService` from `@nestjs/core` (via `DiscoveryModule` imported by `CqrsModule`). The former private `container.getModules()` cast has been removed.
- **Root barrel** — stripped to foundation-only: `errors`, `types`, `constants`, `utils`. Heavy modules (`ddd`, `database`, `openapi`, `validator`, `messaging`, `authz`) must be imported via their explicit subpath.

## 5. Lifecycles

### 5.1 Module init & handler discovery (ddd)
`CqrsModule.forRoot()` / `EventModule.forRoot()` register `@Global` buses; `CqrsModule` imports `EventModule.forRoot()` (not `EventEmitterModule.forRoot()` directly — prevents double-init) and `DiscoveryModule` (provides `DiscoveryService`). Each bus implements `OnModuleInit`: `CommandBus`/`QueryBus` discover handlers via `AbstractMessageBus.discover()` using `DiscoveryService.getProviders()` (official public API, keyed by the Type constructor). `EventBus.setupSagas()` discovers `@Saga()` properties, wires RxJS streams to the command bus (saga errors are logged without killing the stream). `EventBus` implements `OnModuleDestroy`: unsubscribes all tracked subscriptions and completes the subject.

### 5.2 Request validation (validator)
`@Validate(schema)` eagerly constructs one `ZodValidationPipe` per handler at class-load (validates the schema is a Zod instance at setup time) and registers it via `UsePipes`. The schema is typed `ZodType<T>` — accepts objects, arrays, unions, effects. Per request, the pipe runs for `metadata.type === 'body'` **and** `'query'`, delegating to `validateInput` → `safeParse`; on failure `formatZodErrors` collects all issues per path (no last-write-wins) and throws `BadRequestError` (library error, consistent with the rest of the error hierarchy).

### 5.3 Authorization (authz)
Per request the `AuthorizationGuard`: checks `@Public()`; merges requirements from method+class metadata; if none → **allow** (or `403` when `defaultDeny: true` is set in `AuthzModuleOptions`); else resolves the principal via `PrincipalResolver`; if null → `401`; else `AuthorizationService.checkAll(...)` dispatches each requirement to its handler (AND, short-circuit); any denial → `403` (denial reason propagated to `ForbiddenError`). `AuthorizationService` is also callable imperatively (`authorize`/`can`/`checkAll`). Duplicate handler `requirementType`s throw at startup.

### 5.4 Unit of Work (database)
`TypeOrmClient.transaction(fn)` opens a `QueryRunner`, runs `fn` inside `AsyncLocalStorage.run(queryRunner, fn)`, commits/rolls back/releases. `.manager` (primary) or `.client` (deprecated alias) returns the active transactional `EntityManager` (falls back to `dataSource.manager` outside a transaction). `IUnitOfWork` now exposes `manager: EntityManager` directly — no cast needed. Re-entrant `transaction()` opens an **independent** transaction (no join / no savepoint).

### 5.5 Outbox publish + worker (messaging)
Write path (inside the caller's UoW txn): `OutboxPublisher.publishFrom(aggregate)` pulls domain events → translates to integration events → inserts into `outbox_events` atomically with the aggregate. Background: `OutboxWorker` (auto-started `setInterval` on init; disable with `enabled: false`) atomically claims a batch with `UPDATE … SET status='processing', locked_until=… RETURNING *` (SKIP LOCKED — no commit-then-publish gap); groups events by `aggregateId` and publishes each group sequentially (cross-aggregate is parallel); on success marks `published`; on failure atomically increments `retry_count` in SQL. Failures get configurable exponential backoff with jitter; after `terminalFailureRetries` (default 10) → terminal `failed`.

### 5.6 Module composition (all runtime modules)
`forRoot`/`register` build a `DynamicModule`, register providers (often a token via `useExisting`/`useFactory`), set `global: true` by default, and return `exports`. `registerAsync` accepts `useFactory`/`inject` for config.

## 6. Extension points (summary)

- **errors**: subclass `BaseError`; supply custom `ErrorType<TCode>`.
- **response**: `customErrorFactory`, `fallback*`, success `code`/`message`/`statusCode` overrides, success/error **wrapper factories** (shared with openapi).
- **validator**: any Zod schema; reuse `validateInput`.
- **openapi**: `ApiSuccessWrapperFactory` / `ApiErrorWrapperFactory`.
- **ddd**: aggregates/entities/value-objects, command/query/event handlers, sagas, bus toggling.
- **database**: custom seeders/factories, alternate UoW implementations (implement `IUnitOfWork` which now includes `manager: EntityManager`), async/unified config.
- **messaging**: custom `IMessagePublisher`, `IDomainEventTranslator`s, worker tuning, alternate outbox store (limited).
- **authz**: custom `RequirementHandler` (the headline extension point), custom `PrincipalResolver`, named policies, custom decorators, imperative checks.

## 7. Cross-cutting observations

- **Testing**: there are **zero** tests and no test runner; CI runs only on tag push (`typecheck` + `build`). This is the single biggest structural risk multiplier — every correctness/security finding below is unguarded.
- **Packaging**: `nest-commander`, `@sqltools/formatter`, `@faker-js/faker` are optional peers but are hard requirements for the CLI and seeder features — promotion to required peers (or dynamic-import guards) is still pending. `strictNullChecks` is still off; `verbatimModuleSyntax` is off under NodeNext. Fixed: `sideEffects` array added; `CHANGELOG.md` published covering the `UserIdentity.roles` breaking change; root barrel stripped to avoid pulling optional peers.
- **Security posture**: the authz framework defaults to **fail-open** (routes with no requirements are allowed); opt into fail-closed with `AuthzModule.forRoot({ defaultDeny: true })`. Fixed: the response normalizer no longer forwards raw `Error.message` for plain `Error` instances; `GlobalExceptionFilter` is now shipped via `@xlr8-nest/core/response`; trailing-wildcard permission over-grant patched.

See **[maintenance/improvement-plan.md](../maintenance/improvement-plan.md)** for the prioritized, actionable breakdown.
