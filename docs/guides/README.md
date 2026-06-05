# Developer Guides — @xlr8-nest/core

Quick-start guides for each module. Start here if you are new to the library.

## Module Guides

| Module | Import | Purpose |
|---|---|---|
| [Errors](./errors.md) | `@xlr8-nest/core/errors` | Framework-agnostic error classes + domain error catalog pattern |
| [Response](./response.md) | `@xlr8-nest/core/response` | Success/error response builders + GlobalExceptionFilter |
| [Validator](./validator.md) | `@xlr8-nest/core/validator` | Zod validation with NestJS pipes |
| [OpenAPI](./openapi.md) | `@xlr8-nest/core/openapi` | Swagger decorators for the standard response envelope |
| [Authorization](./authz.md) | `@xlr8-nest/core/authz` | RBAC, permissions, policies, resource-based access control |
| [DDD / CQRS](./ddd.md) | `@xlr8-nest/core/ddd` | Aggregates, domain events, CommandBus, QueryBus, EventBus |
| [Database](./database.md) | `@xlr8-nest/core/database` | TypeORM Unit of Work, migrations, seeders |
| [Messaging](./messaging.md) | `@xlr8-nest/core/messaging` | Transactional outbox, integration events, background worker |

## How to use these guides

- Each guide is standalone — read only the module you need.
- The guides focus on "how do I do X" rather than exhaustive API listings.
- For complete type signatures see [API Reference](../api-reference.md).
- For architecture decisions and internal structure see [Architecture Overview](../architecture/overview.md).

## Typical first steps

New to the library? Read in this order:

1. [Errors](./errors.md) — every project uses these; understand the catalog pattern first.
2. [Response](./response.md) — wire GlobalExceptionFilter before writing any controllers.
3. [Validator](./validator.md) — replace class-validator with Zod schemas.
4. [Authorization](./authz.md) — add @RequireRoles / @Public() to your routes.
5. [Database](./database.md) — use IUnitOfWork for transactional writes.
6. [DDD / CQRS](./ddd.md) — only if your service has complex domain logic.
7. [Messaging](./messaging.md) — only if you need reliable cross-service events.
