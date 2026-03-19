# @xlr8-nest/core

NestJS utility library with DDD, CQRS, TypeORM extensions, OpenAPI decorators, and Zod validation.

## Installation

```bash
npm install @xlr8-nest/core
```

## Modules

This package provides multiple modules that can be imported individually:

### DDD & CQRS (`@xlr8-nest/core/ddd`)

Domain-Driven Design and CQRS implementation for NestJS.

```typescript
import {
  AggregateRoot,
  Entity,
  ValueObject,
  DomainEvent,
  CommandBus,
  QueryBus,
  DddModule
} from '@xlr8-nest/core/ddd';
```

**Features:**
- `AggregateRoot` - Base class with domain event support
- `Entity` - Base entity class with identity management
- `ValueObject` - Abstract value object base class
- `CommandBus` / `QueryBus` - CQRS buses with automatic handler discovery
- `DomainEventBus` - Event bus with Saga support
- Decorators: `@Event()`, `@EventHandler()`, `@CommandHandler()`, `@QueryHandler()`, `@Saga()`

### Database (`@xlr8-nest/core/database`)

TypeORM extension module with Unit of Work pattern.

```typescript
import {
  DatabaseExtensionModule,
  TypeOrmClient,
  MigrationService,
  SeederService
} from '@xlr8-nest/core/database';
```

**Features:**
- Unit of Work pattern with AsyncLocalStorage
- Migration & Seeder services
- CLI commands for migrations and seeders
- Support for PostgreSQL, MySQL, MariaDB, SQLite, MSSQL

### Errors (`@xlr8-nest/core/errors`)

Standardized error classes.

```typescript
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalServerError
} from '@xlr8-nest/core/errors';
```

### OpenAPI (`@xlr8-nest/core/openapi`)

Swagger documentation decorators.

```typescript
import {
  ApiCreate,
  ApiGetOne,
  ApiGetMany,
  ApiGetPaginated,
  ApiUpdate,
  ApiDelete,
  ApiError
} from '@xlr8-nest/core/openapi';
```

**Features:**
- Pre-configured endpoint decorators with wrapped response format
- Error response decorators
- Pagination support

### Types (`@xlr8-nest/core/types`)

Shared TypeScript types.

```typescript
import {
  ApiResponse,
  SuccessApiResponse,
  ErrorApiResponse,
  UserIdentity
} from '@xlr8-nest/core/types';
```

### Validator (`@xlr8-nest/core/validator`)

Zod validation integration.

```typescript
import { ZodValidationPipe, Validate } from '@xlr8-nest/core/validator';
```

## Peer Dependencies

This package requires the following peer dependencies based on which modules you use:

| Module | Required Peer Dependencies |
|--------|---------------------------|
| ddd | `@nestjs/common`, `@nestjs/core`, `@nestjs/event-emitter`, `rxjs` |
| database | `@nestjs/common`, `@nestjs/core`, `@nestjs/typeorm`, `typeorm` |
| openapi | `@nestjs/common`, `@nestjs/swagger` |
| validator | `@nestjs/common`, `zod` |
| errors | `@nestjs/common` |
| types | None |

## License

MIT
