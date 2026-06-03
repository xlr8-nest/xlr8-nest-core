# Modules Reference — @xlr8-nest/core

Deep reference for each module: responsibility, public exports, key abstractions, extension points, and a representative usage. For risks see [../maintenance/improvement-plan.md](../maintenance/improvement-plan.md); for authz depth see [../authz.md](../authz.md).

---

## `@xlr8-nest/core/constants` + `/utils` (foundation: `lib/core`)

**Responsibility.** The foundation barrel + the canonical vocabulary. Three files: the root barrel (`index.ts`, re-exports the feature modules), `constants/index.ts` (`StatusCode`, `CommonErrors`), and `utils/index.ts` (`validateInput`).

**Public exports.** `StatusCode` (enum 200…503), `CommonErrors` (`as const satisfies Record<string, ErrorType>`), `CommonErrorType`, `validateInput<T>(value, schema): T`.

**Key abstractions.** `StatusCode` (single-source status vocabulary, 200…503); `CommonErrors` (default-error lookup table consumed by every `BaseError` subclass + response defaults + openapi error decorators); `validateInput` (Adapter: Zod `safeParse` → `BadRequestError` with `{code:'VALIDATION_ERROR', message, errors}`; private `formatZodErrors` collects all issues per path, no last-write-wins).

**Extension points.** `ErrorType<TCode>` override on every error default; `validateInput<T>` generic over any `ZodSchema<T>`; add a module to the root barrel + tsup entry to extend the package surface.

**Usage.**
```typescript
import { StatusCode, CommonErrors } from '@xlr8-nest/core/constants';
import { validateInput } from '@xlr8-nest/core/utils';
const dto = validateInput(body, CreateUserSchema); // throws 400 on invalid input
```

**Notable risks.** One-way dependency `core/constants` → `types` (imports `ErrorType`; former reverse cycle `types/api-response → StatusCode` eliminated). `./util` and `./utils` are both supported (intentional alias). `StatusCode` still omits some codes (405, 406, 415, 502, 504 — see P2 roadmap).

---

## `@xlr8-nest/core/types` (foundation: `lib/types`)

**Responsibility.** Runtime-free TypeScript contracts: the response envelope, the error contract, and the identity contract. Pure interfaces/aliases.

**Public exports.** `ResponseMetadata<TCode>`, `SuccessResponse<T,TCode>`, `ErrorResponse<TErrors,TCode>`, `Response<…>`; alias family `ApiSuccess`/`ApiFailure`/`ApiResult` and `ApiResponseBase`/`SuccessApiResponse`/`ErrorApiResponse`/`ApiResponse`; `ErrorType<TCode>`, `DetailError<TCode>`, `ErrorDetails<TField,TCode>`; `UserIdentity`.

**Key abstractions.** Discriminated union `Response` (tag = `success`); `ResponseMetadata` generic base; `ErrorType` contract seam; `UserIdentity` boundary DTO (currently unenforced).

**Extension points.** `TCode` / `TErrors` / `TField` generics; extend `UserIdentity` / `DetailError`.

**Notable risks.** `UserIdentity` is a loose boundary DTO — authz defines its own `AuthorizationPrincipal` shape separately. Pagination types are **absent** (only a Swagger-only `PaginationMetaSchema` exists in `@xlr8-nest/core/openapi`). Fixed: `DetailError<TCode>` is now a type alias (not an empty interface); `statusCode` is plain `number` (enum union removed — was always equivalent to `number`); redundant alias family (`ApiResponseBase`/`SuccessApiResponse`/`ErrorApiResponse`/`ApiResponse`) marked `@deprecated`; cycle with `core/constants` eliminated.

---

## `@xlr8-nest/core/errors` (foundation: `lib/errors`)

**Responsibility.** Framework-agnostic exception hierarchy. `BaseError extends Error` carries `statusCode`, `code`, optional `errors`; six subclasses bind a fixed status + `CommonErrors` default. Does **not** translate to HTTP (that's the consumer's filter).

