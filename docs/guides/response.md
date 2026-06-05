# Response (`@xlr8-nest/core/response`)

Builds standard success/error envelopes and provides a global exception filter that translates any thrown value into a safe, typed HTTP response.

**When to use:** wire `GlobalExceptionFilter` once at bootstrap, then call `buildSuccessResponse` in every controller method. Everything thrown — `BaseError`, NestJS `HttpException`, plain `Error`, or unknown — is caught, normalized, and serialized consistently.

---

## Quick start

### 1. Register the filter

**Option A — DI (recommended).** Register in `AppModule`. NestJS injects the filter through its DI container, so you can later inject services into a subclass.

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

**Option B — bootstrap.** Simpler, but the filter instance lives outside the DI tree.

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

### 2. Return a success response from a controller

```typescript
// src/users/users.controller.ts
import { Controller, Get, Post, Body, Param, HttpCode } from '@nestjs/common';
import { buildSuccessResponse } from '@xlr8-nest/core/response';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserDto } from './dto/user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    return buildSuccessResponse(UserDto.from(user));
  }

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    return buildSuccessResponse(UserDto.from(user), {
      statusCode: 201,
      message: 'User created successfully',
    });
  }
}
```

Wire `GlobalExceptionFilter`, call `buildSuccessResponse` — that is all you need for 95 % of routes.

---

## Core concepts

### The response envelope

Every response has the same discriminated shape:

```
// success
{ success: true, data: T, code?: string, message?: string, statusCode?: number }

// error
{ success: false, error: { code: string, message: string }, errors?: unknown }
```

Controllers own the `success: true` path via `buildSuccessResponse`. The filter owns the `success: false` path via `buildErrorResponse`.

### Evaluation chain in the filter

When an exception is thrown and not caught by a controller, `GlobalExceptionFilter` calls `normalizeUnknownException`, which applies rules in this order:

1. **`customErrorFactory`** — if you provided one, it runs first. Return a `NormalizedException` to short-circuit, or `null`/`undefined` to fall through.
2. **`BaseError` / `isBaseErrorLike`** — carries its own `statusCode`, `code`, and optional `errors`. Used as-is.
3. **NestJS `HttpException`** — status and message extracted from the NestJS envelope.
4. **Plain `Error`** — status becomes the configured `fallbackStatusCode` (default 500). The raw `error.message` is **never forwarded** to the client; the configured fallback message is used instead.
5. **Unknown value** — same treatment as plain `Error`.

### Type aliases

| Alias | Meaning | When to use |
|---|---|---|
| `ApiSuccess<T>` | `SuccessResponse<T>` | Controller return types |
| `ApiFailure` | `ErrorResponse` | Custom filter return types |
| `ApiResult<T>` | `ApiSuccess<T> \| ApiFailure` | Generic service return types |

```typescript
import type { ApiSuccess, ApiFailure, ApiResult } from '@xlr8-nest/core/response';

// Controller method — caller always gets the success shape
async findOne(@Param('id') id: string): Promise<ApiSuccess<UserDto>> {
  return buildSuccessResponse(await this.usersService.findById(id));
}

// Service that may return either shape (rare — prefer throwing)
async tryFind(id: string): Promise<ApiResult<UserDto>> {
  const user = await this.repo.findById(id);
  if (!user) return buildErrorResponse(new NotFoundError());
  return buildSuccessResponse(UserDto.from(user));
}
```

---

## `buildSuccessResponse`

```typescript
import { buildSuccessResponse } from '@xlr8-nest/core/response';
import type { ApiSuccess } from '@xlr8-nest/core/response';

function buildSuccessResponse<T>(
  data: T,
  options?: {
    code?: string;
    message?: string;
    statusCode?: number;
    includeStatusCode?: boolean;
  },
): ApiSuccess<T>
```

- `statusCode` sets the value in the envelope body only. Set the actual HTTP status code with NestJS `@HttpCode()` on the method.
- `includeStatusCode: true` includes `statusCode` in the serialized JSON. Omit it (the default) for a leaner body.

