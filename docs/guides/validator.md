# Validator (`@xlr8-nest/core/validator`)

Declarative Zod-based request validation for NestJS controllers — validates `@Body()` and `@Query()` automatically and throws a structured error that `GlobalExceptionFilter` handles without any glue code.

**When to use:** any route that accepts user input. Replace every `class-validator` DTO + `ValidationPipe` combination with a Zod schema and `@Validate`.

---

## Table of Contents

- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
  - [`@Validate(schema)`](#validateschema)
  - [`ZodValidationPipe`](#zodvalidationpipe)
  - [`validateInput(value, schema)` — outside pipes](#validateinputvalue-schema--outside-pipes)
- [Error shape](#error-shape)
- [Supported schema types](#supported-schema-types)
- [Patterns & recipes](#patterns--recipes)
  - [Route with body and query both validated](#route-with-body-and-query-both-validated-separate-schemas)
  - [Schema with cross-field refinement](#schema-with-cross-field-refinement)
  - [Reusable schema fragments](#reusable-schema-fragments)
  - [Validation in a command handler](#validation-in-a-command-handler)
  - [Validating partial updates (PATCH)](#validating-partial-updates-patch)
- [Important rules / gotchas](#important-rules--gotchas)
- [See also](#see-also)

---

## Quick start

```bash
npm install zod
```

```typescript
// users/users.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { z } from 'zod';
import { Validate } from '@xlr8-nest/core/validator';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  age: z.number().int().min(0).optional(),
});

type CreateUserInput = z.infer<typeof CreateUserSchema>;

@Controller('users')
export class UsersController {
  @Post()
  @Validate(CreateUserSchema)
  create(@Body() input: CreateUserInput) {
    // `input` is fully typed and guaranteed valid here
    return { id: '1', ...input };
  }
}
```

That is the entire setup. No global pipe registration, no DTO class, no `@IsEmail()` decorators.

---

## Core concepts

### `@Validate(schema)`

`@Validate` is a method (or class) decorator that installs `ZodValidationPipe` for a single route.

```typescript
import { Validate } from '@xlr8-nest/core/validator';
```

Internally it is:

```typescript
const Validate = <T>(schema: ZodType<T>) =>
  UsePipes(new ZodValidationPipe<T>(schema));
```

**What it validates:** every argument whose NestJS metadata type is `body` or `query`. Path params (`@Param`), request objects, and other types pass through untouched.

**Type inference:** derive the TypeScript type directly from the schema with `z.infer<typeof Schema>`. You never maintain a separate interface.

```typescript
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

type PaginationQuery = z.infer<typeof QuerySchema>;

@Get()
@Validate(QuerySchema)
list(@Query() query: PaginationQuery) {
  // query.page and query.limit are numbers, not strings
}
```

### `ZodValidationPipe`

The pipe that `@Validate` wraps. Use it directly when body and query need separate schemas, or when you need per-parameter control.

```typescript
import { ZodValidationPipe } from '@xlr8-nest/core/validator';
```

**Selective per-parameter use:**

```typescript
import { Controller, Get, Post, Body, Query, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '@xlr8-nest/core/validator';

const CreateProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  tags: z.array(z.string()).optional(),
});

const ListProductQuerySchema = z.object({
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

@Controller('products')
export class ProductsController {
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateProductSchema))
    body: z.infer<typeof CreateProductSchema>,
  ) {
    return body;
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(ListProductQuerySchema))
    query: z.infer<typeof ListProductQuerySchema>,
  ) {
    return query;
  }
}
```

### `validateInput(value, schema)` — outside pipes

Use `validateInput` from `@xlr8-nest/core/utils` inside command handlers, domain services, or any code that runs outside the NestJS pipe lifecycle.

```typescript
import { z } from 'zod';
import { validateInput } from '@xlr8-nest/core/utils';

const TransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.number().positive(),
});

@CommandHandler(TransferFundsCommand)
export class TransferFundsHandler {
  execute(command: TransferFundsCommand) {
    // Throws BadRequestError on failure — same shape as pipe errors
    const input = validateInput(command.payload, TransferSchema);
    // proceed with validated input
  }
}
```

`validateInput` throws the same `BadRequestError` with `code: 'VALIDATION_ERROR'` that the pipe does, so `GlobalExceptionFilter` handles it identically.

---

## Error shape

On validation failure the pipe (or `validateInput`) throws `BadRequestError` with this shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed"
  },
  "errors": {
    "email": {
      "code": "invalid_field",
      "message": "Invalid email"
    },
    "name": {
      "code": "invalid_field",
      "message": "String must contain at least 2 character(s)"
    },
    "items.0.quantity": {
      "code": "invalid_field",
      "message": "Number must be greater than 0"
    }
  }
}
```

Key details:

- Field paths use dot notation. Array indices become part of the path: `items.0.quantity`.
- Root-level issues (e.g. wrong type passed instead of an object) appear under the key `_root`.
- Multiple Zod issues on the same path are joined with `; ` into a single message string.
- `GlobalExceptionFilter` serializes this automatically — no extra mapping needed.

---

## Supported schema types

`@Validate` and `ZodValidationPipe` accept any `ZodType<T>`, not just `ZodObject`. All Zod constructors work:

```typescript
// Object (most common)
const BodySchema = z.object({ name: z.string() });

// Array body
const BatchCreateSchema = z.array(z.object({ name: z.string() }));

// Union / discriminated union
const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('email'), email: z.string().email() }),
  z.object({ type: z.literal('sms'), phone: z.string() }),
]);

// Intersection
const AuditedSchema = z.object({ name: z.string() }).merge(
  z.object({ createdBy: z.string().uuid() }),
);

// Effects (transform / refine / preprocess)
const NormalizedSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  tags: z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',') : v),
    z.array(z.string()),
  ),
});

// Partial
const PatchUserSchema = z
  .object({ name: z.string(), email: z.string().email() })
  .partial();
```

All of the above work identically as the `schema` argument.

---

## Patterns & recipes

### Route with body and query both validated (separate schemas)

Use `ZodValidationPipe` per-parameter instead of `@Validate` when body and query require different schemas:

```typescript
import { Controller, Post, Body, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '@xlr8-nest/core/validator';

const CreateOrderBodySchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
    }),
  ),
});

