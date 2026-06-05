# @xlr8-nest/core — API Reference

Complete reference for every public API in the library, with examples and usage guidance. For architecture context see [architecture/overview.md](architecture/overview.md). For authorization depth see [authz.md](authz.md).

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Package Layout](#2-package-layout)
3. [Foundation](#3-foundation)
   - 3.1 [@xlr8-nest/core (root)](#31-xlr8-nestcore-root)
   - 3.2 [/constants — StatusCode · CommonErrors](#32-constants)
   - 3.3 [/utils — validateInput](#33-utils)
   - 3.4 [/types — response envelope · UserIdentity](#34-types)
   - 3.5 [/errors — BaseError hierarchy](#35-errors)
4. [Edge Layer](#4-edge-layer)
   - 4.1 [/response — builders · normalizer · GlobalExceptionFilter](#41-response)
   - 4.2 [/validator — @Validate · ZodValidationPipe](#42-validator)
   - 4.3 [/openapi — Swagger decorators](#43-openapi)
5. [Authorization — /authz](#5-authorization)
6. [Domain-Driven Design — /ddd](#6-ddd)
7. [Database — /database](#7-database)
8. [Messaging — /messaging](#8-messaging)

---

## 1. Quick Start

```bash
npm install @xlr8-nest/core
```

Import only what you need via subpaths — the root barrel (`@xlr8-nest/core`) re-exports only the dependency-free foundation layers (`errors`, `types`, `constants`, `utils`). Feature modules must be imported from their dedicated subpath to avoid pulling unnecessary peer dependencies.

```typescript
// Foundation — no peer deps
import { StatusCode, CommonErrors }  from '@xlr8-nest/core/constants';
import { validateInput }             from '@xlr8-nest/core/utils';
import { BadRequestError }           from '@xlr8-nest/core/errors';
import { SuccessResponse }           from '@xlr8-nest/core/types';

// Edge layer
import { buildSuccessResponse, GlobalExceptionFilter } from '@xlr8-nest/core/response';
import { Validate }                  from '@xlr8-nest/core/validator';
import { ApiPost, ApiBadRequest }    from '@xlr8-nest/core/openapi';

// Runtime modules (require matching peer deps)
import { AuthzModule }               from '@xlr8-nest/core/authz';
import { CqrsModule }                from '@xlr8-nest/core/ddd';
import { DatabaseExtensionModule }   from '@xlr8-nest/core/database';
import { MessagingModule }           from '@xlr8-nest/core/messaging';
```

**Minimum `app.module.ts` example:**

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from '@xlr8-nest/core/response';
import { AuthzModule } from '@xlr8-nest/core/authz';
import { DatabaseExtensionModule } from '@xlr8-nest/core/database';

@Module({
  imports: [
    DatabaseExtensionModule.registerAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: 5432,
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        entities: [__dirname + '/**/*.orm.{js,ts}'],
      }),
    }),
    AuthzModule.forRoot({ registerGlobalGuard: true }),
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
```

---

## 2. Package Layout

| Subpath | Peer deps required | Purpose |
|---|---|---|
| `@xlr8-nest/core` | none | Foundation barrel (errors, types, constants, utils) |
| `@xlr8-nest/core/constants` | none | StatusCode enum, CommonErrors table |
| `@xlr8-nest/core/utils` | zod | validateInput helper |
| `@xlr8-nest/core/types` | none | TypeScript envelope interfaces |
| `@xlr8-nest/core/errors` | none | BaseError + HTTP subclasses |
| `@xlr8-nest/core/response` | @nestjs/common | Success/error builders, normalizer, GlobalExceptionFilter |
| `@xlr8-nest/core/validator` | @nestjs/common, zod | @Validate decorator + ZodValidationPipe |
| `@xlr8-nest/core/openapi` | @nestjs/common, @nestjs/swagger | Swagger composite decorators + schemas |
| `@xlr8-nest/core/authz` | @nestjs/common, @nestjs/core | Authorization framework (RBAC, permissions, policy, resource) |
| `@xlr8-nest/core/ddd` | @nestjs/common, @nestjs/core, rxjs, @nestjs/event-emitter | DDD primitives + CQRS buses + EventBus |
| `@xlr8-nest/core/database` | @nestjs/common, @nestjs/typeorm, typeorm | Unit of Work, migration, seeder, CLI |
| `@xlr8-nest/core/messaging` | @nestjs/common, typeorm + ddd + database | Transactional outbox, integration events, outbox worker |

---

## 3. Foundation

### 3.1 `@xlr8-nest/core` (root)

Re-exports the four dependency-free layers as a convenience. Use this when you need the foundation without caring which exact subpath each symbol comes from.

```typescript
import {
  // from /errors
  BaseError, BadRequestError, NotFoundError,
  // from /types
  SuccessResponse, ErrorResponse,
  // from /constants
  StatusCode, CommonErrors,
  // from /utils
  validateInput,
} from '@xlr8-nest/core';
```

> **Note:** `ddd`, `database`, `openapi`, `validator`, `messaging`, and `authz` are NOT re-exported from the root. Always import them from their explicit subpath.

---

### 3.2 `/constants`

```typescript
import { StatusCode, CommonErrors, CommonErrorType } from '@xlr8-nest/core/constants';
```

#### `StatusCode` enum

HTTP status codes used as single-source-of-truth across the library.

| Member | Value |
|---|---|
| `SUCCESS` | 200 |
| `CREATED` | 201 |
| `ACCEPTED` | 202 |
| `NO_CONTENT` | 204 |
| `REDIRECT` | 302 |
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `UNPROCESSABLE_ENTITY` | 422 |
| `TOO_MANY_REQUESTS` | 429 |
| `INTERNAL_SERVER_ERROR` | 500 |
| `SERVICE_UNAVAILABLE` | 503 |

**Usage:**
```typescript
import { StatusCode } from '@xlr8-nest/core/constants';

@Get('health')
health() {
  return { statusCode: StatusCode.SUCCESS };
}
```

#### `CommonErrors` constant

`as const satisfies Record<string, ErrorType>` — default `{ code, message }` pair for every error class. Consumed by `BaseError` subclasses, `ERROR_DEFAULTS` in response, and OpenAPI error decorators.

```typescript
console.log(CommonErrors.NotFoundError);
// { code: 'NOT_FOUND', message: 'Resource not found' }

console.log(CommonErrors.BadRequestError);
// { code: 'BAD_REQUEST', message: 'Bad request' }
```

| Key | code | message |
|---|---|---|
| `BadRequestError` | `BAD_REQUEST` | Bad request |
| `UnauthorizedError` | `UNAUTHORIZED` | Unauthorized |
| `ForbiddenError` | `FORBIDDEN` | Forbidden |
| `NotFoundError` | `NOT_FOUND` | Resource not found |
| `ConflictError` | `CONFLICT` | Resource conflict |
| `UnprocessableEntityError` | `UNPROCESSABLE_ENTITY` | Unprocessable entity |
| `TooManyRequestsError` | `TOO_MANY_REQUESTS` | Too many requests |
| `InternalServerError` | `INTERNAL_SERVER_ERROR` | Internal server error |

#### `CommonErrorType`

TypeScript union of all `CommonErrors` keys (`'BadRequestError' | 'NotFoundError' | …`).

---

### 3.3 `/utils`

```typescript
import { validateInput } from '@xlr8-nest/core/utils';
// also available as @xlr8-nest/core/util
```

#### `validateInput<T>(value, schema): T`

Validates `value` against a Zod schema and returns the parsed result. On failure throws `BadRequestError` with per-field error detail — consistent with the library's error hierarchy and `GlobalExceptionFilter`.

```typescript
import { z } from 'zod';
import { validateInput } from '@xlr8-nest/core/utils';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

// Throws BadRequestError({ code: 'VALIDATION_ERROR', ... }) if invalid
const dto = validateInput(rawBody, CreateUserSchema);
```

**Error shape on failure:**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Validation failed" },
  "errors": {
    "email": { "code": "invalid_field", "message": "Invalid email" },
    "name":  { "code": "invalid_field", "message": "String must contain at least 2 character(s)" }
  }
}
```

Multiple issues on the same field are joined with `; `.

**When to use vs `@Validate`:**
- Use `validateInput` in command handlers, domain services, and anywhere outside a NestJS pipe context.
- Use `@Validate` on controller methods to automatically validate `@Body()` and `@Query()`.

---

### 3.4 `/types`

```typescript
import type { SuccessResponse, ErrorResponse, Response, UserIdentity } from '@xlr8-nest/core/types';
```

Pure TypeScript interfaces — no runtime code.

#### Response envelope

The library uses a discriminated union `Response<T>` for all HTTP responses.

```typescript
interface ResponseMetadata<TCode = string> {
  success: boolean;
  code?: TCode;
  message?: string;
  statusCode?: number;
}

interface SuccessResponse<TData, TCode = string> extends ResponseMetadata<TCode> {
  success: true;
  data: TData;
}

interface ErrorResponse<TErrors = unknown, TCode = string> extends ResponseMetadata<TCode> {
  success: false;
  error: ErrorType<TCode>;
  errors?: TErrors;
}

type Response<TData, TErrors = unknown, TCode = string> =
  | SuccessResponse<TData, TCode>
  | ErrorResponse<TErrors, TCode>;
```

**Usage — typed controller return:**
```typescript
import type { SuccessResponse } from '@xlr8-nest/core/types';
import { buildSuccessResponse } from '@xlr8-nest/core/response';

@Get(':id')
async findOne(@Param('id') id: string): Promise<SuccessResponse<UserDto>> {
  const user = await this.userService.findById(id);
  return buildSuccessResponse(UserDto.from(user));
}
```

#### `ErrorType<TCode>`

```typescript
interface ErrorType<TCode = string> {
  code: TCode;
  message: string;
}
```

#### `ErrorDetails<TField, TCode>`

Map of field names to `ErrorType` — used in validation error responses.

```typescript
type ErrorDetails<TField extends string = string, TCode = string> =
  Record<TField, ErrorType<TCode>>;
```

#### `DetailError<TCode>`

Type alias for `ErrorType<TCode>` (same shape, different name for semantic use).

#### `UserIdentity`

The app-level authenticated identity placed on `request.user` by your auth guard.

```typescript
interface UserIdentity {
  id: string;
  roles: string[];   // was `string` in v1 — now always string[]
  email?: string;
  [key: string]: unknown;
}
```

> **Note:** This is the *input* to the authz framework. The authz guard reads `request.user` and maps it to `AuthorizationPrincipal` via a `PrincipalResolver`.

---

### 3.5 `/errors`

```typescript
import {
  BaseError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  UnprocessableEntityError,
  TooManyRequestsError,
  ServiceUnavailableError,
} from '@xlr8-nest/core/errors';
```

Framework-agnostic exception hierarchy. All classes extend native `Error` (not NestJS `HttpException`) — use `GlobalExceptionFilter` to translate them to HTTP responses.

#### `BaseError`

```typescript
class BaseError<TCode extends string = string> extends Error {
  readonly statusCode: number;
  readonly code: TCode;
  readonly errors?: unknown;
  // Non-enumerable brand symbol for cross-realm detection
  readonly [BASE_ERROR_BRAND]: true;
}
```

**Constructor:**
```typescript
new BaseError(
  statusCode: number,
  error: ErrorType<TCode>,
  errors?: unknown
)
```

**Subclass pattern:**
```typescript
import { BaseError } from '@xlr8-nest/core/errors';
import { StatusCode } from '@xlr8-nest/core/constants';

class PaymentDeclinedError extends BaseError<'PAYMENT_DECLINED'> {
  constructor(reason: string) {
    super(StatusCode.PAYMENT_REQUIRED, {
      code: 'PAYMENT_DECLINED',
      message: reason,
    });
  }
}
```

#### Built-in subclasses

Each subclass fixes the status code and uses `CommonErrors` as the default message. All accept an optional override.

| Class | Status | Default code | Default message |
|---|---|---|---|
| `BadRequestError` | 400 | `BAD_REQUEST` | Bad request |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | Unauthorized |
| `ForbiddenError` | 403 | `FORBIDDEN` | Forbidden |
| `NotFoundError` | 404 | `NOT_FOUND` | Resource not found |
| `ConflictError` | 409 | `CONFLICT` | Resource conflict |
| `UnprocessableEntityError` | 422 | `UNPROCESSABLE_ENTITY` | Unprocessable entity |
| `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS` | Too many requests |
| `InternalServerError` | 500 | `INTERNAL_SERVER_ERROR` | Internal server error |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | Service unavailable |

**Usage:**
```typescript
import { NotFoundError, ConflictError, BadRequestError } from '@xlr8-nest/core/errors';

// Use CommonErrors default
throw new NotFoundError();

// Override just the message
throw new NotFoundError({ code: 'USER_NOT_FOUND', message: `User ${id} not found` });

// With field-level errors
throw new BadRequestError(
  { code: 'VALIDATION_FAILED', message: 'Input is invalid' },
  { email: { code: 'TAKEN', message: 'Email already in use' } },
);
```

#### `isBaseErrorLike(value)` guard

Available from `@xlr8-nest/core/response`. Returns `true` if `value` is an instance of `Error` that carries `statusCode` and `code` properties — reliably identifies `BaseError` instances across module boundaries using the brand symbol.

#### Domain error catalogs — required pattern

**Never inline `{ code, message }` literals at throw sites.** Always define a named error catalog for each domain module and import from it. This matches how `@xlr8-nest/core` itself defines its own internal error codes (`AuthzErrors`, `DddErrors`).

```typescript
// src/common/errors/user.errors.ts  (Layered)
// src/shared/errors/user.errors.ts  (DDD/CQRS)
import type { ErrorType } from '@xlr8-nest/core/types';

export const UserErrors = {
  NotFound:      { code: 'USER-NOT_FOUND',      message: 'User not found.' },
  EmailConflict: { code: 'USER-EMAIL_CONFLICT',  message: 'A user with this email already exists.' },
  Forbidden:     { code: 'USER-FORBIDDEN',       message: 'You do not have permission to access this user.' },
} as const satisfies Record<string, ErrorType>;
```

**Naming convention:** `DOMAIN-SNAKE_CASE` — uppercase, hyphen separator between domain and description (e.g. `USER-NOT_FOUND`, `LEAVE-INSUFFICIENT_BALANCE`, `PRODUCT-INVALID_TRANSITION`).

**Usage:**
```typescript
import { NotFoundError, ConflictError, ForbiddenError, UnprocessableEntityError } from '@xlr8-nest/core/errors';
import { UserErrors } from '../../common/errors/user.errors';

if (!user)   throw new NotFoundError(UserErrors.NotFound);
if (taken)   throw new ConflictError(UserErrors.EmailConflict);
if (!owner)  throw new ForbiddenError(UserErrors.Forbidden);
if (!valid)  throw new UnprocessableEntityError(UserErrors.InvalidTransition);
```

**Built-in framework error catalogs** (exported from their subpaths):

```typescript
import { AuthzErrors } from '@xlr8-nest/core/authz'; // AUTHZ_* codes
import { DddErrors }   from '@xlr8-nest/core/ddd';   // DDD_* codes
```

| Catalog | Code | Meaning |
|---|---|---|
| `AuthzErrors.Unauthenticated` | `AUTHZ_UNAUTHENTICATED` | No principal resolved (401) |
| `AuthzErrors.AccessDenied` | `AUTHZ_ACCESS_DENIED` | Requirement denied (403) |
| `AuthzErrors.NoPolicy` | `AUTHZ_NO_POLICY` | Route has no policy and defaultDeny=true (403) |
| `AuthzErrors.UnknownRequirementType` | `AUTHZ_UNKNOWN_REQUIREMENT_TYPE` | No handler for requirement type |
| `AuthzErrors.UnknownPolicy` | `AUTHZ_UNKNOWN_POLICY` | @RequirePolicy references unregistered policy |
| `AuthzErrors.DuplicateHandler` | `AUTHZ_DUPLICATE_HANDLER` | Two handlers for same requirementType |
| `AuthzErrors.DuplicatePolicy` | `AUTHZ_DUPLICATE_POLICY` | Two policies with same name |
| `AuthzErrors.EmptyPolicy` | `AUTHZ_EMPTY_POLICY` | Policy has neither requirements nor evaluate |
| `DddErrors.CommandHandlerNotFound` | `DDD_COMMAND_HANDLER_NOT_FOUND` | No @CommandHandler registered |
| `DddErrors.QueryHandlerNotFound` | `DDD_QUERY_HANDLER_NOT_FOUND` | No @QueryHandler registered |

---

## 4. Edge Layer

### 4.1 `/response`

```typescript
import {
  buildSuccessResponse,
  buildErrorResponse,
  normalizeUnknownException,
  GlobalExceptionFilter,
  isBaseErrorLike,
  isErrorDetails,
  getMessageFromUnknown,
} from '@xlr8-nest/core/response';
```

#### `buildSuccessResponse<T>(data, options?)`

Builds the standard `SuccessResponse<T>` envelope.

```typescript
function buildSuccessResponse<T>(
  data: T,
  options?: {
    code?: string;
    message?: string;
    statusCode?: number;
    includeStatusCode?: boolean;
  }
): SuccessResponse<T>
```

**Usage:**
```typescript
@Get(':id')
async findOne(@Param('id') id: string) {
  const user = await this.userService.findById(id);
  return buildSuccessResponse(UserDto.from(user), {
    message: 'User retrieved',
  });
}
// → { success: true, data: { id: '...', name: '...' }, message: 'User retrieved' }

@Post()
@HttpCode(201)
async create(@Body() dto: CreateUserDto) {
  const user = await this.userService.create(dto);
  return buildSuccessResponse(UserDto.from(user), { statusCode: 201, includeStatusCode: true });
}
```

#### `buildErrorResponse(error, options?)`

Builds the standard `ErrorResponse` envelope from any thrown value.

```typescript
function buildErrorResponse(
  error: unknown,
  options?: {
    fallbackError?: ErrorType;
    fallbackStatusCode?: number;
    customErrorFactory?: (err: unknown) => ErrorResponse | null;
    includeStatusCode?: boolean;
  }
): ErrorResponse
```

**Usage in a custom filter:**
```typescript
@Catch()
export class MyFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const { statusCode } = normalizeUnknownException(exception);
    response.status(statusCode).json(buildErrorResponse(exception));
  }
}
```

#### `normalizeUnknownException(error, options?)`

Normalizes any thrown value into `{ statusCode, error, errors }`. Evaluation order:

1. `customErrorFactory` (if provided)
2. `BaseError` / `isBaseErrorLike`
3. NestJS `HttpException`
4. Plain `Error` (uses fallback message — never leaks `error.message`)
5. Unknown value (uses fallback)

```typescript
function normalizeUnknownException(
  error: unknown,
  options?: {
    fallbackError?: ErrorType;
    fallbackStatusCode?: number;
    customErrorFactory?: (err: unknown) => { statusCode: number; error: ErrorType; errors?: unknown } | null;
  }
): { statusCode: number; error: ErrorType; errors?: unknown }
```

#### `GlobalExceptionFilter`

A ready-to-use `@Catch()` exception filter. Logs the raw exception and sends a safe, standard error envelope to the client.

**Setup (recommended):**
```typescript
// app.module.ts — register globally
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from '@xlr8-nest/core/response';

providers: [
  { provide: APP_FILTER, useClass: GlobalExceptionFilter },
]
```

Or at bootstrap level:
```typescript
// main.ts
import { GlobalExceptionFilter } from '@xlr8-nest/core/response';

const app = await NestFactory.create(AppModule);
app.useGlobalFilters(new GlobalExceptionFilter());
```

The filter handles all unhandled exceptions: `BaseError` → correct HTTP status + code; NestJS `HttpException` → forwarded; plain `Error` → 500 with safe fallback message (raw message never leaked).

#### Type guards

| Function | Signature | Purpose |
|---|---|---|
| `isBaseErrorLike(value)` | `(unknown) => value is BaseError` | True if value is an Error with statusCode+code+brand |
| `isErrorDetails(value)` | `(unknown) => boolean` | True if value is a `Record<string, ErrorType>` |
| `getMessageFromUnknown(value)` | `(unknown) => string` | Extract a safe message string from any value |

---

### 4.2 `/validator`

```typescript
import { Validate, ZodValidationPipe } from '@xlr8-nest/core/validator';
```

#### `@Validate(schema)` decorator

Method/class decorator. Registers a `ZodValidationPipe` via `UsePipes`. The pipe validates both `@Body()` and `@Query()` arguments against the provided schema.

```typescript
const Validate: <T>(schema: ZodType<T>) => MethodDecorator & ClassDecorator
```

**Usage:**
```typescript
import { z } from 'zod';
import { Validate } from '@xlr8-nest/core/validator';

const CreateProductSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.number().positive(),
  categoryId: z.string().uuid(),
});
type CreateProductInput = z.infer<typeof CreateProductSchema>;

@Controller('products')
export class ProductController {
  @Post()
  @Validate(CreateProductSchema)
  create(@Body() input: CreateProductInput) {
    return this.productService.create(input);
  }
}
```

Accepts any `ZodType<T>` — not just `ZodObject`:
```typescript
// Array schema
const BulkCreateSchema = z.array(CreateProductSchema).min(1).max(100);

// Union schema
const CreateOrUpdateSchema = CreateProductSchema.or(UpdateProductSchema);
```

> **Footgun:** when a handler has both `@Body()` and `@Query()`, `@Validate` applies the same schema to both. Use separate explicit `ZodValidationPipe` instances per parameter in that case, or split into two decorators targeting different pipe metadata types.

#### `ZodValidationPipe<T>`

```typescript
class ZodValidationPipe<T> implements PipeTransform {
  constructor(schema: ZodType<T>)
  transform(value: unknown, metadata: ArgumentMetadata): T
}
```

Use directly when you need per-parameter control:
```typescript
@Get()
findAll(
  @Query(new ZodValidationPipe(PaginationSchema)) pagination: PaginationInput,
  @Body(new ZodValidationPipe(FilterSchema))      filter: FilterInput,
) { }
```

---

### 4.3 `/openapi`

```typescript
import {
  // Method decorators
  ApiGet, ApiPost, ApiPatch, ApiPut, ApiDelete,
  ApiMethod, ApiRedirect, ApiRaw, ApiRawArray,
  // Error decorators
  ApiError,
  ApiBadRequest, ApiUnauthorized, ApiForbidden,
  ApiNotFound, ApiConflict, ApiInternalError,
  // Response wrapper decorators
  ApiWrappedResponse, ApiPaginatedResponse, ApiErrorResponse,
  // Schema classes
  ApiResponseSchema, ErrorResponseSchema,
  DetailErrorSchema, PaginationMetaSchema,
} from '@xlr8-nest/core/openapi';
```

All decorators compose via `applyDecorators` and add Swagger metadata without requiring `@nestjs/swagger` to be installed at the root barrel level.

#### Verb shortcuts — `ApiGet`, `ApiPost`, `ApiPatch`, `ApiPut`, `ApiDelete`

Composite decorator that applies `@Api{Verb}()`, `@ApiOperation()`, and `@ApiOkResponse()` (or `@ApiCreatedResponse` for POST) for a typed success envelope.

```typescript
@Get(':id')
@ApiGet(UserDto, { summary: 'Get a user by ID' })
findOne(@Param('id') id: string) {}

@Post()
@ApiPost(UserDto, { summary: 'Create a user', statusCode: 201, message: 'User created' })
create(@Body() dto: CreateUserDto) {}

@Patch(':id')
@ApiPatch(UserDto, { summary: 'Update a user' })
update(@Param('id') id: string, @Body() dto: UpdateUserDto) {}

@Delete(':id')
@ApiDelete(undefined, { summary: 'Delete a user', statusCode: 204 })
remove(@Param('id') id: string) {}
```

Options:
```typescript
{
  summary?: string;
  description?: string;
  statusCode?: number;   // default: 200 (201 for POST)
  message?: string;      // default response message
  isArray?: boolean;     // wrap data in array
}
```

#### `ApiPaginatedResponse(dto, options?)`

Wraps the DTO in a paginated envelope with `PaginationMetaSchema`.

```typescript
@Get()
@ApiPaginatedResponse(UserDto, { summary: 'List users' })
findAll(@Query() query: PaginationQuery) {}
```

#### Error decorators

| Decorator | Status | Default code |
|---|---|---|
| `@ApiBadRequest()` | 400 | `BAD_REQUEST` |
| `@ApiUnauthorized()` | 401 | `UNAUTHORIZED` |
| `@ApiForbidden()` | 403 | `FORBIDDEN` |
| `@ApiNotFound()` | 404 | `NOT_FOUND` |
| `@ApiConflict()` | 409 | `CONFLICT` |
| `@ApiInternalError()` | 500 | `INTERNAL_SERVER_ERROR` |

```typescript
@Post()
@ApiPost(UserDto, { summary: 'Create user' })
@ApiBadRequest({ includeErrors: true })  // shows the errors field in Swagger
@ApiConflict()
create(@Body() dto: CreateUserDto) {}
```

Options: `{ code?, message?, description?, includeErrors?: boolean }`.

#### `ApiError(status, options?)` — generic error decorator

```typescript
@ApiError(422, { code: 'DOMAIN_RULE_VIOLATION', message: 'Business rule violated' })
```

#### `PaginationMetaSchema`

Swagger schema class for pagination metadata. Use it when building custom paginated response wrappers.

```typescript
class PaginationMetaSchema {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

---

## 5. Authorization

```typescript
import {
  AuthzModule,
  AuthorizationGuard,
  AuthorizationService,
  PolicyRegistry,
  // Decorators
  Authorize, Public, AllowAnonymous,
  RequireRoles, RequirePermissions, RequirePolicy,
  RequireResource, CheckOwnership,
  // Requirements (for imperative use)
  RolesRequirement, PermissionsRequirement,
  PolicyRequirement, ResourceRequirement,
  // Extension interfaces
  type RequirementHandler,
  type PrincipalResolver,
  type AuthorizationPrincipal,
  type AuthorizationContext,
  type AuthorizationDecision,
  type PolicyDefinition,
  // Utilities
  permissionMatches, hasPermission, hasAllPermissions, hasAnyPermission,
  // Tokens
  PrincipalResolverToken, RequirementHandlerToken, PoliciesToken,
} from '@xlr8-nest/core/authz';
```

### Setup

```typescript
AuthzModule.forRoot({
  resolver?: Type<PrincipalResolver>,     // default: RequestUserResolver
  handlers?: Type<RequirementHandler>[],  // extra custom handlers
  policies?: PolicyDefinition[],          // named policies
  registerGlobalGuard?: boolean,          // default: false
  defaultDeny?: boolean,                  // default: false — see below
  global?: boolean,                       // default: true
})

// Async configuration
AuthzModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (cfg: ConfigService): Promise<PolicyDefinition[]> => [...],
  resolver?: ...,
  handlers?: ...,
  registerGlobalGuard?: ...,
  defaultDeny?: ...,
})
```

**`defaultDeny`:** when `true`, routes with no `@Require*` or `@Authorize` decorator throw `403` unless they have `@Public()`. Opt-in fail-closed mode.

### Route decorators

#### `@Public()` / `@AllowAnonymous()`

Skip the authorization guard entirely for this route.

```typescript
@Get('health')
@Public()
health() {}
```

#### `@RequireRoles(...roles, options?)`

Grant if the principal has the specified roles.

```typescript
// any role (default)
@RequireRoles('admin', 'manager')

// all roles required
@RequireRoles('admin', 'billing', { mode: 'all' })
```

#### `@RequirePermissions(...permissions, options?)`

Grant if the principal has the specified permissions (wildcard-aware).

```typescript
// all permissions required (default)
@RequirePermissions('user:read', 'user:write')

// any permission sufficient
@RequirePermissions('reports:view', 'reports:export', { mode: 'any' })
```

**Wildcard matching** applies to what the *principal holds*, not what the route requires:

| Granted | Required | Match |
|---|---|---|
| `user:*` | `user:read` | ✅ trailing wildcard |
| `*` | `anything:here` | ✅ global wildcard |
| `user:*:read` | `user:profile:read` | ✅ interior wildcard |
| `user:read` | `user:write` | ❌ |

#### `@RequirePolicy(...policyNames)`

Apply named policies registered in `AuthzModule.forRoot({ policies })`.

```typescript
// Register
AuthzModule.forRoot({
  policies: [
    {
      name: 'CanPublishArticle',
      requirements: [
        new RolesRequirement(['editor', 'admin']),
        new PermissionsRequirement(['article:publish']),
      ],
    },
    {
      name: 'IsBusinessHours',
      evaluate: () => {
        const h = new Date().getUTCHours();
        return h >= 8 && h < 18;
      },
    },
  ],
})

// Use
@Post(':id/publish')
@RequirePolicy('CanPublishArticle', 'IsBusinessHours')  // AND
publish() {}
```

#### `@CheckOwnership(options?)`

Resource-ownership shorthand. Loads the resource and checks `resource[ownerField] === principal.id`.

```typescript
@Patch('articles/:id')
@CheckOwnership({
  ownerField: 'authorId',          // default: 'ownerId'
  bypassRoles: ['admin'],          // admins skip the ownership check
  load: async (ctx) => {
    const id = ctx.request.params.id;
    return articleRepo.findOne({ where: { id } });
  },
})
update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {}
```

#### `@RequireResource<T>(evaluate, load?)`

Generic resource-based check.

```typescript
@Get('documents/:id')
@RequireResource<Document>(
  (principal, doc, ctx) =>
    doc.ownerId === principal.id ||
    doc.sharedWith.includes(principal.id) ||
    principal.roles.includes('admin'),
  (ctx) => documentRepo.findOne({ where: { id: ctx.request.params.id } }),
)
read() {}
```

#### `@Authorize(...requirements)` — low-level

Attaches raw requirement objects directly. Every `@Require*` decorator is sugar over this.

```typescript
import { Authorize, RolesRequirement, PermissionsRequirement } from '@xlr8-nest/core/authz';

@Authorize(
  new RolesRequirement(['admin']),
  new PermissionsRequirement(['billing:write']),
)
@Post('invoices')
createInvoice() {}
```

Decorators can be stacked at class + method level — all requirements are merged (logical AND):

```typescript
@Controller('billing')
@RequireRoles('employee')           // applies to every route
export class BillingController {
  @Post('refunds')
  @RequirePermissions('billing:refund')
  @RequirePolicy('IsBusinessHours')
  refund() {}                       // needs: role 'employee' AND permission 'billing:refund' AND business hours
}
```

### `AuthorizationService` — imperative checks

Inject this in command handlers, domain services, or anywhere you need the same authorization logic without a guard.

```typescript
import {
  AuthorizationService,
  RolesRequirement,
  ResourceRequirement,
  type AuthorizationPrincipal,
} from '@xlr8-nest/core/authz';

@Injectable()
export class ArticleService {
  constructor(private readonly authz: AuthorizationService) {}

  async publish(principal: AuthorizationPrincipal, article: Article) {
    // Throws ForbiddenError on denial
    await this.authz.authorize(
      principal,
      [
        new RolesRequirement(['editor', 'admin']),
        new ResourceRequirement<Article>((p, a) => a.authorId === p.id),
      ],
      { resource: article },
    );
    // proceed with publish...
  }

  async canDelete(principal: AuthorizationPrincipal): Promise<boolean> {
    return this.authz.can(principal, [new RolesRequirement(['admin'])]);
  }
}
```

| Method | Signature | Behavior |
|---|---|---|
| `authorize(principal, reqs, ctx?)` | `Promise<void>` | Throws `ForbiddenError` on denial |
| `can(principal, reqs, ctx?)` | `Promise<boolean>` | Returns true/false, never throws |
| `checkAll(reqs, ctx)` | `Promise<AuthorizationDecision>` | Returns `{ granted, reason? }` |
| `check(req, ctx)` | `Promise<AuthorizationDecision>` | Single requirement evaluation |

### `AuthorizationPrincipal`

```typescript
interface AuthorizationPrincipal {
  id: string;
  roles: string[];
  permissions: string[];
  attributes?: Record<string, unknown>; // tenantId, plan, department, etc.
  raw?: unknown;                          // original identity object
}
```

### Adding a custom authorization strategy

No framework files change. Only three steps:

```typescript
// 1. Define the requirement
export class IpAllowlistRequirement implements AuthorizationRequirement<'ip-allowlist'> {
  readonly type = 'ip-allowlist';
  constructor(public readonly allowedRanges: string[]) {}
}

// 2. Implement the handler
@Injectable()
export class IpAllowlistHandler implements RequirementHandler<IpAllowlistRequirement> {
  readonly requirementType = 'ip-allowlist';

  handle(req: IpAllowlistRequirement, ctx: AuthorizationContext): boolean {
    const ip = ctx.request.ip;
    return req.allowedRanges.some(range => isInRange(ip, range));
  }
}

// 3. Register it
AuthzModule.forRoot({ handlers: [IpAllowlistHandler] })

// 4. (Optional) friendly decorator
export const AllowIpRange = (...ranges: string[]) =>
  Authorize(new IpAllowlistRequirement(ranges));
```

### Permission utilities

```typescript
import { permissionMatches, hasPermission, hasAllPermissions, hasAnyPermission } from '@xlr8-nest/core/authz';

permissionMatches('user:*', 'user:read')          // → true
permissionMatches('billing:*', 'billing')          // → false  (trailing-wildcard fix)
hasPermission(['user:*', 'billing:read'], 'user:write')  // → true
hasAllPermissions(['user:*'], ['user:read', 'user:write']) // → true
hasAnyPermission(['reports:view'], ['admin:panel', 'reports:view']) // → true
```

---

## 6. DDD

```typescript
import {
  // Primitives
  Entity, AggregateRoot, ValueObject,
  DomainEvent, DomainService,
  CompositeKey,
  // CQRS
  CommandBus, QueryBus, EventBus,
  AbstractMessageBus,
  ICommand, ICommandHandler,
  IQuery, IQueryHandler,
  IEventBus, ISaga,
  // Decorators
  CommandHandler, QueryHandler,
  Event, EventHandler,
  Saga,
  getEventName,
  // Modules
  CqrsModule, EventModule,
} from '@xlr8-nest/core/ddd';
```

### Setup

```typescript
@Module({
  imports: [
    CqrsModule.forRoot(),          // registers CommandBus, QueryBus, EventBus globally
  ],
})
export class AppModule {}
```

`CqrsModule` registers all three buses as `@Global` providers. `EventModule.forRoot()` is imported internally — do not import it separately in the same module to avoid double-init.

### `Entity<T>`

Base class for all domain entities. `T` is the identifier type (`string`, `number`, or `CompositeKey`).

```typescript
abstract class Entity<T extends Identifier> {
  protected readonly _id: T;
  get id(): T                              // public getter
  getId(): T                              // alias
  equals(other?: Entity<T>): boolean      // identity-based equality
}
```

**Usage:**
```typescript
import { Entity } from '@xlr8-nest/core/ddd';

export class User extends Entity<string> {
  private name: string;
  private email: string;

  private constructor(id: string, name: string, email: string) {
    super(id);
    this.name = name;
    this.email = email;
  }

  static create(name: string, email: string): User {
    return new User(randomUUID(), name, email);
  }

  changeName(name: string) {
    this.name = name;
  }
}

const u1 = User.create('Alice', 'alice@example.com');
const u2 = User.create('Bob',   'bob@example.com');
u1.equals(u2);  // false
u1.id;          // 'uuid-here'
```

### `AggregateRoot<T>`

Extends `Entity<T>`. Adds event collection (collect-then-dispatch pattern).

```typescript
abstract class AggregateRoot<T extends Identifier> extends Entity<T> {
  protected addEvent<TEvent extends DomainEvent>(event: TEvent): void
  pullEvents(): DomainEvent[]    // clears the event list and returns a copy
}
```

**Usage:**
```typescript
import { AggregateRoot } from '@xlr8-nest/core/ddd';
import { UserCreatedEvent } from '../events/user-created.event';

export class User extends AggregateRoot<string> {
  private constructor(id: string, public readonly email: string) {
    super(id);
  }

  static register(email: string): User {
    const user = new User(randomUUID(), email);
    user.addEvent(new UserCreatedEvent(user.id, email));  // raised, not yet published
    return user;
  }
}

// In the command handler:
const user = User.register(cmd.email);
await this.userRepo.save(user);
const events = user.pullEvents();       // claim events after save
await this.eventBus.publishAll(events); // publish to subscribers / outbox
```

### `ValueObject`

Abstract base for immutable value objects.

```typescript
abstract class ValueObject {
  abstract equals(other: this): boolean;
}
```

**Usage:**
```typescript
export class Money extends ValueObject {
  constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) { super(); }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  add(other: Money): Money {
    if (!this.currency === other.currency) throw new Error('Currency mismatch');
    return new Money(this.amount + other.amount, this.currency);
  }
}
```

### `CompositeKey<Parts>`

Immutable composite identifier (frozen plain object).

```typescript
class CompositeKey<T extends readonly KeyPart[]> {
  constructor(...parts: T)
  equals(other: CompositeKey<T>): boolean
  toArray(): T
  toString(): string
}

type KeyPart = string | number;
```

**Usage:**
```typescript
import { Entity, CompositeKey } from '@xlr8-nest/core/ddd';

class OrderItem extends Entity<CompositeKey<[string, string]>> {
  constructor(orderId: string, productId: string) {
    super(new CompositeKey(orderId, productId));
  }
}
```

### `DomainEvent`

Marker base class for domain events. Carries `occurredOn` timestamp.

```typescript
abstract class DomainEvent {
  readonly occurredOn: Date;
  constructor() { this.occurredOn = new Date(); }
}
```

**Decorator `@Event(name)`** sets the event name on the class (for `EventBus` routing):

```typescript
import { Event, DomainEvent } from '@xlr8-nest/core/ddd';

@Event('UserRegistered')
export class UserRegisteredEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) { super(); }
}
```

### Command / Query CQRS

#### Define a command and handler

```typescript
// command
export class CreateUserCommand implements ICommand {
  constructor(public readonly email: string, public readonly name: string) {}
}

// handler
@CommandHandler(CreateUserCommand)
@Injectable()
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, UserDto> {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(command: CreateUserCommand): Promise<UserDto> {
    const user = User.register(command.email, command.name);
    await this.userRepo.save(user);
    return UserDto.from(user);
  }
}
```

Register the handler as a NestJS provider in the feature module.

#### Define a query and handler

```typescript
export class GetUserQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetUserQuery)
@Injectable()
export class GetUserHandler implements IQueryHandler<GetUserQuery, UserDto> {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(query: GetUserQuery): Promise<UserDto> {
    const user = await this.userRepo.findById(query.userId);
    if (!user) throw new NotFoundError({ code: 'USER_NOT_FOUND', message: `User ${query.userId} not found` });
    return UserDto.from(user);
  }
}
```

#### Dispatch from a controller

```typescript
@Controller('users')
export class UserController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.commandBus.execute(new CreateUserCommand(dto.email, dto.name));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.queryBus.execute(new GetUserQuery(id));
  }
}
```

#### Event handlers and sagas

```typescript
import { Injectable } from '@nestjs/common';
import { filter, map } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import { EventHandler, Saga, type ICommand } from '@xlr8-nest/core/ddd';

// Event handler — @EventHandler registers the method with the EventBus.
// The method name is free; it is invoked when a matching event is published.
@Injectable()
export class UserEventHandlers {
  constructor(private readonly mailer: MailerService) {}

  @EventHandler(UserRegisteredEvent)
  async onUserRegistered(event: UserRegisteredEvent): Promise<void> {
    await this.mailer.sendWelcome(event.email);
  }
}

// Saga — reacts to the event stream and dispatches a command.
// The @Saga() member is an arrow-function property returning Observable<ICommand>;
// filter the stream with `instanceof` (the EventBus pushes raw event instances).
@Injectable()
export class UserSaga {
  @Saga()
  onUserRegistered = (events$: Observable<DomainEvent>): Observable<ICommand> =>
    events$.pipe(
      filter((e): e is UserRegisteredEvent => e instanceof UserRegisteredEvent),
      map((event) => new SendWelcomeEmailCommand(event.email)),
    );
}
```

### `EventBus`

```typescript
class EventBus implements IEventBus, OnModuleDestroy {
  publish<T extends DomainEvent>(event: T): void
  publishAll<T extends DomainEvent>(events: T[]): void
  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: (event: T) => void
  ): Subscription
}
```

`EventBus` implements `OnModuleDestroy` — all subscriptions are automatically cleaned up on module destroy.

---

## 7. Database

```typescript
import {
  DatabaseExtensionModule,
  IUnitOfWork, IUnitOfWorkToken,
  TypeOrmClient,
  InjectUnitOfWork, UnitOfWork,
  MigrationService, SeederService,
  Seeder, BaseSeeder, BaseFactory, BaseOrm,
  createDataSource, toDatabaseModuleConfig, defineConfig,
  DATABASE_MODULE_CONFIG,
} from '@xlr8-nest/core/database';
```

### Setup — `DatabaseExtensionModule`

```typescript
// Static config
DatabaseExtensionModule.register({
  connection: {
    type: DatabaseType.POSTGRES,       // DatabaseType enum or plain string
    host: 'localhost',
    port: 5432,
    username: 'app',
    password: 'secret',
    database: 'mydb',
  },
  entities: [UserOrm, ProductOrm],    // TypeORM entity classes or glob strings
  migration: {
    enabled: true,
    autoRun: false,                    // true → runs on module init, throws on failure
    migrationsPath: __dirname + '/migrations',
  },
  seeder: {
    enabled: true,
    autoRun: false,
    seeds: [UserSeeder, ProductSeeder], // seeder classes (not path strings)
  },
})

// Async config (with ConfigModule)
DatabaseExtensionModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): DatabaseModuleConfig => ({
    connection: {
      type: DatabaseType.POSTGRES,
      url: cfg.get('DATABASE_URL'),
    },
    entities: [__dirname + '/**/*.orm.{js,ts}'],
    migration: { enabled: true, autoRun: cfg.get('DB_AUTO_MIGRATE') === 'true' },
  }),
  migration: true,  // explicitly enable migration CLI runner
})
```

When `autoRun: true`, the module runs migrations/seeders in `onModuleInit` and **throws on failure** (fail-fast — the app won't start against an un-migrated schema).

### `IUnitOfWork`

The interface for transactional access. Inject via `IUnitOfWorkToken`.

```typescript
interface IUnitOfWork {
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  readonly manager: EntityManager;
}
const IUnitOfWorkToken: symbol;
```

**Inject in a repository or service:**
```typescript
import { Inject, Injectable } from '@nestjs/common';
import { IUnitOfWork, IUnitOfWorkToken } from '@xlr8-nest/core/database';

@Injectable()
export class UserRepository {
  constructor(
    @Inject(IUnitOfWorkToken) private readonly uow: IUnitOfWork,
  ) {}

  async save(user: User): Promise<void> {
    await this.uow.manager.save(UserOrm.fromDomain(user));
  }

  async findById(id: string): Promise<User | null> {
    const orm = await this.uow.manager.findOne(UserOrm, { where: { id } });
    return orm ? UserOrm.toDomain(orm) : null;
  }
}
```

**Run operations in a transaction:**
```typescript
await this.uow.transaction(async () => {
  await this.userRepo.save(user);
  await this.accountRepo.save(account);
  // both save inside the same QueryRunner — committed or rolled back together
});
```

### `@InjectUnitOfWork()` decorator

Shorthand for `@Inject(IUnitOfWorkToken)`.

```typescript
@Injectable()
export class OrderService {
  constructor(
    @InjectUnitOfWork() private readonly uow: IUnitOfWork,
  ) {}
}
```

### `TypeOrmClient`

Concrete implementation of `IUnitOfWork` (you rarely need to reference this directly — use the interface).

```typescript
class TypeOrmClient implements IUnitOfWork {
  readonly manager: EntityManager         // active transactional EM or DataSource.manager
  get client(): EntityManager             // @deprecated — use manager
  transaction<T>(fn: () => Promise<T>): Promise<T>
}
```

### `BaseOrm`

Base class for TypeORM ORM entities that can be constructed from a plain object.

```typescript
abstract class BaseOrm {
  constructor(orm?: Partial<this>) {
    if (orm) Object.assign(this, orm);
  }
}
```

**Usage:**
```typescript
@Entity('users')
export class UserOrm extends BaseOrm {
  @PrimaryColumn() id: string;
  @Column() email: string;
  @Column() name: string;

  static fromDomain(user: User): UserOrm {
    return new UserOrm({ id: user.id, email: user.email, name: user.name });
  }

  static toDomain(orm: UserOrm): User {
    return User.reconstitute(orm.id, orm.email, orm.name);
  }
}
```

### `BaseSeeder` and `Seeder`

`DataSource` is constructor-injected by the framework. `this.manager` is a getter on `Seeder` that returns `dataSource.manager`. There is **no** `manager` parameter — use `this.manager` and `this.clearTable()` directly.

```typescript
abstract class Seeder {
  protected readonly dataSource: DataSource   // constructor-injected
  protected get manager(): EntityManager       // dataSource.manager

  abstract run(): Promise<void>                // implement this — no parameters

  protected clearTable(tableName: string): Promise<void>
  // tableName validated against /^[A-Za-z_][A-Za-z0-9_]*$/ before TRUNCATE

  protected disableForeignKeyChecks(): Promise<void>  // PostgreSQL
  protected enableForeignKeyChecks(): Promise<void>   // PostgreSQL
}

// BaseSeeder is just an alias — extend either one
abstract class BaseSeeder extends Seeder {}
```

**Usage:**
```typescript
export class UserSeeder extends BaseSeeder {
  async run(): Promise<void> {              // no parameters
    await this.clearTable('users');         // validates + TRUNCATE CASCADE
    await this.manager.insert(UserOrm, [   // this.manager from base class
      { id: '1', email: 'admin@example.com', name: 'Admin' },
    ]);
  }
}
```

Register seeders in `DatabaseExtensionModule` config:
```typescript
seeder: {
  enabled: true,
  seeds: [UserSeeder, RoleSeeder],   // order matters if FK deps exist
  autoRun: false,
}
```

### `BaseFactory<T>`

```typescript
abstract class BaseFactory<T> {
  abstract make(overrides?: Partial<T>): T;
  makeMany(count: number, overrides?: Partial<T>): T[]
}
```

**Usage (with @faker-js/faker):**
```typescript
import { faker } from '@faker-js/faker';

export class UserFactory extends BaseFactory<UserOrm> {
  make(overrides?: Partial<UserOrm>): UserOrm {
    return new UserOrm({
      id:    overrides?.id    ?? faker.string.uuid(),
      email: overrides?.email ?? faker.internet.email(),
      name:  overrides?.name  ?? faker.person.fullName(),
    });
  }
}

const users = new UserFactory().makeMany(20);
```

### `MigrationService`

```typescript
class MigrationService {
  runMigrations(): Promise<void>
  revertLastMigration(): Promise<void>
}
```

Inject and call programmatically, or use the CLI runner (`nest start -- migration:run`).

---

## 8. Messaging

```typescript
import {
  MessagingModule,
  IntegrationEvent,
  OutboxPublisher,
  OutboxWorker,
  OutboxAdminService,
  OutboxEventStatus,
  IDomainEventTranslator,
  TRANSLATORS_TOKEN,
  IMessagePublisher,
  MessagePublisherToken,
  ConsoleMessagePublisher,
  type OutboxWorkerOptions,
  type OutboxStats,
} from '@xlr8-nest/core/messaging';
```

### Architecture overview

```
Within UoW transaction:
  Aggregate raises DomainEvent
     → OutboxPublisher translates (IDomainEventTranslator) to IntegrationEvent
     → IntegrationEvent persisted in outbox_events table (same transaction)

Background (OutboxWorker):
  Poll outbox_events for pending rows
     → Atomic UPDATE SET status='processing' RETURNING * (SKIP LOCKED)
     → Group by aggregateId, publish each group sequentially
     → On success: UPDATE status='published'
     → On failure: UPDATE retry_count++, next_attempt_at (backoff+jitter)
     → After N failures: UPDATE status='failed' (terminal)
```

### Setup — `MessagingModule`

```typescript
MessagingModule.forRoot({
  publisher: KafkaPublisher,          // your IMessagePublisher implementation
  translators: [                       // one per DomainEvent type
    UserRegisteredTranslator,
    OrderPlacedTranslator,
  ],
  worker: {
    enabled: true,                     // default: true — set false in non-worker processes
    pollIntervalMs: 2000,
    batchSize: 25,
    baseBackoffMs: 30_000,
    maxBackoffMs: 3_600_000,
    maxJitterMs: 5_000,
    terminalFailureRetries: 10,
  },
})
```

### `IntegrationEvent`

Abstract base class for all cross-service events.

```typescript
abstract class IntegrationEvent {
  readonly id: string;               // auto-generated UUID
  readonly occurredAt: Date;         // defaults to new Date()
  abstract readonly eventName: string;      // e.g. 'user.registered.v1'
  abstract readonly aggregateType: string;  // e.g. 'User'
  abstract readonly aggregateId: string;

  constructor(occurredAt?: Date)     // pass domain event's occurredOn to preserve time

  toPayload(): Record<string, unknown>  // override for custom serialization
}
```

**Define a concrete integration event:**
```typescript
export class UserRegisteredIntegrationEvent extends IntegrationEvent {
  readonly eventName = 'user.registered.v1';
  readonly aggregateType = 'User';
  readonly aggregateId: string;

  readonly email: string;
  readonly name: string;

  constructor(userId: string, email: string, name: string, occurredAt?: Date) {
    super(occurredAt);
    this.aggregateId = userId;
    this.email = email;
    this.name = name;
  }

  // Optional — override toPayload() for versioned/explicit payload shape
  toPayload(): Record<string, unknown> {
    return { email: this.email, name: this.name };
  }
}
```

The default `toPayload()` uses `JSON.parse(JSON.stringify(this))` stripping routing fields (`id`, `occurredAt`, `eventName`, `aggregateType`, `aggregateId`). Override for selective payloads or type coercions.

### `IDomainEventTranslator<TDomainEvent>`

Bridge between a `DomainEvent` and one or more `IntegrationEvent`s.

```typescript
interface IDomainEventTranslator<TEvent extends DomainEvent> {
  supports(event: DomainEvent): event is TEvent;
  translate(event: TEvent): IntegrationEvent | IntegrationEvent[];
}
```

**Implementation:**
```typescript
@Injectable()
export class UserRegisteredTranslator implements IDomainEventTranslator<UserRegisteredEvent> {
  supports(event: DomainEvent): event is UserRegisteredEvent {
    return event instanceof UserRegisteredEvent;
  }

  translate(event: UserRegisteredEvent): IntegrationEvent {
    return new UserRegisteredIntegrationEvent(
      event.userId,
      event.email,
      event.name,
      event.occurredOn,   // preserve original domain event time
    );
  }
}
```

### `OutboxPublisher`

Application service that persists integration events in the outbox within the current UoW transaction.

```typescript
class OutboxPublisher {
  publishFrom(aggregate: AggregateRoot<any>): Promise<IntegrationEvent[]>
}
```

**Usage in a command handler:**
```typescript
@CommandHandler(RegisterUserCommand)
@Injectable()
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly userRepo: UserRepository,
    private readonly outbox: OutboxPublisher,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: RegisterUserCommand) {
    await this.uow.transaction(async () => {
      const user = User.register(cmd.email, cmd.name);
      await this.userRepo.save(user);
      // Translates domain events → integration events → inserts outbox rows
      // All inside the same transaction as the aggregate save
      await this.outbox.publishFrom(user);
    });
    // After commit: pull domain events for in-process bus (optional)
    // Note: user.pullEvents() was already called inside publishFrom
  }
}
```

### `IMessagePublisher`

Port for the actual broker adapter. Implement this for your message broker.

```typescript
interface IMessagePublisher {
  publish(event: OutboxEventRecord): Promise<void>;
}
```

**Kafka example:**
```typescript
@Injectable()
export class KafkaPublisher implements IMessagePublisher {
  constructor(private readonly kafka: KafkaClient) {}

