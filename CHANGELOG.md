# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-06-02

### Fixed
- **Security (critical):** Fixed trailing-wildcard permission over-grant in
  `permissionMatches` — `billing:*` no longer matches the bare `billing`
  permission. Change `r.length >= i` → `r.length > i`.
- **Security (high):** `RequestUserResolver` no longer copies the full
  `request.user` object into `attributes`, preventing sensitive fields
  (passwordHash, tokens) from leaking into authorization decisions.
- **Security (high):** `normalizeUnknownException` no longer forwards raw
  `Error.message` into 5xx client responses (information disclosure). The
  generic fallback message is always used for unclassified errors.
- **Correctness (critical):** Outbox at-least-once delivery gap fixed. `fetchDueBatch`
  now uses an atomic `UPDATE … SET status='processing' … RETURNING *` pattern so
  row locks are held until status is updated. `recordFailure` is now a single
  atomic `UPDATE` (no read-before-write race). Added `PROCESSING` status and
  `locked_until` lease column.
- **Correctness (high):** Outbox per-aggregate event ordering: the worker now
  groups the batch by `aggregateId` and publishes each group sequentially.
- **Correctness (high):** `DatabaseExtensionModule.onModuleInit` now re-throws on
  auto-migration or auto-seed failure (previously swallowed with `console.error`).
  The app will not boot against an un-migrated schema.
- **Correctness (high):** `registerAsync` now respects `migration`/`seeder`
  enabled flags instead of unconditionally registering all CLI runners.
- **DX (high):** Denial `reason` and `failedRequirementType` from
  `AuthorizationDecision` are now propagated into the thrown `ForbiddenError`
  message and logged via a `Logger` on the guard.
- **DX (medium):** Duplicate `requirementType` handlers now throw at startup
  instead of silently last-winning.
- **Correctness (medium):** Removed the `StatusCode` import from
  `types/common/api-response.type.ts`, breaking the `core/constants ↔ types`
  circular dependency.

### Added
- `GlobalExceptionFilter` (`@xlr8-nest/core/response`) — drop-in `@Catch()`
  filter that renders any exception into the standard envelope. Register via
  `APP_FILTER` or `app.useGlobalFilters(new GlobalExceptionFilter())`.
- `AuthzModule.forRoot({ defaultDeny: true })` — opt-in deny-by-default mode:
  when the global guard is active, routes with no `@Require*`/`@Authorize`
  decorator and no `@Public()` return 403.
- `OutboxWorkerOptions.enabled` — set to `false` to prevent the outbox poller
  from starting in CLI/migration processes.
- `IUnitOfWork.manager: EntityManager` — explicit `EntityManager` accessor on
  the UoW interface; repositories no longer need to cast to `TypeOrmClient`.
- `OutboxStats.processing` — PROCESSING rows are now reported in outbox stats.
- `AuthzGuardOptions` is now a public export.
- `nest-commander`, `@faker-js/faker`, and `@sqltools/formatter` declared as
  optional peer dependencies (previously only in devDependencies).
- `CHANGELOG.md` is now included in the published package (`files`).

### Changed
- **Breaking — root barrel:** `@xlr8-nest/core` (the root `.` entry) now only
  re-exports the dependency-free layers (`errors`, `types`, `constants`, `utils`).
  Feature modules (`ddd`, `database`, `openapi`, `validator`, `response`) must be
  imported via their subpaths. This makes the "optional" peer declarations accurate.
- **Breaking — outbox schema:** The `outbox_events_status_enum` gains a
  `processing` value and the table gains a `locked_until` column. Run the updated
  migration (re-generate with `outbox migration`) on existing tables:
  ```sql
  ALTER TYPE outbox_events_status_enum ADD VALUE 'processing';
  ALTER TABLE outbox_events ADD COLUMN locked_until TIMESTAMPTZ;
  ```

## [2.0.0] - 2026-05-15

### Added
- Added a new `authz` submodule (`@xlr8-nest/core/authz`): a declarative,
  extensible authorization framework built on a single guard + requirement/handler
  pipeline.
  - Four built-in models: **RBAC** (`@RequireRoles`), **permission-based**
    (`@RequirePermissions`, with wildcard matching), **policy-based**
    (`@RequirePolicy` + named policies), and **resource/property-based**
    (`@RequireResource`, `@CheckOwnership`).
  - `@Authorize(...requirements)` low-level decorator and `@Public()` /
    `@AllowAnonymous()` bypass.
  - `AuthorizationService` for imperative checks (`authorize` / `can` /
    `checkAll`) inside command handlers and domain services.
  - Pluggable `PrincipalResolver` (default `RequestUserResolver` reads
    `request.user`); custom strategies via `AuthzModule.forRoot({ handlers })`.
  - `AuthzModule.forRoot` / `registerAsync`, optional global guard registration.
  - Permission utilities: `permissionMatches`, `hasPermission`,
    `hasAllPermissions`, `hasAnyPermission`.
- Added `docs/authz.md` deep-dive guide and an Authorization section in the README.