const CreateOrderQuerySchema = z.object({
  dryRun: z.coerce.boolean().default(false),
});

@Controller('orders')
export class OrdersController {
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateOrderBodySchema))
    body: z.infer<typeof CreateOrderBodySchema>,
    @Query(new ZodValidationPipe(CreateOrderQuerySchema))
    query: z.infer<typeof CreateOrderQuerySchema>,
  ) {
    if (query.dryRun) return { preview: true };
    // persist body ...
  }
}
```

### Schema with cross-field refinement

```typescript
const DateRangeSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((v) => v.from <= v.to, {
    message: '`from` must be before or equal to `to`',
    path: ['from'],
  });

@Get('reports')
@Validate(DateRangeSchema)
report(@Query() query: z.infer<typeof DateRangeSchema>) { ... }
```

### Reusable schema fragments

```typescript
// shared/schemas/pagination.schema.ts
import { z } from 'zod';

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof PaginationSchema>;
```

```typescript
// products/products.controller.ts
import { PaginationSchema } from '../shared/schemas/pagination.schema';

const ListProductsQuerySchema = PaginationSchema.extend({
  category: z.string().optional(),
});
```

### Validation in a command handler

```typescript
// orders/commands/create-order.handler.ts
import { z } from 'zod';
import { validateInput } from '@xlr8-nest/core/utils';
import { BadRequestError } from '@xlr8-nest/core/errors';

const CreateOrderSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), qty: z.number().int().positive() })).min(1),
});

@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  async execute(command: CreateOrderCommand) {
    const input = validateInput(command.payload, CreateOrderSchema);
    // input is typed and valid; proceed with domain logic
  }
}
```

### Validating partial updates (PATCH)

```typescript
const UserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  bio: z.string().max(500),
});

// All fields become optional; empty object ({}) is valid
const PatchUserSchema = UserSchema.partial();

@Patch(':id')
@Validate(PatchUserSchema)
update(
  @Param('id') id: string,
  @Body() updates: z.infer<typeof PatchUserSchema>,
) { ... }
```

---

## Important rules / gotchas

### `@Validate` applies one schema to BOTH `@Body()` AND `@Query()`

This is the most common footgun. `@Validate(MySchema)` installs a single pipe that runs `MySchema` against every `body` and `query` argument independently. If the route has both `@Body()` and `@Query()`, the same schema is run against both.

**Wrong — body and query will both be validated against `CreateOrderBodySchema`:**

```typescript
@Post()
@Validate(CreateOrderBodySchema)     // runs against body AND query
create(
  @Body() body: CreateOrderBody,
  @Query() query: { dryRun?: string }, // this also gets validated against CreateOrderBodySchema
) { ... }
```

**Correct — use per-parameter pipes when body and query differ:**

```typescript
@Post()
create(
  @Body(new ZodValidationPipe(CreateOrderBodySchema)) body: CreateOrderBody,
  @Query(new ZodValidationPipe(CreateOrderQuerySchema)) query: CreateOrderQuery,
) { ... }
```

### Query params arrive as strings — use `z.coerce.*`

All query-string values are plain strings when they reach the pipe. Bare `z.number()` and `z.boolean()` will always fail on query params.

```typescript
// Wrong — always fails for query params
const BadQuerySchema = z.object({ page: z.number() });

// Correct
const GoodQuerySchema = z.object({ page: z.coerce.number().int().min(1) });
```

### Do not use class-validator alongside `@Validate`

`@Validate` does not interact with NestJS's built-in `ValidationPipe`. Do not register a global `ValidationPipe` and also use `@Validate` — the two pipelines run independently and can produce confusing double errors. Pick one. With this library, use Zod schemas.

### The schema argument must have `safeParse`

`ZodValidationPipe` performs a runtime check in its constructor:

```typescript
if (typeof schema?.safeParse !== 'function') {
  throw new Error('ZodValidationPipe requires a valid Zod schema...');
}
```

Passing `null`, a plain object, or a class-validator class throws at application startup. This is intentional — you get a fast failure rather than a runtime crash on the first request.

### `@Validate` on a class validates ALL routes with the same schema

Applying `@Validate` at the controller class level installs the pipe for every method. Only do this when a single schema genuinely applies to all routes (uncommon).

### Transformed values replace the original

Zod `transform` and `preprocess` run inside the pipe. The value passed to your handler is the **output** of the transform, not the raw input.

```typescript
const Schema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
});

@Post()
@Validate(Schema)
create(@Body() body: z.infer<typeof Schema>) {
  // body.email is already lowercased
}
```

---

## See also

- [Authorization guide](../authz.md) — protecting routes after validation
- [API Reference — /validator](../api-reference.md#42-validator) — complete type signatures
- [API Reference — /utils](../api-reference.md#33-utils) — `validateInput` reference
- [API Reference — /errors](../api-reference.md#35-errors) — `BadRequestError` and the error hierarchy