  async publish(record: OutboxEventRecord): Promise<void> {
    await this.kafka.producer.send({
      topic: record.eventName,
      messages: [{ key: record.aggregateId, value: JSON.stringify(record.payload) }],
    });
  }
}
```

Provide it in `MessagingModule.forRoot({ publisher: KafkaPublisher })`.

`ConsoleMessagePublisher` is the built-in no-op publisher (logs to console — useful for development).

### `OutboxWorker`

Polling consumer that processes due outbox rows in the background. Automatically starts on `OnModuleInit` unless `enabled: false`.

```typescript
class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  tick(): Promise<void>   // public — call directly for ad-hoc draining / graceful shutdown
}
```

**Disable in CLI processes or dedicated web replicas:**
```typescript
MessagingModule.forRoot({
  publisher: ConsoleMessagePublisher,
  translators: [],
  worker: { enabled: false },   // poller won't start
})
```

### `OutboxWorkerOptions`

```typescript
interface OutboxWorkerOptions {
  pollIntervalMs?: number;          // default: 2000
  batchSize?: number;               // default: 25
  baseBackoffMs?: number;           // default: 30_000
  maxBackoffMs?: number;            // default: 3_600_000 (1h)
  maxJitterMs?: number;             // default: 5_000
  terminalFailureRetries?: number;  // default: 10
  enabled?: boolean;                // default: true
}
```

### `OutboxAdminService`

```typescript
class OutboxAdminService {
  getStats(): Promise<OutboxStats>
  requeueFailed(ids?: string[]): Promise<number>
}