### Changed
- **Breaking:** widened `UserIdentity.roles` from `string` to `string[]` to
  support RBAC. The default `RequestUserResolver` still accepts and normalizes a
  single string, but downstream code typing `UserIdentity.roles` as `string` must
  update.

### Removed
- Removed `buildExceptionErrorResponse` from the response module API.

### Migration
- `UserIdentity.roles: string` → `UserIdentity.roles: string[]`

## [1.1.0] - 2026-04-24

First stable release of `@xlr8-nest/core`, focused on standardizing API contracts, improving TypeScript safety, and simplifying the OpenAPI integration surface.

### Added
- Added a new `response` submodule with response builders and exception normalization utilities
- Added controller-friendly response aliases: `ApiSuccess<T>`, `ApiFailure<TErrors>`, and `ApiResult<TData, TErrors>`
- Added HTTP method-based OpenAPI decorators: `ApiMethod`, `ApiPost`, `ApiGet`, `ApiPatch`, `ApiPut`, and `ApiDelete`
- Added custom OpenAPI wrapper factories for both success and error responses while preserving the default wrapped response format

### Changed
- Breaking: replaced semantic OpenAPI decorators with HTTP method-based decorators and promoted `ApiMethod` as the generic entrypoint
- Updated `ApiWrappedResponse` to accept richer options for array, paginated, and custom wrapper scenarios
- Standardized OpenAPI error schemas so `errors` is documented as a field-keyed object map
- Updated error-facing decorators, response builders, and custom errors to accept `ErrorType` objects instead of separate `code` and `message` inputs
- Improved type safety across response builders, custom errors, DDD buses, and database helpers
- Expanded README examples to show recommended response return types for controllers and exception filters

### Removed
- Removed semantic OpenAPI decorators: `ApiCreate`, `ApiGetOne`, `ApiGetMany`, `ApiGetPaginated`, `ApiUpdate`, and `ApiAction`

### Fixed
- Fixed lint issues across the database and DDD modules
- Fixed package exports and build output for the new `response` submodule
- Fixed wrapped error normalization so exception filters can safely build consistent error payloads from `BaseError`, `HttpException`, and generic `Error`

### Migration
- `ApiCreate` -> `ApiPost`
- `ApiGetOne` -> `ApiGet`
- `ApiGetMany` -> `ApiGet(..., { isArray: true })`
- `ApiGetPaginated` -> `ApiGet(..., { paginated: true })`
- `ApiUpdate` -> `ApiPatch` or `ApiPut`
- `ApiAction` -> `ApiMethod`
- Error decorators, response builders, and custom errors now prefer `error: { code, message }` instead of separate `code` and `message` parameters

## [0.1.6] - 2026-04-22

### Changed
- Updated package metadata for the `0.1.6` release

## [0.1.5] - 2026-04-22

### Changed
- Updated package metadata for the `0.1.5` release

## [0.1.4] - 2026-04-22

### Added
- Added migration and seeder command runners to the database module

### Changed
- Renamed the internal database command entrypoint from `command` to `commands`
- Expanded database exports and typing around migration, seeder, and unit-of-work helpers

### Fixed
- Improved database module wiring for migration and seeder services

## [0.1.3] - 2026-04-21

### Changed
- Added `@swc/core` to the build toolchain so `tsup` can preserve NestJS decorator metadata during compilation

### Fixed
- Fixed published builds losing `design:paramtypes` metadata required by NestJS dependency injection
- Fixed `nest-commander` command runners failing at runtime because injected services were `undefined`
- Fixed migration and seeder CLI commands in consumer apps built against the published package

## [0.1.0] - 2026-03-19

### Added
- Wide version compatibility support for NestJS (v9-v12), Swagger (v6-v11), Zod (v3-v5), RxJS (v7-v8)
- Comprehensive README with badges, version compatibility table, and detailed examples
- Quick start guides for all modules (DDD, Database, OpenAPI, Validator)
- Support for `@faker-js/faker` in dev dependencies

### Changed
- Updated all dev dependencies to latest versions:
  - @nestjs/common: 11.1.17
  - @nestjs/swagger: 11.2.6
  - @nestjs/typeorm: 11.0.0
  - @nestjs/event-emitter: 3.0.1
  - zod: 4.3.6
  - rxjs: 7.8.2
  - typeorm: 0.3.28

### Fixed
- Fixed TypeScript compilation errors in PaginationMetaSchema
- Added definite assignment assertions for required properties

## [0.0.1] - 2026-03-18

### Added
- Initial release
- DDD & CQRS module with AggregateRoot, Entity, ValueObject
- Command/Query buses with automatic handler discovery
- Domain event bus with Saga pattern support
- TypeORM extensions with Unit of Work pattern
- Migration & Seeder services with CLI commands
- OpenAPI decorators for standardized API documentation
- Zod validation integration with NestJS pipes
- Standardized error classes
- Full TypeScript support with comprehensive type definitions

[Unreleased]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v0.1.6...v1.1.0
[0.1.6]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/xlr8-nest/xlr8-nest-core/releases/tag/v0.0.1