```typescript
// GET — minimal, no options needed
return buildSuccessResponse(UserDto.from(user));

// POST — 201 with message
@HttpCode(201)
async create(@Body() dto: CreateUserDto) {
  const user = await this.usersService.create(dto);
  return buildSuccessResponse(UserDto.from(user), {
    statusCode: 201,
    message: 'Created',
    includeStatusCode: true,
  });
}
// → { success: true, statusCode: 201, message: 'Created', data: { ... } }
```

---

## `buildErrorResponse` and `normalizeUnknownException`

These are used internally by `GlobalExceptionFilter`. Reach for them directly only when you write a **custom exception filter**.

### `normalizeUnknownException`

Returns `{ statusCode, error, errors? }` — the raw normalization result before it is wrapped in the envelope.

```typescript
import { normalizeUnknownException } from '@xlr8-nest/core/response';

const result = normalizeUnknownException(exception, {
  fallbackStatusCode: 500,
  fallbackError: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  customErrorFactory: (err) => {
    if (err instanceof MyDomainException) {
      return { statusCode: 422, error: { code: err.code, message: err.userMessage } };
    }
    return null; // fall through to default chain
  },
});
// result: { statusCode: number, error: { code, message }, errors?: unknown }
```

### `buildErrorResponse`

Wraps the normalization result in the standard error envelope.

```typescript
import { buildErrorResponse } from '@xlr8-nest/core/response';

// Typical custom filter
import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { buildErrorResponse, normalizeUnknownException } from '@xlr8-nest/core/response';

@Catch()
export class MyAuditFilter implements ExceptionFilter {
  constructor(private readonly audit: AuditService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const { statusCode } = normalizeUnknownException(exception);
    await this.audit.log(req, statusCode, exception);

    res.status(statusCode).json(buildErrorResponse(exception));
  }
}
```

---

## Custom error factory

Pass `customErrorFactory` in `NormalizeExceptionOptions` to intercept exceptions before the default pipeline. The factory runs first in the evaluation chain.

### With `APP_FILTER` (Option A)

Subclass `GlobalExceptionFilter` or pass options via the constructor:

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from '@xlr8-nest/core/response';
import { PaymentDeclinedException } from './payments/errors';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useFactory: () =>
        new GlobalExceptionFilter({
          customErrorFactory: (err) => {
            if (err instanceof PaymentDeclinedException) {
              return {
                statusCode: 402,
                error: { code: 'PAYMENT_DECLINED', message: err.reason },
              };
            }
            return null;
          },
        }),
    },
  ],
})
export class AppModule {}
```

### With `app.useGlobalFilters` (Option B)

```typescript
// src/main.ts
app.useGlobalFilters(
  new GlobalExceptionFilter({
    fallbackStatusCode: 500,
    customErrorFactory: (err) => {
      if (err instanceof PaymentDeclinedException) {
        return { statusCode: 402, error: { code: 'PAYMENT_DECLINED', message: err.reason } };
      }
      return null;
    },
  }),
);
```

For most domain exceptions, prefer extending `BaseError` — it is cheaper and removes the need for a factory entirely:

```typescript
import { BaseError } from '@xlr8-nest/core/errors';
import { StatusCode } from '@xlr8-nest/core/constants';

export class PaymentDeclinedError extends BaseError<'PAYMENT_DECLINED'> {
  constructor(reason: string) {
    super(StatusCode.BAD_REQUEST, { code: 'PAYMENT_DECLINED', message: reason });
  }
}

// Now throw it — GlobalExceptionFilter handles it with no factory required
throw new PaymentDeclinedError('Insufficient funds');
```

---

## Patterns & recipes

### Domain error catalog (required pattern)

Never inline `{ code, message }` at throw sites. Define a typed catalog per domain module.

```typescript
// src/users/errors/user.errors.ts
import type { ErrorType } from '@xlr8-nest/core/types';

export const UserErrors = {
  NotFound:      { code: 'USER-NOT_FOUND',      message: 'User not found.' },
  EmailConflict: { code: 'USER-EMAIL_CONFLICT',  message: 'A user with this email already exists.' },
  Forbidden:     { code: 'USER-FORBIDDEN',       message: 'You do not have permission to access this user.' },
} as const satisfies Record<string, ErrorType>;
```

```typescript
// src/users/users.service.ts
import { NotFoundError, ConflictError, ForbiddenError } from '@xlr8-nest/core/errors';
import { UserErrors } from './errors/user.errors';