interface OutboxStats {
  pending: number;
  processing: number;
  published: number;
  failed: number;
}
```

### `OutboxEventStatus` enum

```typescript
enum OutboxEventStatus {
  PENDING    = 'pending',
  PROCESSING = 'processing',
  PUBLISHED  = 'published',
  FAILED     = 'failed',
}
```

---

## Cross-Cutting Patterns

### Full CQRS + Outbox flow

```typescript
// 1. Command handler — save aggregate + persist outbox in one transaction
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  constructor(
    @InjectUnitOfWork() private readonly uow: IUnitOfWork,
    private readonly orderRepo: OrderRepository,
    private readonly outbox: OutboxPublisher,
  ) {}

  async execute(cmd: PlaceOrderCommand) {
    return this.uow.transaction(async () => {
      const order = Order.place(cmd.customerId, cmd.items);
      await this.orderRepo.save(order);
      await this.outbox.publishFrom(order); // atomic with save
      return order.id;
    });
  }
}

// 2. Translator — domain event → integration event
@Injectable()
export class OrderPlacedTranslator implements IDomainEventTranslator<OrderPlacedEvent> {
  supports(e: DomainEvent): e is OrderPlacedEvent { return e instanceof OrderPlacedEvent; }
  translate(e: OrderPlacedEvent): IntegrationEvent {
    return new OrderPlacedIntegrationEvent(e.orderId, e.customerId, e.occurredOn);
  }
}
```

### Error handling setup

```typescript
// app.module.ts
providers: [
  { provide: APP_FILTER, useClass: GlobalExceptionFilter },
]

