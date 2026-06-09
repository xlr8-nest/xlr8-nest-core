# Errors (`@xlr8-nest/core/errors`)

Typed HTTP error classes that carry a stable machine-readable `code`, a human-readable `message`, and an optional field-level `errors` map — all serialised to a standard envelope by `GlobalExceptionFilter`.

**When to use:** throw these instead of `HttpException` (or any NestJS built-in error) whenever your service layer needs to signal a problem to the HTTP layer.

---

## Table of Contents

- [Quick start](#quick-start)
- [Error catalog pattern](#error-catalog-pattern)
  - [Creating a catalog](#creating-a-catalog)
  - [Code naming convention](#code-naming-convention)
  - [Using catalog entries at throw sites](#using-catalog-entries-at-throw-sites)
- [Built-in error classes](#built-in-error-classes)
  - [400 vs 409 vs 422](#400-vs-409-vs-422)
- [Field-level errors](#field-level-errors)
- [Custom error subclasses](#custom-error-subclasses)
- [Integration with GlobalExceptionFilter](#integration-with-globalexceptionfilter)
- [Patterns and recipes](#patterns-and-recipes)
  - [Service method with multiple error conditions](#service-method-with-multiple-error-conditions)
  - [Cross-realm / multi-bundle detection](#cross-realm--multi-bundle-detection)
  - [Typing a catalog with a generic TCode](#typing-a-catalog-with-a-generic-tcode)
- [Gotchas](#gotchas)
- [See Also](#see-also)

---

## Quick start

```typescript
// src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@xlr8-nest/core/errors';
import { USER_ERRORS } from './errors/user.errors';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async findOne(id: string) {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundError(USER_ERRORS.USER_NOT_FOUND);
    }
    return user;
  }
}
```

`GlobalExceptionFilter` (registered separately — see [Integration](#integration-with-globalexceptionfilter)) converts that throw into:

```json
{
  "success": false,
  "code": "USER-USER_NOT_FOUND",
  "message": "User not found"
}
```

---

## Error catalog pattern

Keep every `ErrorType` constant in a catalog file next to the feature it belongs to. Never inline `{ code, message }` literals at throw sites.

### Creating a catalog

```typescript
// src/users/errors/user.errors.ts
import type { ErrorType } from '@xlr8-nest/core/errors';

export const USER_ERRORS = {
  USER_NOT_FOUND:        { code: 'USER-USER_NOT_FOUND',        message: 'User not found' },
  USER_EMAIL_TAKEN:      { code: 'USER-USER_EMAIL_TAKEN',      message: 'Email address is already in use' },
  USER_INACTIVE:         { code: 'USER-USER_INACTIVE',         message: 'User account is inactive' },
  USER_ROLE_MISMATCH:    { code: 'USER-USER_ROLE_MISMATCH',    message: 'User does not have the required role' },
} as const satisfies Record<string, ErrorType>;
```

`as const satisfies Record<string, ErrorType>` gives you:

- **Literal inference** — `USER_ERRORS.USER_NOT_FOUND.code` has type `'USER-USER_NOT_FOUND'`, not `string`.
- **Contract enforcement** — TypeScript errors if any entry omits `code` or `message`.
- **No runtime overhead** — the object is a plain constant, not a class or registry.

### Code naming convention

Format: `DOMAIN-SNAKE_CASE`

| Domain | Example code |
|--------|-------------|
| `USER` | `USER-USER_NOT_FOUND` |
| `ORDER` | `ORDER-ORDER_ALREADY_SHIPPED` |
| `PAYMENT` | `PAYMENT-INSUFFICIENT_BALANCE` |

Rules:
- Domain prefix is singular, all caps, matching the feature name.
- The suffix after `-` is `UPPER_SNAKE_CASE` and describes the specific condition.
- No spaces, dots, or mixed case anywhere.

### Using catalog entries at throw sites

```typescript
import { ConflictError, BadRequestError } from '@xlr8-nest/core/errors';
import { USER_ERRORS } from '../errors/user.errors';

// Good — named constant, traceable across the codebase
throw new ConflictError(USER_ERRORS.USER_EMAIL_TAKEN);

// Bad — inline literal, breaks traceability
throw new ConflictError({ code: 'USER-USER_EMAIL_TAKEN', message: 'Email address is already in use' });
```

---

## Built-in error classes

Six concrete subclasses cover the most common HTTP error scenarios. All extend `BaseError`, which extends the native `Error`.

| Class | HTTP status | When to use |
|-------|-------------|-------------|
| `BadRequestError` | 400 | Malformed input — missing required fields, wrong data types, invalid format. The request itself cannot be understood. |
| `UnauthorizedError` | 401 | No valid credentials provided or the token has expired. |
| `ForbiddenError` | 403 | Valid credentials but the caller lacks permission for this resource or action. |
| `NotFoundError` | 404 | The requested resource does not exist (or must not be revealed to the caller). |
| `ConflictError` | 409 | State-machine violation or uniqueness conflict — duplicate email, order already shipped, account already verified. The resource exists but the requested transition is invalid in its current state. |
| `InternalServerError` | 500 | Unexpected failure that is the server's fault. Do not use for domain errors. |

### 400 vs 409 vs 422

The three "something is wrong with your request" codes are the most commonly confused:

- **400 BadRequestError** — the payload cannot be parsed or structurally validated. Use at the HTTP boundary (pipes, DTOs). Example: `userId` is not a valid UUID.
- **409 ConflictError** — valid input, but the current server state prevents the operation. Use in the service layer. Example: creating a user whose email already exists.
- **422 UnprocessableEntityError** — valid structure, reachable state, but a domain rule rejects the combination. Use in the domain/service layer. Example: withdrawing more than the account balance. **Note:** no dedicated class is exported for 422 — use `BaseError` directly (see [Custom error subclasses](#custom-error-subclasses)).

### Default (no-argument) throws

Every class has a built-in default drawn from `CommonErrors`. You can throw without arguments when the default message is acceptable:

```typescript
import { NotFoundError, UnauthorizedError } from '@xlr8-nest/core/errors';

throw new NotFoundError();      // code: 'NOT_FOUND',    message: 'Resource not found'
throw new UnauthorizedError();  // code: 'UNAUTHORIZED', message: 'Unauthorized'
```

Prefer named catalog constants for any error that will be handled or displayed to users.

---

## Field-level errors

`BadRequestError`, `NotFoundError`, and `ConflictError` accept a second argument — an `ErrorDetails` map that attaches per-field error entries. `ForbiddenError`, `UnauthorizedError`, and `InternalServerError` do **not** accept field-level details.

```typescript
import { BadRequestError } from '@xlr8-nest/core/errors';
import type { ErrorDetails } from '@xlr8-nest/core/errors';
import { USER_ERRORS } from '../errors/user.errors';

// Single field
throw new BadRequestError(
  USER_ERRORS.USER_EMAIL_TAKEN,
  {
    email: { code: 'USER-USER_EMAIL_TAKEN', message: 'Email address is already in use' },
  },
);
```

The serialised response becomes:

```json
{
  "success": false,
  "code": "USER-USER_EMAIL_TAKEN",
  "message": "Email address is already in use",
  "errors": {
    "email": { "code": "USER-USER_EMAIL_TAKEN", "message": "Email address is already in use" }
  }
}
```

Use field-level errors for client-side form highlighting. Keep the top-level `code`/`message` as the summary the API consumer reads first.

---

## Custom error subclasses

Extend `BaseError` directly to create a class for any HTTP status not covered by the built-ins. This is the recommended pattern for 422 Unprocessable Entity, 429 Too Many Requests, and 503 Service Unavailable.

```typescript
// src/common/errors/unprocessable-entity.error.ts
import { BaseError } from '@xlr8-nest/core/errors';
import type { ErrorType } from '@xlr8-nest/core/errors';

export class UnprocessableEntityError extends BaseError {
  constructor(error: ErrorType) {
    super(422, error);
  }
}
```

```typescript
// src/common/errors/too-many-requests.error.ts
import { BaseError } from '@xlr8-nest/core/errors';
import type { ErrorType } from '@xlr8-nest/core/errors';

export class TooManyRequestsError extends BaseError {
  constructor(error: ErrorType) {
    super(429, error);
  }
}
```

Register these in a shared barrel (`src/common/errors/index.ts`) and import them alongside the built-ins. `GlobalExceptionFilter` handles them automatically because it checks `statusCode` on the `BaseError` instance — no registration needed.

---

## Integration with GlobalExceptionFilter

`GlobalExceptionFilter` must be registered for any error to be serialised correctly. Without it, NestJS's default filter turns your typed `BaseError` into a generic 500.

### Option A — via DI (recommended)

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from '@xlr8-nest/core/response';

@Module({
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
```

### Option B — manually in `main.ts`

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { GlobalExceptionFilter } from '@xlr8-nest/core/response';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(3000);
}
bootstrap();
```

Option A is preferred because it participates in NestJS dependency injection, allowing you to inject options or services into the filter later.

---

## Patterns and recipes

### Service method with multiple error conditions

```typescript
// src/orders/orders.service.ts
import { Injectable } from '@nestjs/common';
import { NotFoundError, ConflictError, ForbiddenError } from '@xlr8-nest/core/errors';
import { ORDER_ERRORS } from './errors/order.errors';

@Injectable()
export class OrdersService {
  async ship(orderId: string, operatorId: string) {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundError(ORDER_ERRORS.ORDER_NOT_FOUND);
    }

    if (order.operatorId !== operatorId) {
      throw new ForbiddenError(ORDER_ERRORS.ORDER_ACCESS_DENIED);
    }

    if (order.status !== 'READY') {
      throw new ConflictError(ORDER_ERRORS.ORDER_CANNOT_SHIP);
    }

    return this.orders.markShipped(orderId);
  }
}
```

### Cross-realm / multi-bundle detection

When errors cross VM contexts (e.g. micro-frontend shells, bundled sub-apps), `instanceof BaseError` can return `false` even for a genuine `BaseError`. Use the brand symbol instead:

```typescript
import { BASE_ERROR_BRAND } from '@xlr8-nest/core/errors';

function isBaseError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<symbol, unknown>)[BASE_ERROR_BRAND] === true
  );
}
```

### Typing a catalog with a generic TCode

To get full literal-type narrowing on `code` inside generic helpers, parameterise `ErrorType`:

```typescript
import type { ErrorType } from '@xlr8-nest/core/errors';

type UserErrorCode =
  | 'USER-USER_NOT_FOUND'
  | 'USER-USER_EMAIL_TAKEN'
  | 'USER-USER_INACTIVE';

export const USER_ERRORS = {
  USER_NOT_FOUND:   { code: 'USER-USER_NOT_FOUND'   as const, message: 'User not found' },
  USER_EMAIL_TAKEN: { code: 'USER-USER_EMAIL_TAKEN' as const, message: 'Email address is already in use' },
  USER_INACTIVE:    { code: 'USER-USER_INACTIVE'    as const, message: 'User account is inactive' },
} satisfies Record<string, ErrorType<UserErrorCode>>;
```

---

## Gotchas

**Do not use NestJS `HttpException`.**
`BaseError` extends native `Error`, not `HttpException`. Mixing both in the same service breaks the standard envelope — `GlobalExceptionFilter` handles `HttpException` as a fallback, not a first-class path. Standardise on `BaseError` subclasses.

**`GlobalExceptionFilter` must be registered.**
Without it, NestJS's built-in exception layer intercepts your `BaseError` and returns a generic `{ statusCode, message }` body that bypasses the library's envelope. Nothing in the library registers the filter automatically.

**Never inline error literals at throw sites.**
`throw new NotFoundError({ code: 'USER-USER_NOT_FOUND', message: '...' })` at every call site makes codes impossible to search, refactor, or audit. Always define in a catalog and import the constant.

**`ForbiddenError`, `UnauthorizedError`, and `InternalServerError` do not accept `ErrorDetails`.**
These error classes only take an `ErrorType` argument. Passing a second argument to them is a compile-time error. If you need field-level context on a 403 or 401, attach it to the top-level `message` instead, or reconsider whether the error class is appropriate.

**`errors` is keyed by field name, not by index.**
`ErrorDetails` is `Record<string, DetailError>` — one entry per field. It is not an array. Do not pass `['must be a valid email']` (array of strings) — pass `{ email: { code: '...', message: '...' } }`.

**Raw `Error.message` is not forwarded to clients.**
`GlobalExceptionFilter` intentionally suppresses the raw message from unrecognised `Error` instances to prevent internal detail leakage. Only `BaseError` subclasses have their message forwarded. If you are debugging and need raw messages, set `exposeInternalMessages: true` in the filter options — never in production.

---

## See Also

- [API Reference — errors section](../api-reference.md#35-errors)
- [Authorization guide](../authz.md) — `ForbiddenError` and `UnauthorizedError` are thrown by the authz layer; understand when the guard throws vs. when your code should.
- [Response guide](../api-reference.md#41-response) — `GlobalExceptionFilter`, response envelope shape, and `buildSuccessResponse`.