if (!user)       throw new NotFoundError(UserErrors.NotFound);
if (emailTaken)  throw new ConflictError(UserErrors.EmailConflict);
if (!isOwner)    throw new ForbiddenError(UserErrors.Forbidden);
```

Code naming convention: `DOMAIN-SNAKE_CASE` uppercase — e.g. `USER-NOT_FOUND`, `ORDER-INVALID_TRANSITION`.

### Field-level validation errors

`BadRequestError` accepts a second argument that maps field names to `ErrorType`.

```typescript
import { BadRequestError } from '@xlr8-nest/core/errors';

throw new BadRequestError(
  { code: 'VALIDATION_FAILED', message: 'Input validation failed' },
  {
    email:    { code: 'INVALID_FORMAT',  message: 'Must be a valid email address.' },
    password: { code: 'TOO_SHORT',       message: 'Must be at least 8 characters.' },
  },
);
// → { success: false, error: { code: 'VALIDATION_FAILED', ... }, errors: { email: {...}, password: {...} } }
```

### Type-guarding unknown values in a custom filter

Use the exported utilities when you need to classify a thrown value before deciding how to respond.

```typescript
import {
  isBaseErrorLike,
  isErrorDetails,
  getMessageFromUnknown,
} from '@xlr8-nest/core/response';

function classify(err: unknown) {
  if (isBaseErrorLike(err)) {
    // err.statusCode, err.code, err.errors are all available
    console.log('Domain error:', err.code, err.statusCode);
  } else {
    // safe — never leaks internals
    console.log('Unknown error type, safe message:', getMessageFromUnknown(err));
  }
  if (isErrorDetails(err)) {
    // err is Record<string, { code, message }>
  }
}
```

### Typed controller returns

Annotate return types with `ApiSuccess<T>` so callers know what shape to expect.

```typescript
import type { ApiSuccess } from '@xlr8-nest/core/response';
import { buildSuccessResponse } from '@xlr8-nest/core/response';

@Get(':id')
async findOne(@Param('id') id: string): Promise<ApiSuccess<UserDto>> {
  const user = await this.usersService.findById(id);
  return buildSuccessResponse(UserDto.from(user));
}
```

---

## Gotchas

**Must register `GlobalExceptionFilter`.** Without it, NestJS uses its built-in exception layer which returns a different response shape. There is no auto-registration — wire it in `AppModule` or `main.ts` as shown above.

**Raw `Error.message` is never forwarded to the client.** When `normalizeUnknownException` handles a plain `Error` or an unknown thrown value, it uses the configured `fallbackError.message` (default: `'Internal server error'`), not the original message. This is intentional — stack traces, ORM errors, and internal details must not leak.

**204 and 302 still emit a body when you call `buildSuccessResponse`.** The library builds the envelope object; NestJS decides whether to send it. If your handler is decorated with `@HttpCode(204)`, NestJS strips the body — but calling `buildSuccessResponse` at the TypeScript level is still harmless (the object is built and then discarded). If you need to return nothing, simply return `undefined` and let `GlobalExceptionFilter` stay out of the way.

**`statusCode` in the options does not set the HTTP status code.** Pass `statusCode` in `buildSuccessResponse` options only when you want it embedded in the JSON body. Use `@HttpCode(201)` (or `res.status(...)`) to control the actual HTTP status.

**`APP_FILTER` providers must be in the root module.** Registering `GlobalExceptionFilter` inside a feature module will not make it truly global. Put the provider in `AppModule.providers`.

**`customErrorFactory` must return `null` or `undefined` to fall through.** Returning any other falsy value (e.g. `0`, `false`) is treated as a valid result and may produce an unexpected response.

---

## See also

- [Errors guide](./errors.md) — `BaseError` hierarchy, subclass pattern, domain error catalogs
- [Database guide](./database.md) — `IUnitOfWork`, transactions, ORM entities
- [Full API reference](../api-reference.md#41-response) — every exported type in `/response`
