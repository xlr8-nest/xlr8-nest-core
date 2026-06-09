# Internals: Response & Error Handling (`lib/response` + `lib/errors`)

How the exception normalizer works, how `BaseError` is detected reliably across module
boundaries, and how information disclosure is prevented.

---

## Table of Contents

- [File map](#file-map)
- [1. `BaseError` — why `instanceof` is not enough](#1-baseerror--why-instanceof-is-not-enough)
- [2. Error subclasses — fixed-status pattern](#2-error-subclasses--fixed-status-pattern)
- [3. `normalizeUnknownException` — chain of responsibility](#3-normalizeunknownexception--chain-of-responsibility)
  - [Why `BaseError` is checked before `HttpException`](#why-baseerror-is-checked-before-httpexception)
  - [`normalizeHttpException` — reading NestJS error shapes](#normalizehttpexception--reading-nestjs-error-shapes)
- [4. Information disclosure prevention](#4-information-disclosure-prevention)
- [5. `GlobalExceptionFilter` — wiring the normalizer to HTTP](#5-globalexceptionfilter--wiring-the-normalizer-to-http)
- [6. `buildSuccessResponse` and lookup tables](#6-buildsuccessresponse-and-lookup-tables)
- [7. Extending the normalizer via `customErrorFactory`](#7-extending-the-normalizer-via-customerrorfactory)
- [8. `isErrorDetails` — type guard for field-level errors](#8-iserrordetails--type-guard-for-field-level-errors)

---

## File map

```
lib/errors/
├── base-error.ts              # BaseError + BASE_ERROR_BRAND symbol
├── bad-request.error.ts       # BadRequestError (400)
├── unauthorized.error.ts      # UnauthorizedError (401)
├── forbidden.error.ts         # ForbiddenError (403)
├── not-found.error.ts         # NotFoundError (404)
├── conflict.error.ts          # ConflictError (409)
└── internal-server.error.ts   # InternalServerError (500)

lib/response/
├── response.constants.ts      # SUCCESS_CODE_MAP, SUCCESS_MESSAGE_MAP, ERROR_DEFAULTS
├── response.guards.ts         # isBaseErrorLike, isErrorDetails, getMessageFromUnknown, isRecord
├── normalizers/
│   └── exception.normalizer.ts  # normalizeUnknownException() — chain of responsibility
├── builders/
│   ├── success-response.builder.ts  # buildSuccessResponse()
│   └── error-response.builder.ts    # buildErrorResponse()
├── common/
│   ├── error-response-body.ts  # buildErrorBody() — internal serializer
│   └── error.guards.ts         # isResponseBodyRecord, getErrorsFromUnknown
├── filters/
│   └── global-exception.filter.ts  # GlobalExceptionFilter
└── types/
    ├── options.type.ts         # NormalizeExceptionOptions, BuildSuccessResponseOptions, ...
    └── exception.type.ts       # NormalizedException
```

---

## 1. `BaseError` — why `instanceof` is not enough

When `BaseError` is used across module boundaries — different versions of the library, different
copies of the module loaded into the same process — `instanceof BaseError` can return `false` even
when the object IS a `BaseError`. This is the "cross-realm" problem.

**Solution: `BASE_ERROR_BRAND` symbol**

```typescript
export const BASE_ERROR_BRAND = Symbol('xlr8-nest/BaseError');

export class BaseError extends Error {
  constructor(statusCode, error, errors?) {
    super(error.message);
    this.name = new.target.name;
    this.code = error.code;
    this.statusCode = statusCode;
    this.errors = errors;
    Object.setPrototypeOf(this, new.target.prototype);
    Object.defineProperty(this, BASE_ERROR_BRAND, {
      value: true,
      enumerable: false,
      writable: false,
    });
  }
}
```

The brand is:
- `enumerable: false` — does not show up in `JSON.stringify` or `Object.keys`.
- `writable: false` — cannot be overwritten to fake the brand.
- A unique `Symbol` — cannot be accidentally replicated by a plain object.

**`isBaseErrorLike(value)`:**

```typescript
export const isBaseErrorLike = (value: unknown): value is BaseError => {
  return (
    value instanceof Error &&          // must be an actual Error (not a POJO)
    typeof (value as BaseError).code === 'string' &&
    typeof (value as BaseError).statusCode === 'number' &&
    (value as Record<symbol, unknown>)[BASE_ERROR_BRAND] === true
  );
};
```

Requiring `instanceof Error` prevents plain objects with `code` and `statusCode` from being
treated as `BaseError` (POJO mis-classification). The brand check then confirms it was
genuinely constructed by a `BaseError` constructor.

**`Object.setPrototypeOf(this, new.target.prototype)`:**
Required for TypeScript classes that extend built-in classes (`Error`) when compiled to ES5.
Without it, `instanceof` checks on subclasses fail because the prototype chain is broken during
compilation. ES2021+ (the library target) does not need this — but it is kept for safety.

---

## 2. Error subclasses — fixed-status pattern

Each subclass hard-codes a status code and provides a default from `CommonErrors`:

```typescript
export class NotFoundError extends BaseError {
  constructor(error?: ErrorType, errors?: ErrorDetails) {
    super(
      StatusCode.NOT_FOUND,
      error ?? CommonErrors.NotFoundError,
      errors,
    );
  }
}
```

Calling `new NotFoundError()` with no arguments produces:
```json
{ "code": "NOT_FOUND", "message": "Resource not found", "statusCode": 404 }
```

Calling `new NotFoundError(USER_ERRORS.USER_NOT_FOUND)` produces:
```json
{ "code": "USER-NOT_FOUND", "message": "User not found", "statusCode": 404 }
```

The status code is ALWAYS fixed — you cannot throw a `NotFoundError` that resolves to 400.
This eliminates a whole class of "wrong status code" bugs.

---

## 3. `normalizeUnknownException` — chain of responsibility

This is the central piece. It converts any thrown value into a `NormalizedException`:

```typescript
interface NormalizedException<TErrors, TCode> {
  statusCode: number;
  error: ErrorType<TCode>;
  errors?: TErrors;
}
```

The chain:

```
normalizeUnknownException(exception, options)
    │
    ├── 1. customErrorFactory(exception)?
    │       if options.customErrorFactory exists and returns a value → use it
    │       (Strategy pattern: caller has full control for known exceptions)
    │
    ├── 2. instanceof BaseError || isBaseErrorLike(exception)?
    │       → { statusCode: exception.statusCode, error: { code, message }, errors }
    │       (handles library errors and cross-realm BaseError instances)
    │
    ├── 3. instanceof HttpException?
    │       → normalizeHttpException(exception, options)
    │          reads exception.getStatus() and exception.getResponse()
    │          handles: string response, object response, fallback
    │
    ├── 4. instanceof Error?
    │       → { statusCode: fallback, error: fallbackError }
    │       NOTE: exception.message is NOT forwarded (information disclosure prevention)
    │
    └── 5. (unknown) anything else
            → { statusCode: fallback, error: fallbackError }
```

### Why `BaseError` is checked before `HttpException`

`HttpException` is a NestJS class that extends `Error`. A `BadRequestError` also extends `Error`
but NOT `HttpException`. However, if someone ever creates an error that extends both (unusual but
possible), we want the `BaseError` semantics (stable code, typed errors). The order is deliberate.

### `normalizeHttpException` — reading NestJS error shapes

NestJS `HttpException.getResponse()` can return a `string` or an `object`. Objects have varying
shapes depending on which NestJS built-in threw:

```typescript
// Thrown by NestJS pipes (ValidationPipe)
{
  statusCode: 400,
  message: ['email must be an email', 'name must not be empty'],
  error: 'Bad Request',
}

// Thrown by custom HttpException
{
  statusCode: 403,
  code: 'CUSTOM_CODE',
  message: 'Custom message',
}
```

`normalizeHttpException` reads both formats:

```typescript
if (isResponseBodyRecord(response)) {
  return {
    statusCode: response.statusCode ?? exception.getStatus(),
    error: {
      code: response.code ?? fallbackCode,
      message: getMessageFromUnknown(response.message ?? response.error, fallbackMessage),
    },
    errors: getErrorsFromUnknown(response.errors) ?? fallbackErrors,
  };
}
```

`getMessageFromUnknown` handles the case where `message` is an array (NestJS ValidationPipe):
it joins them with `'; '`.

---

## 4. Information disclosure prevention

Plain `Error` instances (step 4 of the chain) do **NOT** forward `exception.message` to the client:

```typescript
if (exception instanceof Error) {
  return {
    statusCode: fallbackStatusCode,
    error: { code: fallbackError.code, message: fallbackError.message },
    errors: options.fallbackErrors,
  };
}
```

**Why?**
An unhandled `Error` may carry:
- SQL error messages with table/column names.
- File system paths.
- Internal service names.
- Stack traces.

These are logged internally (by `GlobalExceptionFilter`), but never sent to the client. The
client always receives the safe `fallbackError.message` (default: `'Internal server error'`).

**`BaseError` and `HttpException` are forwarded** because they are intentional API errors —
their messages were explicitly crafted to be safe for clients.

---

## 5. `GlobalExceptionFilter` — wiring the normalizer to HTTP

```typescript
@Catch()  // catches ALL exceptions
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Optional() private readonly options: NormalizeExceptionOptions = {},
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));

    const normalized = normalizeUnknownException(exception, this.options);
    const statusCode = normalized.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(statusCode).json({
      success: false,
      code: normalized.error.code,
      message: normalized.error.message,
      ...(normalized.errors !== undefined ? { errors: normalized.errors } : {}),
    });
  }
}
```

**Key points:**
- `@Catch()` with no arguments catches everything — `BaseError`, `HttpException`, plain `Error`, strings, null.
- The full stack trace is logged internally before the response is sent.
- `errors` is only included in the JSON if it is not `undefined` — avoids `"errors": null` in responses.
- The filter is `@Injectable()` so it participates in NestJS DI — you can inject services into it.

---

## 6. `buildSuccessResponse` and lookup tables

```typescript
const SUCCESS_CODE_MAP: Record<number, string> = {
  [StatusCode.SUCCESS]:    'OK',
  [StatusCode.CREATED]:    'CREATED',
  [StatusCode.ACCEPTED]:   'ACCEPTED',
  [StatusCode.NO_CONTENT]: 'NO_CONTENT',
  // ...
};

const SUCCESS_MESSAGE_MAP: Record<number, string> = {
  [StatusCode.SUCCESS]:    'Request successful',
  [StatusCode.CREATED]:    'Resource created successfully',
  // ...
};
```

`buildSuccessResponse(data, options)`:
1. Uses `options.statusCode ?? StatusCode.SUCCESS`.
2. Looks up `code` from `SUCCESS_CODE_MAP` (overridable via `options.code`).
3. Looks up `message` from `SUCCESS_MESSAGE_MAP` (overridable via `options.message`).
4. Includes `statusCode` in the envelope only if `options.includeStatusCode === true`.

```typescript
const response: SuccessResponse<TData> = {
  success: true,
  code: options.code ?? getSuccessCode(statusCode),
  message: options.message ?? getSuccessMessage(statusCode),
  data,
};
return maybeAttachStatusCode(response, statusCode, options.includeStatusCode);
```

---

## 7. Extending the normalizer via `customErrorFactory`

The `customErrorFactory` option (a Strategy) lets you intercept specific exception types before
the built-in chain runs:

```typescript
app.useGlobalFilters(
  new GlobalExceptionFilter({
    customErrorFactory: (exception) => {
      if (exception instanceof QueryFailedError) {
        // TypeORM constraint violation
        if ((exception as QueryFailedError).code === '23505') {
          return {
            statusCode: 409,
            error: { code: 'CONFLICT', message: 'Resource already exists' },
          };
        }
      }
      return null; // fall through to built-in chain
    },
  }),
);
```

Returning `null` or `undefined` falls through to the next step in the chain. Returning a
`NormalizedException` object short-circuits the rest.

---

## 8. `isErrorDetails` — type guard for field-level errors

```typescript
export const isErrorDetails = (value: unknown): value is ErrorDetails => {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    v => isRecord(v) && typeof v['code'] === 'string' && typeof v['message'] === 'string',
  );
};
```

`isRecord` excludes arrays (`Array.isArray` check is included). This guard is used in
`getErrorsFromUnknown` to detect whether the `errors` field in an `HttpException` response
object is a proper `ErrorDetails` map (not a validation array or a random object).