// Anywhere in your code — errors flow to GlobalExceptionFilter automatically
throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: `Order ${id} not found` });
throw new ConflictError({ code: 'EMAIL_TAKEN', message: 'This email is already in use' });
throw new BadRequestError(
  { code: 'VALIDATION_FAILED', message: 'Input validation failed' },
  { email: { code: 'INVALID_FORMAT', message: 'Must be a valid email' } },
);
```

### Authorization + OpenAPI + Validation — complete controller

```typescript
import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiGet, ApiPost, ApiBadRequest, ApiForbidden, ApiNotFound } from '@xlr8-nest/core/openapi';
import { Validate } from '@xlr8-nest/core/validator';
import { RequireRoles, RequirePermissions, CheckOwnership } from '@xlr8-nest/core/authz';
import { z } from 'zod';

const CreateArticleSchema = z.object({
  title:   z.string().min(3).max(200),
  content: z.string().min(10),
  tags:    z.array(z.string()).max(10).optional(),
});
type CreateArticleInput = z.infer<typeof CreateArticleSchema>;

@Controller('articles')
export class ArticleController {
  @Get()
  @ApiGet(ArticleDto, { summary: 'List articles', isArray: true })
  findAll() { return this.articleService.findAll(); }

  @Get(':id')
  @ApiGet(ArticleDto, { summary: 'Get article by ID' })
  @ApiNotFound()
  findOne(@Param('id') id: string) { return this.articleService.findById(id); }

