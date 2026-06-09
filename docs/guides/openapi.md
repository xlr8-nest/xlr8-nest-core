# OpenAPI (`@xlr8-nest/core/openapi`)

Composite Swagger decorators that document HTTP operations and standard response envelopes in a single line. Use this module whenever you have `@nestjs/swagger` installed and want consistent, boilerplate-free Swagger documentation across all controllers.

---

## Table of Contents

- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
  - [The standard response envelope](#the-standard-response-envelope)
  - [Decorator composition](#decorator-composition)
  - [Error decorators are additive](#error-decorators-are-additive)
- [Verb decorators](#verb-decorators)
  - [Signatures](#signatures)
  - [Examples](#examples)
- [Paginated responses](#paginated-responses)
- [Error decorators](#error-decorators)
  - [Shorthand decorators](#shorthand-decorators)
  - [`includeErrors` — field-level validation errors](#includeerrors--field-level-validation-errors)
  - [Custom error code](#custom-error-code)
  - [`@ApiError` — custom status codes](#apierror--custom-status-codes)
- [Patterns & recipes](#patterns--recipes)
  - [Full CRUD controller with error catalog](#full-crud-controller-with-error-catalog)
  - [Raw response (no envelope)](#raw-response-no-envelope)
  - [Custom envelope via `wrapper`](#custom-envelope-via-wrapper)
- [Low-level building blocks](#low-level-building-blocks)
- [Important rules / gotchas](#important-rules--gotchas)
- [See also](#see-also)

---

## Quick start

Install the peer dependency if you haven't already:

```bash
npm install @nestjs/swagger
```

Annotate a CRUD controller:

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import {
  ApiGet,
  ApiPost,
  ApiPatch,
  ApiDelete,
  ApiBadRequest,
  ApiNotFound,
  ApiConflict,
} from '@xlr8-nest/core/openapi';

@Controller('users')
export class UserController {
  @Get(':id')
  @ApiGet(UserDto, { summary: 'Get a user by ID' })
  @ApiNotFound()
  findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Get()
  @ApiGet(UserDto, { summary: 'List all users', isArray: true })
  findAll() {
    return this.userService.findAll();
  }

  @Post()
  @ApiPost(UserDto, { summary: 'Create a user' })
  @ApiBadRequest({ includeErrors: true })
  @ApiConflict()
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Patch(':id')
  @ApiPatch(UserDto, { summary: 'Update a user' })
  @ApiBadRequest({ includeErrors: true })
  @ApiNotFound()
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @ApiDelete(null, { summary: 'Delete a user' })
  @ApiNotFound()
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
```

That is the entire setup. No `@ApiResponse`, no `@ApiOperation`, no manual schema wiring needed.

---

## Core concepts

### The standard response envelope

Every verb decorator documents the response in the library's standard `SuccessResponse` shape:

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "Resource retrieved successfully",
  "data": { ... }
}
```

`data` is typed to the DTO class you pass as the first argument. Passing `null` or `undefined` documents `data: null` (used for DELETE endpoints or other no-payload responses).

### Decorator composition

Each verb decorator (`@ApiGet`, `@ApiPost`, etc.) is a thin wrapper over two lower-level decorators:

- `ApiOperation` — sets the `summary` and optional `description` on the operation.
- `ApiWrappedResponse` — registers the typed schema via `ApiExtraModels` + `ApiResponse`.

You never need to call either directly for standard CRUD endpoints.

### Error decorators are additive

Stack error decorators alongside the success decorator. Each adds a separate Swagger response entry for its status code. Multiple error decorators on the same method are all registered independently.

---

## Verb decorators

### Signatures

All verb decorators share the same signature:

```typescript
ApiGet(dataType: Type<T> | null | undefined, options: ApiMethodOptions): MethodDecorator
ApiPost(dataType: Type<T> | null | undefined, options: ApiMethodOptions): MethodDecorator
ApiPatch(dataType: Type<T> | null | undefined, options: ApiMethodOptions): MethodDecorator
ApiPut(dataType: Type<T> | null | undefined, options: ApiMethodOptions): MethodDecorator
ApiDelete(dataType: Type<T> | null | undefined, options: ApiMethodOptions): MethodDecorator
```

`ApiMethodOptions`:

| Option | Type | Default | Description |
|---|---|---|---|
| `summary` | `string` | required | Operation summary shown in Swagger UI |
| `description` | `string` | — | Extended markdown description |
| `status` | `number` | `200` (`201` for POST) | Override the success status code |
| `message` | `string` | method-specific default | Text shown in `message` field of the schema |
| `isArray` | `boolean` | `false` | Wrap `data` in an array |
| `paginated` | `boolean` | `false` | Wrap `data` in `{ items, meta }` with `PaginationMetaSchema` |
| `wrapper` | `ApiSuccessWrapperFactory` | — | Override the entire envelope schema |

### Examples

```typescript
import { ApiGet, ApiPost, ApiPatch, ApiPut, ApiDelete } from '@xlr8-nest/core/openapi';

// Single object — GET 200
@ApiGet(ProductDto, { summary: 'Get product' })

// Array — GET 200
@ApiGet(ProductDto, { summary: 'List products', isArray: true })

// Paginated — GET 200 with { items: ProductDto[], meta: PaginationMetaSchema }
@ApiGet(ProductDto, { summary: 'List products paginated', paginated: true })

// POST — defaults to 201 Created
@ApiPost(ProductDto, { summary: 'Create product' })

// POST with custom status
@ApiPost(ProductDto, { summary: 'Accept product import', status: 202, message: 'Import accepted' })

// No payload (DELETE, fire-and-forget POST, etc.)
@ApiDelete(null, { summary: 'Delete product' })
@ApiPost(null, { summary: 'Trigger reindex', status: 202 })
```

---

## Paginated responses

### `@ApiGet(..., { paginated: true })` vs `ApiPaginatedResponse`

Use `@ApiGet(Dto, { paginated: true })` on controller methods — it is the simplest path and composes with `summary`/`description` in one decorator.

Use the lower-level `ApiPaginatedResponse` directly only when the HTTP-method shorthands do not apply (non-standard status codes, programmatic schema building):

```typescript
import { ApiPaginatedResponse } from '@xlr8-nest/core/openapi';

// Low-level — equivalent to ApiGet with paginated: true
ApiPaginatedResponse(200, 'Paginated products retrieved successfully', ProductDto)
```

Paginated `data` schema:

```json
{
  "data": {
    "items": [ { "...": "ProductDto fields" } ],
    "meta": {
      "total": 100,
      "perPage": 10,
      "currentPage": 1,
      "lastPage": 10
    }
  }
}
```

`paginated: true` and `isArray: true` cannot be used together — the decorator throws at decoration time.

---

## Error decorators

### Shorthand decorators

| Decorator | Status | Default code | Default message |
|---|---|---|---|
| `@ApiBadRequest()` | 400 | `BAD_REQUEST` | Bad request |
| `@ApiUnauthorized()` | 401 | `UNAUTHORIZED` | Unauthorized |
| `@ApiForbidden()` | 403 | `FORBIDDEN` | Forbidden |
| `@ApiNotFound()` | 404 | `NOT_FOUND` | Resource not found |
| `@ApiConflict()` | 409 | `CONFLICT` | Resource conflict |
| `@ApiInternalError()` | 500 | `INTERNAL_SERVER_ERROR` | Internal server error |

All shorthand decorators accept an optional options object:

```typescript
type ApiErrorShortcutOptions = {
  error?: { code: string; message: string };
  includeErrors?: boolean;  // add errors map to schema (default: false)
  wrapper?: ApiErrorWrapperFactory;
};
```

### `includeErrors` — field-level validation errors

Pass `{ includeErrors: true }` to add an `errors` map to the documented response schema. Use this on any endpoint that may return per-field validation errors (typically 400 responses from `@Validate`):

```typescript
@Post()
@ApiPost(UserDto, { summary: 'Create user' })
@ApiBadRequest({ includeErrors: true })
create(@Body() dto: CreateUserDto) {}
```

Swagger will show:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Bad request",
  "errors": {
    "email": { "code": "invalid_field", "message": "Must be a valid email" }
  }
}
```

### Custom error code

Override the default `{ code, message }` on any shorthand:

```typescript
import { ApiConflict, ApiNotFound } from '@xlr8-nest/core/openapi';

@ApiConflict({ error: { code: 'USER-EMAIL_CONFLICT', message: 'A user with this email already exists.' } })
@ApiNotFound({ error: { code: 'USER-NOT_FOUND', message: 'User not found.' } })
```

Prefer importing these from a domain error catalog rather than inlining literals — see the [Errors guide](../api-reference.md#35-errors).

### `@ApiError` — custom status codes

Use `@ApiError` for any status code not covered by a shorthand (422, 429, 503, etc.):

```typescript
import { ApiError } from '@xlr8-nest/core/openapi';

@ApiError(422, {
  error: { code: 'ORDER-INVALID_TRANSITION', message: 'Order cannot transition to this state.' },
})
@ApiError(503, {
  error: { code: 'PAYMENT-GATEWAY_UNAVAILABLE', message: 'Payment gateway is currently unavailable.' },
})
```

`@ApiError` signature:

```typescript
ApiError(statusCode: number, options: ApiErrorOptions): MethodDecorator

interface ApiErrorOptions {
  error: { code: string; message: string };
  includeErrors?: boolean;
  wrapper?: ApiErrorWrapperFactory;
}
```

---

## Patterns & recipes

### Full CRUD controller with error catalog

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import {
  ApiGet,
  ApiPost,
  ApiPatch,
  ApiDelete,
  ApiBadRequest,
  ApiNotFound,
  ApiConflict,
  ApiError,
} from '@xlr8-nest/core/openapi';
import type { ErrorType } from '@xlr8-nest/core/types';

// Domain error catalog — define once, reference everywhere
export const ProductErrors = {
  NotFound:      { code: 'PRODUCT-NOT_FOUND',     message: 'Product not found.' },
  SlugConflict:  { code: 'PRODUCT-SLUG_CONFLICT',  message: 'A product with this slug already exists.' },
  InvalidStatus: { code: 'PRODUCT-INVALID_STATUS', message: 'Invalid product status transition.' },
} as const satisfies Record<string, ErrorType>;

@Controller('products')
export class ProductController {
  @Get()
  @ApiGet(ProductDto, { summary: 'List products', paginated: true })
  findAll() {}

  @Get(':id')
  @ApiGet(ProductDto, { summary: 'Get product by ID' })
  @ApiNotFound({ error: ProductErrors.NotFound })
  findOne(@Param('id') id: string) {}

  @Post()
  @ApiPost(ProductDto, { summary: 'Create product' })
  @ApiBadRequest({ includeErrors: true })
  @ApiConflict({ error: ProductErrors.SlugConflict })
  create(@Body() dto: CreateProductDto) {}

  @Patch(':id')
  @ApiPatch(ProductDto, { summary: 'Update product' })
  @ApiBadRequest({ includeErrors: true })
  @ApiNotFound({ error: ProductErrors.NotFound })
  @ApiError(422, { error: ProductErrors.InvalidStatus })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {}

  @Delete(':id')
  @ApiDelete(null, { summary: 'Delete product' })
  @ApiNotFound({ error: ProductErrors.NotFound })
  remove(@Param('id') id: string) {}
}
```

### Raw response (no envelope)

When an endpoint must return data directly without the `{ success, code, message, data }` wrapper (e.g. health checks, file downloads, third-party webhook compatibility):

```typescript
import { ApiRaw, ApiRawArray } from '@xlr8-nest/core/openapi';

@Get('health')
@ApiRaw(HealthDto, { summary: 'Health check' })
health(): HealthDto {
  return { status: 'ok', uptime: process.uptime() };
}

@Get('export')
@ApiRawArray(ProductCsvRowDto, { summary: 'Export products as JSON array' })
export(): ProductCsvRowDto[] {
  return this.productService.exportAll();
}
```

### Custom envelope via `wrapper`

Replace the default `{ success, code, message, data }` schema while keeping the type information. The `wrapper` factory receives the pre-built default schema and the extra models as context so you can extend rather than rebuild from scratch:

```typescript
import {
  ApiPost,
  type ApiSuccessWrapperFactory,
  type ApiSchemaDefinition,
} from '@xlr8-nest/core/openapi';

const legacyWrapper: ApiSuccessWrapperFactory = (ctx): ApiSchemaDefinition => ({
  schema: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'ok' },
      result: ctx.defaultSchema.properties?.data ?? {},
    },
    required: ['status', 'result'],
  },
  extraModels: ctx.defaultExtraModels,
});

@Post('legacy-endpoint')
@ApiPost(UserDto, { summary: 'Create user (legacy shape)', wrapper: legacyWrapper })
createLegacy(@Body() dto: CreateUserDto) {}
```

### `PaginationMetaSchema` in custom wrappers

When building a custom wrapper for a paginated endpoint, reference `PaginationMetaSchema` via `@ApiExtraModels` to ensure Swagger registers the schema:

```typescript
import { ApiExtraModels } from '@nestjs/swagger';
import { ApiGet, PaginationMetaSchema } from '@xlr8-nest/core/openapi';

@Get()
@ApiExtraModels(PaginationMetaSchema)
@ApiGet(UserDto, { summary: 'List users', paginated: true })
findAll() {}
```

`@ApiGet` with `paginated: true` registers `PaginationMetaSchema` automatically via `ApiExtraModels` internally. You only need to add `@ApiExtraModels(PaginationMetaSchema)` explicitly when building a fully manual wrapper that references the schema via `getSchemaPath`.

---

## Low-level building blocks

Use these when the HTTP-method shorthands do not fit your situation (non-standard statuses, programmatic composition, reusable decorator factories):

```typescript
import {
  ApiWrappedResponse,
  ApiPaginatedResponse,
  ApiErrorResponse,
} from '@xlr8-nest/core/openapi';

// Success — arbitrary status
ApiWrappedResponse(202, 'Import accepted', ImportResultDto)

// Success array
ApiWrappedResponse(200, 'Bulk results', BulkResultDto, { isArray: true })

// Paginated (equivalent to ApiGet with paginated: true)
ApiPaginatedResponse(200, 'Page of orders', OrderDto)

// Error
ApiErrorResponse(429, { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded.' })
```

---

## Important rules / gotchas

**`@nestjs/swagger` is a required peer dep — do not import this subpath without it.**
The module imports from `@nestjs/swagger` at the top level. If `@nestjs/swagger` is absent, the import throws at startup. Do not import from `@xlr8-nest/core/openapi` in projects that do not use Swagger.

**Import from `@xlr8-nest/core/openapi`, not from `@xlr8-nest/core`.**
The root barrel does not re-export openapi. Use the explicit subpath.

**`paginated: true` and `isArray: true` are mutually exclusive.**
Combining them throws a `Error` at decoration time (module init). Use `paginated` when you need `{ items, meta }` and `isArray` when you just need a bare array in `data`.

**Passing `null` as `dataType` with `isArray` or `paginated` throws.**
`@ApiDelete(null, { summary: '...' })` is valid. `@ApiDelete(null, { isArray: true })` is not — the decorator throws at decoration time.

**Schema drift is silent.**
The Swagger schema is generated at decoration time from the DTO class structure. If you later change the runtime response shape (rename fields, wrap differently) without updating the decorator, Swagger shows a stale schema. Add a conformance test that compares the runtime `buildSuccessResponse` output shape against the documented schema for endpoints that matter.

**Error decorator `error` objects should come from a domain error catalog, not inline literals.**
Inline `{ code: 'FOO', message: '...' }` strings scattered across controllers diverge silently. Define an `as const satisfies Record<string, ErrorType>` catalog per domain module and import from it.

**`@ApiError` and the shorthand decorators do not validate that your runtime code actually throws that status.**
They are purely documentation. Wire them to match your service layer's actual error throws.

---

## See also

- [API Reference — /openapi](../api-reference.md#43-openapi)
- [API Reference — /errors](../api-reference.md#35-errors)
- [API Reference — /response](../api-reference.md#41-response)
- [API Reference — /validator](../api-reference.md#42-validator)
