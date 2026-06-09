# Types (`@xlr8-nest/core/types`)

Shared, runtime-free TypeScript contracts: the standard response envelope, the error contract, and the user identity boundary type. Import these when you need only the shapes — no runtime code is shipped.

**When to use:** annotate function return types, generic parameters, or incoming payload shapes that must conform to the library's standard envelope. Do **not** import them for runtime logic; that lives in `@xlr8-nest/core/errors` and `@xlr8-nest/core/response`.

---

## Table of Contents

- [Installation / import](#installation--import)
- [Response envelope types](#response-envelope-types)
  - [`ResponseMetadata<TCode>`](#responsemetadatatcode)
  - [`SuccessResponse<T, TCode>`](#successresponset-tcode)
  - [`ErrorResponse<TErrors, TCode>`](#errorresponsetErrors-tcode)
  - [`Response<TData, TErrors, TCode>`](#responsetdata-terrors-tcode)
  - [Short-form aliases](#short-form-aliases)
- [Error contract types](#error-contract-types)
  - [`ErrorType<TCode>`](#errortypetcode)
  - [`DetailError<TCode>`](#detailerrortcode)
  - [`ErrorDetails<TField, TCode>`](#errordetailstfield-tcode)
- [Identity types](#identity-types)
  - [`UserIdentity`](#useridentity)
- [Patterns](#patterns)
  - [Typing controller return values](#typing-controller-return-values)
  - [Using `ErrorType` for error catalogs](#using-errortype-for-error-catalogs)
- [See also](#see-also)

---

## Installation / import

```bash
# This module ships with @xlr8-nest/core — no separate install needed.
```

```typescript
import type {
  SuccessResponse,
  ErrorResponse,
  Response,
  ErrorType,
  ErrorDetails,
  DetailError,
  UserIdentity,
} from '@xlr8-nest/core/types';
```

---

## Response envelope types

### `ResponseMetadata<TCode>`

Base shape shared by every response variant. All other response types extend it.

```typescript
interface ResponseMetadata<TCode extends string = string> {
  success: boolean;
  code: TCode;
  message: string;
  statusCode?: number;   // present only when includeStatusCode is true
}
```

| Field | Always present | Purpose |
|---|---|---|
| `success` | yes | Discriminant for the union (`true` = OK, `false` = error) |
| `code` | yes | Machine-readable outcome code (e.g. `'OK'`, `'USER_NOT_FOUND'`) |
| `message` | yes | Human-readable description for the client |
| `statusCode` | optional | Included when callers opt in via `includeStatusCode: true` |

---

### `SuccessResponse<T, TCode>`

A successful API response carrying typed data.

```typescript
interface SuccessResponse<T, TCode extends string = string>
  extends ResponseMetadata<TCode> {
  success: true;
  data: T;
}
```

**Generic parameters:**

| Parameter | Default | Description |
|---|---|---|
| `T` | — | The data payload type |
| `TCode` | `string` | Narrows the `code` field to a specific string union |

**Example:**

```typescript
import type { SuccessResponse } from '@xlr8-nest/core/types';

type CreateUserResponse = SuccessResponse<{ id: string; email: string }, 'CREATED'>;
// { success: true; code: 'CREATED'; message: string; data: { id: string; email: string } }
```

---

### `ErrorResponse<TErrors, TCode>`

An error API response, optionally carrying field-level validation errors.

```typescript
interface ErrorResponse<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = string,
> extends ResponseMetadata<TCode> {
  success: false;
  errors?: TErrors;
}
```

**Generic parameters:**

| Parameter | Default | Description |
|---|---|---|
| `TErrors` | `ErrorDetails \| undefined` | Field-level errors map; `undefined` for errors without per-field detail |
| `TCode` | `string` | Narrows `code` to a specific union |

**Example:**

```typescript
import type { ErrorResponse, ErrorDetails } from '@xlr8-nest/core/types';

type ValidationErrorResponse = ErrorResponse<
  ErrorDetails<'email' | 'name'>,
  'VALIDATION_ERROR'
>;
// {
//   success: false;
//   code: 'VALIDATION_ERROR';
//   message: string;
//   errors?: { email?: { code: string; message: string }; name?: ... };
// }
```

---

### `Response<TData, TErrors, TCode>`

The discriminated union of `SuccessResponse` and `ErrorResponse`. Use this as the return type of full response builders or controller methods that may return either shape.

```typescript
type Response<
  TData,
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = string,
> = SuccessResponse<TData, TCode> | ErrorResponse<TErrors, TCode>;
```

**Narrowing with the discriminant:**

```typescript
import type { Response } from '@xlr8-nest/core/types';

function handle(result: Response<User>) {
  if (result.success) {
    console.log(result.data); // TypeScript knows data exists here
  } else {
    console.log(result.errors); // TypeScript knows errors may exist here
  }
}
```

---

### Short-form aliases

The following aliases exist for convenience. **Prefer the explicit names** (`SuccessResponse`, `ErrorResponse`, `Response`) in new code; the `Api*` names are deprecated.

| Alias | Canonical name | Status |
|---|---|---|
| `ApiSuccess<TData, TCode>` | `SuccessResponse<TData, TCode>` | Current |
| `ApiFailure<TErrors, TCode>` | `ErrorResponse<TErrors, TCode>` | Current |
| `ApiResult<TData, TErrors, TCode>` | `Response<TData, TErrors, TCode>` | Current |
| `SuccessApiResponse` | `SuccessResponse` | `@deprecated` |
| `ErrorApiResponse` | `ErrorResponse` | `@deprecated` |
| `ApiResponse` | `Response` | `@deprecated` |
| `ApiResponseBase` | `ResponseMetadata` | `@deprecated` |

---

## Error contract types

### `ErrorType<TCode>`

The core contract for any error definition in the library — a stable code/message pair.

```typescript
interface ErrorType<TCode extends string = string> {
  code: TCode;
  message: string;
}
```

Used by:
- `BaseError` constructor and all HTTP error subclasses
- `CommonErrors` constant table
- Error catalog objects in application code
- OpenAPI `@ApiBadRequest`, `@ApiNotFound`, etc.

**Example — defining an error catalog:**

```typescript
import type { ErrorType } from '@xlr8-nest/core/types';

export const USER_ERRORS = {
  NOT_FOUND:   { code: 'USER-NOT_FOUND',   message: 'User not found' },
  EMAIL_TAKEN: { code: 'USER-EMAIL_TAKEN', message: 'Email already in use' },
} as const satisfies Record<string, ErrorType>;
```

---

### `DetailError<TCode>`

Type alias for `ErrorType<TCode>`. Identical shape; the different name clarifies the usage context: a field-level detail entry inside an `errors` map.

```typescript
type DetailError<TCode extends string = string> = ErrorType<TCode>;
```

---

### `ErrorDetails<TField, TCode>`

A field-keyed map of `DetailError` entries used for validation / domain errors with per-field specificity.

```typescript
type ErrorDetails<
  TField extends string = string,
  TCode extends string = string,
> = Record<TField, DetailError<TCode>>;
```

**Example:**

```typescript
import type { ErrorDetails } from '@xlr8-nest/core/types';

type LoginErrors = ErrorDetails<'email' | 'password'>;
// {
//   email:    { code: string; message: string };
//   password: { code: string; message: string };
// }
```

How this appears in a JSON response body:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "errors": {
    "email":    { "code": "invalid_field", "message": "Invalid email address" },
    "password": { "code": "invalid_field", "message": "Too short; minimum 8 characters" }
  }
}
```

---

## Identity types

### `UserIdentity`

Boundary DTO for authenticated users. It is the shape that `RequestUserResolver` (in `@xlr8-nest/core/authz`) expects on `request.user` and normalizes into `AuthorizationPrincipal`.

```typescript
interface UserIdentity {
  id: string;
  username: string;
  roles: string[];       // array of role names
  permissions: string[]; // array of permission strings (e.g. 'user:read')
}
```

**Field notes:**

| Field | Notes |
|---|---|
| `id` | Unique identifier; used as the principal's `id` in authorization checks |
| `username` | Human-readable login name; not used by the authz module directly |
| `roles` | Array of role names matched by `@RequireRoles` |
| `permissions` | Array of permission strings matched by `@RequirePermissions` (supports wildcards, e.g. `user:*`) |

**Extending `UserIdentity`:**

You can extend the interface in your application if you need additional fields on the JWT payload. The authz module only reads `id`, `roles`, and `permissions`.

```typescript
// src/auth/types/app-user.type.ts
import type { UserIdentity } from '@xlr8-nest/core/types';

export interface AppUser extends UserIdentity {
  tenantId: string;
  email: string;
}
```

Set the extended type on `request.user` in your Passport strategy and the authz module will pass the extra fields through transparently.

---

## Patterns

### Typing controller return values

```typescript
import type { SuccessResponse } from '@xlr8-nest/core/types';
import { buildSuccessResponse } from '@xlr8-nest/core/response';

interface UserDto { id: string; email: string }

@Get(':id')
async findOne(@Param('id') id: string): Promise<SuccessResponse<UserDto>> {
  const user = await this.usersService.findOne(id);
  return buildSuccessResponse(user);
}
```

### Typing repository or service results

Prefer returning plain domain objects from services and converting to the response envelope only at the controller layer. Reserve `Response<T>` for controller return types, not service method signatures.

### Using `ErrorType` for error catalogs

Every feature module should define a local error catalog typed with `ErrorType`. This ensures every error has a stable `code` (never bare strings scattered around the codebase).

```typescript
// src/orders/errors/order.errors.ts
import type { ErrorType } from '@xlr8-nest/core/types';

export const ORDER_ERRORS = {
  NOT_FOUND:        { code: 'ORDER-NOT_FOUND',        message: 'Order not found' },
  ALREADY_SHIPPED:  { code: 'ORDER-ALREADY_SHIPPED',  message: 'Order has already shipped' },
  PAYMENT_REQUIRED: { code: 'ORDER-PAYMENT_REQUIRED', message: 'Payment is required before shipping' },
} as const satisfies Record<string, ErrorType>;
```

---

## See also

- [Errors guide](./errors.md) — `BaseError` and HTTP error subclasses that use `ErrorType` at construction
- [Response guide](./response.md) — `buildSuccessResponse` / `buildErrorResponse` that produce `SuccessResponse` / `ErrorResponse`
- [Authorization guide](./authz.md) — `AuthorizationPrincipal` built from `UserIdentity`
- [Validator guide](./validator.md) — `@Validate` that produces `ErrorDetails` on failure