  @Post()
  @ApiPost(ArticleDto, { summary: 'Create article' })
  @ApiBadRequest({ includeErrors: true })
  @ApiForbidden()
  @RequireRoles('author', 'admin')
  @Validate(CreateArticleSchema)
  create(@Body() input: CreateArticleInput) {
    return this.articleService.create(input);
  }

  @Patch(':id')
  @ApiPatch(ArticleDto, { summary: 'Update article' })
  @ApiForbidden()
  @ApiNotFound()
  @CheckOwnership({ ownerField: 'authorId', bypassRoles: ['admin'] })
  @Validate(CreateArticleSchema.partial())
  update(@Param('id') id: string, @Body() dto: Partial<CreateArticleInput>) {
    return this.articleService.update(id, dto);
  }
}
```

---

## Peer Dependencies Summary

| Feature | Required peers |
|---|---|
| Foundation (`/constants`, `/errors`, `/types`) | none |
| `/utils` | `zod` |
| `/response` | `@nestjs/common` |
| `/validator` | `@nestjs/common`, `zod` |
| `/openapi` | `@nestjs/common`, `@nestjs/swagger` |
| `/authz` | `@nestjs/common`, `@nestjs/core` |
| `/ddd` | `@nestjs/common`, `@nestjs/core`, `@nestjs/event-emitter`, `rxjs`, `reflect-metadata` |
| `/database` | `@nestjs/common`, `@nestjs/typeorm`, `typeorm` |
| `/database` (CLI) | + `nest-commander`, `@sqltools/formatter` |
| `/database` (seeder factories) | + `@faker-js/faker` |
| `/messaging` | all of `/ddd` + `/database` + their peers |