**Public exports.** `BaseError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `InternalServerError`.

**Key abstractions.** `BaseError` (Template Method + generics; `Object.setPrototypeOf` for `instanceof` after down-compile; `name = new.target.name`; non-enumerable `BASE_ERROR_BRAND` symbol for cross-realm detection); subclasses (convenience constructors with `CommonErrors` defaults).

**Extension points.** Subclass `BaseError`; per-throw `ErrorType` override; typed code unions; duck-typed interop (`isBaseErrorLike` downstream).

**Usage.**
```typescript
throw new NotFoundError({ code: 'USER_NOT_FOUND', message: `User ${id} not found` });
```

**Notable risks.** `code` is unbounded `string` with no registry. `as ErrorType<TCode>` casts on defaults are unsound for custom code unions. Fixed: README corrected (errors extend native `Error`, not NestJS exceptions); `GlobalExceptionFilter` is now shipped via `@xlr8-nest/core/response`; `BASE_ERROR_BRAND` symbol added for reliable cross-realm `isBaseErrorLike` detection.

---

## `@xlr8-nest/core/response` (edge: `lib/response`)

**Responsibility.** Pure-function envelope toolkit: build success payloads, normalize any thrown value (`BaseError` | `HttpException` | `Error` | unknown) into `{statusCode, error, errors}`, render `ErrorResponse`. Not wired into the request lifecycle (no filter/interceptor shipped).

**Public exports.** `buildSuccessResponse`, `buildErrorResponse`, `normalizeUnknownException`, `GlobalExceptionFilter`, `isBaseErrorLike`, `isErrorDetails`, `getMessageFromUnknown`, plus option/type interfaces and the re-exported `types` aliases.

**Key abstractions.** Builders (factory functions); `normalizeUnknownException` (Adapter + ordered Chain-of-Responsibility: `customFactory` → `BaseError`/`isBaseErrorLike` → `HttpException` → `Error` → unknown); `customErrorFactory` (Strategy); lookup tables `SUCCESS_CODE_MAP` / `SUCCESS_MESSAGE_MAP` / `ERROR_DEFAULTS`; type-guard predicates.

**Extension points.** `customErrorFactory`, `fallbackError`/`fallbackStatusCode`/`fallbackErrors`, success overrides, `includeStatusCode`.

**Usage.**
```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const { statusCode } = normalizeUnknownException(e, { fallbackError: {...} });
    host.switchToHttp().getResponse().status(statusCode).json(buildErrorResponse(e, {...}));
  }
}
```

**Notable risks.** 204/302 responses still emit a body (relevant only if `buildSuccessResponse` is used on those routes). Fixed: raw `Error.message` no longer forwarded into 5xx bodies for plain `Error` (uses fallback message); dead barrels wired — `isBaseErrorLike`/`isErrorDetails`/`getMessageFromUnknown` now public; `GlobalExceptionFilter` shipped; `isRecord` excludes arrays; `isBaseErrorLike` now requires `instanceof Error` (POJO misclassification fixed) and evaluated before `HttpException`; statuses 422/429/503 have dedicated `ERROR_DEFAULTS` entries.

---

## `@xlr8-nest/core/validator` (edge: `lib/validator`)

**Responsibility.** NestJS glue for Zod validation. `@Validate(schema)` registers a `ZodValidationPipe` via `UsePipes`; parsing/error-shaping live in `core/utils`.

**Public exports.** `Validate` (decorator), `ZodValidationPipe`.

**Key abstractions.** `ZodValidationPipe` (Adapter/Strategy over `PipeTransform`); `Validate` (Decorator + Factory); shared `validateInput`/`formatZodErrors`.

**Extension points.** Custom pipe usage; schema composition; reuse `validateInput`.

**Notable risks.** `@Validate` validates **both** body and query with the same schema — footgun when a handler has both parameters (consider explicit per-source schema API). No DTO type inference (`createZodDto`). No query coercion guidance. Fixed: schema now typed `ZodType<T>` (accepts arrays, unions, effects, zod v3+v4); constructor validates that the argument has `safeParse` at setup time.

---

## `@xlr8-nest/core/openapi` (edge: `lib/openapi`)

**Responsibility.** Declarative Swagger layer for the `{success,code,message,data}` envelope: composite method decorators, error decorators, schema builders, schema model classes.

**Public exports.** `ApiMethod`, `ApiGet`/`ApiPost`/`ApiPatch`/`ApiPut`/`ApiDelete`, `ApiRedirect`, `ApiRaw`/`ApiRawArray`; `ApiError` + `ApiBadRequest`/`ApiUnauthorized`/`ApiForbidden`/`ApiNotFound`/`ApiConflict`/`ApiInternalError`; `ApiWrappedResponse`/`ApiPaginatedResponse`/`ApiErrorResponse`; wrapper factory types; schema classes (`ApiResponseSchema`, `SuccessResponseSchema<T>`, `ErrorResponseSchema`, `DetailErrorSchema`, `PaginationMetaSchema`).

**Key abstractions.** Composite decorators (`applyDecorators` over `@nestjs/swagger`); schema builders (pure factories); wrapper factories (Strategy); verb→status/message lookup.

**Extension points.** `ApiSuccessWrapperFactory` / `ApiErrorWrapperFactory`; custom `ErrorType`; `isArray`/`paginated`/`status`/`message`.

**Usage.**
```typescript
@Post() @ApiPost(UserDto, { summary: 'Create user' }) @ApiBadRequest({ includeErrors: true }) @ApiConflict()
create(@Body() dto: CreateUserDto) {}
```

**Notable risks.** Documented schema drifts from the runtime envelope (hand-built, omits optional `statusCode`). Dead/unused schema classes (`ApiResponseSchema`, `SuccessResponseSchema<T>`, `ErrorResponseSchema`) should be removed. `@nestjs/swagger` is declared optional but hard-imported at module top-level — requires the peer to be installed whenever `openapi` is imported. 204/null-data routes still document a required `data` field. Fixed: `PaginationMetaSchema` now exported from `lib/openapi/schema/index.ts`; root barrel no longer re-exports openapi (eliminates swagger eager-load from the base package).

---

## `@xlr8-nest/core/ddd` (runtime: `lib/ddd`)

**Responsibility.** DDD tactical primitives + a dependency-light reimplementation of a subset of `@nestjs/cqrs`, auto-discovering handlers/sagas by scanning the DI container.

**Public exports.** `Entity<T>` (incl. `id` getter), `AggregateRoot<T>`, `ValueObject`, `DomainEvent`, `DomainService`, `CompositeKey<…>`, identifier types; `AbstractMessageBus`, `CommandBus`/`ICommand`/`ICommandHandler`, `QueryBus`/`IQuery`/`IQueryHandler`, `EventBus`/`IEventBus`/`ISaga`/`DomainEventHandler`; decorators `@CommandHandler`/`@QueryHandler`/`@Saga`/`@Event`/`@EventHandler` + `getEventName`; `EventModule`, `CqrsModule`; metadata key consts.

**Key abstractions.** `AggregateRoot` (collect-then-dispatch: `addEvent`/`pullEvents`); `CompositeKey` (immutable VO, `Object.freeze`); `AbstractMessageBus` (shared discovery + registry + dispatch; `CommandBus`/`QueryBus` extend it); `EventBus` (Adapter over `EventEmitter2` + RxJS Subject + Saga; implements `OnModuleDestroy`); reflection discovery utils.

**Extension points.** Aggregates/entities/VOs; command/query/event handlers; sagas; module composition; bus toggling.

**Usage.**
```typescript
export class User extends AggregateRoot<string> {
  static create(name: string): User { const u = new User(uuid()); u.addEvent(new UserCreatedEvent(u.getId())); return u; }
}
@CommandHandler(CreateUserCommand)
class Handler implements ICommandHandler<CreateUserCommand> { async execute(c){ /* … */ } }
```

**Notable risks.** Handler registry keyed by `constructor.name` can break under aggressive minification or duplicate class names — key by the Type reference if this becomes an issue. "Optional" peers (rxjs, event-emitter, reflect-metadata) are hard requirements for the module to function. After an error in a saga observable the stream is **not automatically restarted** [P2 — use `catchError + EMPTY` to recover]. Fixed: `Entity.id` getter added; `EventBus` implements `OnModuleDestroy`; saga errors logged; `CommandBus`/`QueryBus` unified under `AbstractMessageBus`; ~~private `ModuleRef.container` scan~~ replaced with `DiscoveryService` from `@nestjs/core` (`DiscoveryModule` imported by both `EventModule` and `CqrsModule`); ~~`@Saga()` arrow-property never discovered~~ — discovery now scans instance own-properties too, so the documented arrow-function saga form works; ~~`CqrsModule` created a second `EventBus` instance~~ (it re-declared `EventBus` as a provider while also importing `EventModule`) — now relies on the single `@Global` `EventModule` instance so saga→command wiring is intact. All three verified end-to-end via a NestFactory bootstrap (command dispatch, query dispatch, arrow-property saga routing, typed handler-not-found error).

---

## `@xlr8-nest/core/database` (runtime: `lib/database`)

**Responsibility.** Extension layer over `@nestjs/typeorm`: a `DataSource`, a request-scoped Unit-of-Work (`TypeOrmClient` over `AsyncLocalStorage`), migration/seeder services with `nest-commander` CLI, and dev-tooling base classes.

**Public exports.** `DatabaseExtensionModule` (+async options), `IUnitOfWork` (incl. `manager: EntityManager`)/`IUnitOfWorkToken` (Symbol), `TypeOrmClient`, `@InjectUnitOfWork`/`@UnitOfWork`, `MigrationService`/`SeederService`, command runners, `Seeder`/`BaseSeeder`/`BaseFactory`/`BaseOrm`, config builders (`createDataSource`/`toDatabaseModuleConfig`/`defineConfig`), config interfaces, `DATABASE_MODULE_CONFIG` token (Symbol).

**Key abstractions.** `TypeOrmClient` (Unit of Work + Ambient Context; `.manager` primary, `.client` deprecated alias); `DatabaseExtensionModule` (Dynamic Module; fails fast on auto-migration/seed errors); migration/seeder services (Facade over `DataSource`); command runners (CLI Adapter); `BaseFactory`/`BaseSeeder` (Template Method + faker); `BaseOrm` (partial-constructor via `Object.assign`).

**Extension points.** Custom seeders/factories/entities; alternate UoW impl (intended); async/unified config; CLI.

**Usage.**
```typescript
@Inject(IUnitOfWorkToken) private readonly uow: IUnitOfWork;
await this.uow.transaction(async () => { /* repo writes share the txn manager */ });
```

**Notable risks.** **README example (`getRepository`/`commit`) is non-functional**. Seeder `all`/`each` transaction modes don't actually wrap the seeders. Auto-migrate/seed runs in every replica with no distributed lock. `nest-commander`/`@sqltools/formatter`/`@faker-js/faker` are optional peers but hard requirements for CLI features. `getPendingMigrations` returns a placeholder [P2]. CLI has no `bin` entry and prints literal `<prefix>` in help [P2]. No nested-transaction/savepoint support. Fixed: `IUnitOfWork` now exposes `manager: EntityManager` (no more cast); `IUnitOfWorkToken` and `DATABASE_MODULE_CONFIG` are now Symbols (no string-token collisions); auto-migrate/seed errors now rethrow (fail-fast); `clearTable` validates table names with `assertSafeIdentifier`; `registerAsync` accepts `migration`/`seeder` enable flags.

---

## `@xlr8-nest/core/messaging` (runtime: `lib/messaging`)

**Responsibility.** Transactional outbox for reliable, at-least-once cross-service delivery: translate domain → versioned `IntegrationEvent`s, persist to `outbox_events` in the caller's UoW txn, and a background `OutboxWorker` ships due rows via a pluggable `IMessagePublisher`.

**Public exports.** `IntegrationEvent`, `IDomainEventTranslator`/`TRANSLATORS_TOKEN`/`DomainEventTranslatorRegistry`, `OutboxEventStatus`/`OutboxEventOrm`, `IOutboxRepository`/`OutboxRepositoryToken`/`TypeOrmOutboxRepository`/`OutboxEventRecord`, `OutboxPublisher`, `IMessagePublisher`/`MessagePublisherToken`/`ConsoleMessagePublisher`, `OutboxWorker`/`OutboxWorkerOptions`/`OUTBOX_WORKER_OPTIONS`, `OutboxAdminService`/`OutboxStats`, `OutboxCommandRunner`, `MessagingModule`.

**Key abstractions.** `IntegrationEvent` (Template Method `toPayload` — JSON-safe round-trip; optional `occurredAt` preserves domain event timestamp); translator + registry (Strategy + first-match); `IOutboxRepository`/`TypeOrmOutboxRepository` (Repository + token DIP; atomic `UPDATE … RETURNING *` claim with `PROCESSING` status + `locked_until` lease); `IMessagePublisher` (Port/Adapter); `OutboxPublisher` (App Service); `OutboxWorker` (Polling Consumer; per-aggregate ordering; configurable backoff/jitter/retries; `enabled: false` to disable in non-worker processes); `MessagingModule.forRoot` (Dynamic Module).

**Extension points.** Custom broker; translators; worker tuning; custom payload; CLI opt-out.

**Usage.**
```typescript
const events = await uow.transaction(async () => { await repo.save(agg); return outbox.publishFrom(agg); });
await eventBus.publishAll(events);
```

**Notable risks.** Outbox table **grows unbounded** (no prune or TTL). **Postgres-only** SQL (`$1` placeholders, `FOR UPDATE SKIP LOCKED`) while config advertises MySQL/SQLite/MSSQL — dialect guard not yet added [P2]. `toPayload` JSON round-trip does not handle `Date` → ISO or `bigint` gracefully on all runtimes [P2 — document or add serializer hook]. Entity vs migration-template schema can drift. Fixed: at-least-once gap eliminated (atomic `UPDATE … SET status='processing' RETURNING *`, SKIP LOCKED); `recordFailure` is now a single atomic SQL UPDATE; per-aggregate ordering enforced within each batch; backoff/jitter/max-retries are all configurable; `enabled: false` option prevents worker from starting in non-worker processes; `toPayload` uses `JSON.parse(JSON.stringify(...))` for basic serialization safety; `IntegrationEvent` accepts optional `occurredAt`.

---

## `@xlr8-nest/core/authz` (runtime: `lib/authz`)

**Responsibility.** Authorization decoupled from authentication. Typed `AuthorizationRequirement`s evaluated by a registry of `RequirementHandler`s behind one `AuthorizationGuard` + an imperative `AuthorizationService`; principal via swappable `PrincipalResolver`; named policies in `PolicyRegistry`. Covers RBAC, wildcard permissions, policy-based, and resource/ownership. Full guide: [../authz.md](../authz.md).

**Public exports.** `AuthzModule` (+options), `AuthorizationGuard`, `AuthorizationService`, `PolicyRegistry`/`PolicyDefinition`/`PolicyEvaluator`, `PrincipalResolver`/`RequestUserResolver`, `RequirementHandler` + 4 built-in handlers, 4 requirement classes, decorators (`Authorize`, `Public`/`AllowAnonymous`, `RequireRoles`/`RequirePermissions`/`RequirePolicy`/`RequireResource`/`CheckOwnership`), permission utils, types, tokens.

**Key abstractions.** Requirement (Value Object) + Handler (Strategy/Registry, type-dispatched); `PrincipalResolver` (Strategy + DIP); `PolicyRegistry` (Registry + Composite); `Authorize` (Decorator + metadata merge); `checkAll` (AND combinator); `PolicyHandler` resolves `AuthorizationService` via `ModuleRef` to break a DI cycle.

**Extension points.** Custom `RequirementHandler` (headline); custom `PrincipalResolver`; named policies; custom decorators; imperative checks.

**Usage.**
```typescript
@Post() @RequireRoles('admin') create() {}
await authz.authorize(principal, [new ResourceRequirement((p,a)=>a.ownerId===p.id)], { resource });
```

**Notable risks.** `PolicyHandler` uses `ModuleRef.get(..., {strict:false})` to break a DI cycle — a hidden circular dependency [P2]. `registerAsync` only async-configures policies; resolver/handlers still require sync config [P2]. Metadata stored via raw `reflect-metadata` rather than official Nest `Reflector` primitives. Fixed: trailing-wildcard over-grant patched (`billing:*` no longer matches bare `billing`); `defaultDeny: true` option added for fail-closed mode; `RequestUserResolver` no longer copies the whole user object into `attributes` (only sets `raw: user`); denial reason propagated into `ForbiddenError`; duplicate `requirementType` now throws at startup (no silent overwrites); empty-`requirements`-only policy now throws at registration.
