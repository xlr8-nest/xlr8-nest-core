# Constants & Utilities (`@xlr8-nest/core/constants` · `@xlr8-nest/core/utils`)

The foundation layer of `@xlr8-nest/core`. Two lightweight, dependency-free modules that every other module in the library depends on:

- **`@xlr8-nest/core/constants`** — canonical HTTP status code enum and a default error definition table.
- **`@xlr8-nest/core/utils`** (alias: `@xlr8-nest/core/util`) — a single `validateInput` helper that converts Zod validation failures into the library's typed `BadRequestError`.

Neither module ships runtime services, NestJS modules, or injectable classes — they are pure TypeScript exports safe to import in any layer (domain, application, infrastructure, tests).

---

## Table of Contents

- [`@xlr8-nest/core/constants`](#xlr8-nestcoreconstants)
  - [`StatusCode` enum](#statuscode-enum)
  - [`CommonErrors`](#commonerrors)
  - [`CommonErrorType`](#commonerrortype)
- [`@xlr8-nest/core/utils`](#xlr8-nestcoreutils)
  - [`validateInput<T>(value, schema): T`](#validateinputtvalue-schema-t)
- [Relationship with other modules](#relationship-with-other-modules)
- [Patterns](#patterns)
  - [Centralise status codes](#centralise-status-codes)
  - [Use `validateInput` outside of controllers](#use-validateinput-outside-of-controllers)
  - [Custom error tables that follow the `CommonErrors` shape](#custom-error-tables-that-follow-the-commonerrors-shape)
- [See also](#see-also)

---

## `@xlr8-nest/core/constants`

### `StatusCode` enum

The single source of HTTP status codes used across the entire library. Import instead of bare `number` literals wherever a status code is needed.

```typescript
import { StatusCode } from '@xlr8-nest/core/constants';
```

**Full enum:**

| Name | Value | Typical use |
|---|---|---|
| `SUCCESS` | 200 | Standard GET / PATCH / PUT / DELETE success |
| `CREATED` | 201 | Resource created (POST) |
| `ACCEPTED` | 202 | Async operation accepted |
| `NO_CONTENT` | 204 | Success, no body |
| `REDIRECT` | 302 | Redirect response |
| `BAD_REQUEST` | 400 | Invalid request payload |
| `UNAUTHORIZED` | 401 | Missing or invalid credentials |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | State conflict (duplicate, optimistic lock) |
| `UNPROCESSABLE_ENTITY` | 422 | Semantically invalid request |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Dependency unavailable |

**Usage:**

```typescript
import { StatusCode } from '@xlr8-nest/core/constants';

// In a response builder
return buildSuccessResponse(user, { statusCode: StatusCode.CREATED });

// In an OpenAPI decorator
@HttpCode(StatusCode.NO_CONTENT)

// In a test assertion
expect(response.statusCode).toBe(StatusCode.NOT_FOUND);
```

---

### `CommonErrors`

A `const` table of default `ErrorType` values for each built-in error class. The six HTTP error subclasses (`BadRequestError`, `UnauthorizedError`, etc.) use these as their default `{ code, message }` when you call `new BadRequestError()` with no arguments.

```typescript
import { CommonErrors } from '@xlr8-nest/core/constants';
```

**Full table:**

| Key | `code` | `message` | Used by |
|---|---|---|---|
| `BadRequestError` | `'BAD_REQUEST'` | `'Bad request'` | `BadRequestError()` default |
| `UnauthorizedError` | `'UNAUTHORIZED'` | `'Unauthorized'` | `UnauthorizedError()` default |
| `ForbiddenError` | `'FORBIDDEN'` | `'Forbidden'` | `ForbiddenError()` default |
| `NotFoundError` | `'NOT_FOUND'` | `'Resource not found'` | `NotFoundError()` default |
| `ConflictError` | `'CONFLICT'` | `'Resource conflict'` | `ConflictError()` default |
| `UnprocessableEntityError` | `'UNPROCESSABLE_ENTITY'` | `'Unprocessable entity'` | — |
| `TooManyRequestsError` | `'TOO_MANY_REQUESTS'` | `'Too many requests'` | — |
| `InternalServerError` | `'INTERNAL_SERVER_ERROR'` | `'Internal server error'` | `InternalServerError()` default |
| `ServiceUnavailableError` | `'SERVICE_UNAVAILABLE'` | `'Service temporarily unavailable'` | — |

**Reading a default error:**

```typescript
import { CommonErrors } from '@xlr8-nest/core/constants';

console.log(CommonErrors.NotFoundError);
// { code: 'NOT_FOUND', message: 'Resource not found' }
```

**Using as a fallback in custom logic:**

```typescript
import { CommonErrors } from '@xlr8-nest/core/constants';
import { buildErrorResponse } from '@xlr8-nest/core/response';

const body = buildErrorResponse(err, {
  fallbackError: CommonErrors.InternalServerError,
});
```

---

### `CommonErrorType`

The keyof union of `CommonErrors` — useful for narrowing the `code` field in generic contexts.

```typescript
import type { CommonErrorType } from '@xlr8-nest/core/constants';
// type CommonErrorType = 'BadRequestError' | 'UnauthorizedError' | ... | 'ServiceUnavailableError'
```

---

## `@xlr8-nest/core/utils`

A minimal utility module containing one exported function: `validateInput`. This is the internal adapter that `ZodValidationPipe` (and `@Validate`) use to convert a Zod parse failure into the library's own `BadRequestError`.

```typescript
import { validateInput } from '@xlr8-nest/core/utils';
// or (identical alias):
import { validateInput } from '@xlr8-nest/core/util';
```

---

### `validateInput<T>(value, schema): T`

Validates `value` against a Zod schema. Returns the parsed (and transformed) result on success; throws `BadRequestError` with per-field details on failure.

**Signature:**

```typescript
function validateInput<T>(value: unknown, schema: ZodSchema<T>): T
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `value` | `unknown` | The raw input to validate (usually `req.body` or `req.query`) |
| `schema` | `ZodSchema<T>` | Any Zod schema: `z.object`, `z.string`, `z.array`, etc. |

**Returns:** `T` — the validated and transformed value, fully typed.

**Throws:** `BadRequestError` with:
- `code: 'VALIDATION_ERROR'`
- `message: 'Validation failed'`
- `errors`: a field-keyed map where each value is `{ code: 'invalid_field', message: '<Zod message>' }`.

**Flow:**

```
validateInput(value, schema)
       │
       ▼
schema.safeParse(value)
       │
   success? ──yes──▶  return result.data  (typed T)
       │
      no
       │
       ▼
formatZodErrors(result.error)
   ┌─────────────────────────────────────────────────┐
   │  for each Zod issue:                            │
   │    path = issue.path.join('.') || '_root'       │
   │    groups[path].push(issue.message)             │
   └─────────────────────────────────────────────────┘
       │
       ▼
throw new BadRequestError(
  { code: 'VALIDATION_ERROR', message: 'Validation failed' },
  { [path]: { code: 'invalid_field', message: messages.join('; ') } }
)
```

**Key behaviour:**

- **All issues are collected** — multiple failures for the same field are joined with `'; '`, not silently dropped (no last-write-wins).
- **Nested paths** use dot notation: `items.0.name`.
- **Root-level failures** (no path) key under `_root`.
- The thrown error flows naturally through `GlobalExceptionFilter` — no extra translation needed.

**Example — direct usage:**

```typescript
import { z } from 'zod';
import { validateInput } from '@xlr8-nest/core/utils';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

// In an application service or pipe:
const dto = validateInput(rawBody, CreateUserSchema);
// dto is typed as { email: string; name: string }
```

**Example — error output:**

Given `{ email: 'notanemail', name: 'x' }`:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "errors": {
    "email": { "code": "invalid_field", "message": "Invalid email" },
    "name":  { "code": "invalid_field", "message": "String must contain at least 2 character(s)" }
  }
}
```

---

## Relationship with other modules

```
@xlr8-nest/core/types
        ▲
        │ (ErrorType)
@xlr8-nest/core/constants ──────────▶ @xlr8-nest/core/errors
        ▲                                      ▲
        │                                      │ (BadRequestError)
@xlr8-nest/core/utils ─────────────────────────┘
        ▲
        │
@xlr8-nest/core/validator  (ZodValidationPipe uses validateInput internally)
@xlr8-nest/core/response   (normalizer reads CommonErrors for fallback codes)
```

- `constants` imports `ErrorType` from `types` — the only dependency.
- `utils` imports `BadRequestError` from `errors`.
- All higher-level modules (`response`, `validator`, `openapi`, `authz`, `ddd`, `database`, `messaging`) ultimately depend on `constants` and `types` directly or transitively.

---

## Patterns

### Centralise status codes

Never use bare integer literals for status codes in application code. Import `StatusCode` and use the named constant:

```typescript
// Bad
response.status(201).json(body);

// Good
import { StatusCode } from '@xlr8-nest/core/constants';
response.status(StatusCode.CREATED).json(body);
```

### Use `validateInput` outside of controllers

`validateInput` is not limited to HTTP request pipes. Use it anywhere you need Zod validation that integrates with the error envelope:

```typescript
// Validating a message payload consumed from a queue
import { validateInput } from '@xlr8-nest/core/utils';
import { OrderCreatedSchema } from './schemas/order-created.schema';

const payload = validateInput(rawMessage, OrderCreatedSchema);
```

If the validation fails, `BadRequestError` is thrown. Catch it in your error boundary and handle it accordingly (reject the message, DLQ, etc.).

### Custom error tables that follow the `CommonErrors` shape

When defining a feature's error catalog, follow the same `as const satisfies Record<string, ErrorType>` pattern used by `CommonErrors`:

```typescript
import type { ErrorType } from '@xlr8-nest/core/types';

export const PAYMENT_ERRORS = {
  CARD_DECLINED:    { code: 'PAYMENT-CARD_DECLINED',    message: 'Card was declined' },
  INSUFFICIENT_FUNDS: { code: 'PAYMENT-INSUFFICIENT_FUNDS', message: 'Insufficient funds' },
} as const satisfies Record<string, ErrorType>;
```

The `as const` ensures `code` is narrowed to a string literal union; `satisfies Record<string, ErrorType>` catches typos at compile time.

---

## See also

- [Errors guide](./errors.md) — HTTP error classes that use `StatusCode` and `CommonErrors`
- [Response guide](./response.md) — response builders that reference `StatusCode` and `CommonErrors`
- [Validator guide](./validator.md) — `@Validate` decorator that delegates to `validateInput`
- [Types guide](./types.md) — `ErrorType`, `ErrorDetails`, and the response envelope contracts
