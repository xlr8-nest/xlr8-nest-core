# @xlr8-nest/core

> A comprehensive NestJS utility library with DDD, CQRS, TypeORM extensions, OpenAPI decorators, and Zod validation.

[![npm version](https://img.shields.io/npm/v/@xlr8-nest/core.svg)](https://www.npmjs.com/package/@xlr8-nest/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-9%20%7C%2010%20%7C%2011%20%7C%2012-red.svg)](https://nestjs.com/)

## ✨ Features

- 🏗️ **DDD & CQRS**: Complete Domain-Driven Design implementation with Command/Query buses
- 📦 **Unit of Work**: TypeORM extensions with UoW pattern using AsyncLocalStorage
- 🔄 **Event-Driven**: Domain events with Saga pattern support
- 📝 **OpenAPI**: Pre-configured Swagger decorators for standardized API documentation
- ✅ **Validation**: Seamless Zod integration with NestJS pipes
- 🗄️ **Database**: Migration & Seeder services with CLI commands
- 🎯 **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🔧 **Modular**: Tree-shakeable exports, import only what you need

## 📦 Installation

```bash
# npm
npm install @xlr8-nest/core

# yarn
yarn add @xlr8-nest/core

# pnpm
pnpm add @xlr8-nest/core
```

## 🔄 Version Compatibility

This library supports a wide range of NestJS and dependency versions for maximum flexibility:

| Package | Supported Versions |
|---------|-------------------|
| `@nestjs/common` | ^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0 \|\| ^12.0.0 |
| `@nestjs/core` | ^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0 \|\| ^12.0.0 |
| `@nestjs/swagger` | ^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0 \|\| ^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0 |
| `@nestjs/typeorm` | ^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0 \|\| ^12.0.0 |
| `@nestjs/event-emitter` | ^2.0.0 \|\| ^3.0.0 \|\| ^4.0.0 |
| `rxjs` | ^7.0.0 \|\| ^8.0.0 |
| `typeorm` | ^0.3.0 \|\| ^0.4.0 |
| `zod` | ^3.0.0 \|\| ^4.0.0 \|\| ^5.0.0 |
| `reflect-metadata` | ^0.1.13 \|\| ^0.2.0 \|\| ^0.3.0 |

✅ **Tested with latest versions**: NestJS 11, Swagger 11, Zod 4, Event Emitter 3

## 🚀 Quick Start

### 1. DDD & CQRS Module

```typescript
import { Module } from '@nestjs/common';
import { DddModule } from '@xlr8-nest/core/ddd';

@Module({
  imports: [
    DddModule.forRoot({
      events: { global: true },
      commandHandlers: [CreateUserHandler],
      queryHandlers: [GetUserHandler],
    }),
  ],
})
export class AppModule {}
```

### 2. Database Module with TypeORM

```typescript
import { DatabaseExtensionModule } from '@xlr8-nest/core/database';

@Module({
  imports: [
    DatabaseExtensionModule.register({
      connection: {
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'user',
        password: 'pass',
        database: 'mydb',
      },
      migration: {
        enabled: true,
        autoRun: false,
        migrationsPath: 'src/database/migrations',
      },
      seeder: {
        enabled: true,
        seedersPath: 'src/database/seeders',
      },
    }),
  ],
})
export class AppModule {}
```

### 3. OpenAPI Decorators

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiCreate, ApiGetPaginated } from '@xlr8-nest/core/openapi';
import { CreateUserDto, UserDto } from './dto';

@Controller('users')
export class UserController {
  @Post()
  @ApiCreate(UserDto, { summary: 'Create a new user' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get()
  @ApiGetPaginated(UserDto, { summary: 'Get paginated users' })
  async findAll() {
    return this.userService.findAll();
  }
}
```

### 4. Zod Validation

```typescript
import { Validate } from '@xlr8-nest/core/validator';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  age: z.number().min(18).optional(),
});

@Controller('users')
export class UserController {
  @Post()
  @Validate(createUserSchema)
  async create(@Body() dto: z.infer<typeof createUserSchema>) {
    return this.userService.create(dto);
  }
}
```

## 📚 Modules

This package provides multiple modules that can be imported individually:

### 🏗️ DDD & CQRS (`@xlr8-nest/core/ddd`)

Domain-Driven Design and CQRS implementation for NestJS.

```typescript
import {
  AggregateRoot,
  Entity,
  ValueObject,
  DomainEvent,
  CommandBus,
  QueryBus,
  DomainEventBus,
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

**Example:**

```typescript
// Define domain event
@Event()
export class UserCreatedEvent implements DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly occurredOn = new Date()
  ) {}
  get eventName() { return getEventName(this); }
}

// Create aggregate root
export class User extends AggregateRoot {
  constructor(
    id: string,
    private name: string,
    private email: string
  ) {
    super(id);
  }

  static create(name: string, email: string): User {
    const user = new User(uuid(), name, email);
    user.addDomainEvent(new UserCreatedEvent(user.id));
    return user;
  }
}

// Command handler
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand) {
    const user = User.create(command.name, command.email);
    await this.repository.save(user);
    return user;
  }
}

// Event handler
@Injectable()
export class UserEventHandlers {
  @EventHandler(UserCreatedEvent)
  async onUserCreated(event: UserCreatedEvent) {
    console.log('User created:', event.userId);
  }
}
```

### 🗄️ Database (`@xlr8-nest/core/database`)

TypeORM extension module with Unit of Work pattern.

```typescript
import {
  DatabaseExtensionModule,
  TypeOrmClient,
  UnitOfWork,
  MigrationService,
  SeederService,
  BaseSeeder,
  BaseFactory
} from '@xlr8-nest/core/database';
```

**Features:**
- Unit of Work pattern with AsyncLocalStorage
- Migration & Seeder services with CLI commands
- Base classes for seeders and factories
- Support for PostgreSQL, MySQL, MariaDB, SQLite, MSSQL
- Auto-run migrations and seeders
- Transaction isolation per request

**Example:**

```typescript
// Unit of Work usage
@Injectable()
export class UserService {
  constructor(@UnitOfWork() private readonly uow: IUnitOfWork) {}

  async createUser(dto: CreateUserDto) {
    const user = this.uow.getRepository(User).create(dto);
    await this.uow.getRepository(User).save(user);

    // Transaction is automatically managed
    await this.uow.commit();
    return user;
  }
}

// Create seeder
export class UserSeeder extends BaseSeeder {
  async run() {
    const users = [
      { name: 'John', email: 'john@example.com' },
      { name: 'Jane', email: 'jane@example.com' },
    ];

    await this.manager.save(User, users);
  }
}
```

### 🚨 Errors (`@xlr8-nest/core/errors`)

Standardized error classes that extend NestJS exceptions.

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

**Example:**

```typescript
@Injectable()
export class UserService {
  async findById(id: string) {
    const user = await this.repository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundError(`User with id ${id} not found`);
    }
    return user;
  }
}
```

### 📝 OpenAPI (`@xlr8-nest/core/openapi`)

Swagger documentation decorators with standardized response format.

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
- Automatic schema generation

**Example:**

```typescript
@Controller('users')
@ApiTags('users')
export class UserController {
  @Post()
  @ApiCreate(UserDto, {
    summary: 'Create a new user',
    description: 'Creates a new user with the provided data'
  })
  @ApiError([BadRequestError, ConflictError])
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get(':id')
  @ApiGetOne(UserDto, { summary: 'Get user by ID' })
  @ApiError([NotFoundError])
  async findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Get()
  @ApiGetPaginated(UserDto, { summary: 'Get paginated users' })
  async findAll(@Query() query: PaginationDto) {
    return this.userService.findAll(query);
  }
}
```

### 📐 Types (`@xlr8-nest/core/types`)

Shared TypeScript types and interfaces.

```typescript
import {
  ApiResponse,
  SuccessApiResponse,
  ErrorApiResponse,
  UserIdentity,
  PaginationMeta
} from '@xlr8-nest/core/types';
```

### ✅ Validator (`@xlr8-nest/core/validator`)

Zod validation integration with NestJS pipes.

```typescript
import { ZodValidationPipe, Validate } from '@xlr8-nest/core/validator';
```

**Example:**

```typescript
const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  age: z.number().min(0).max(150).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided'
});

@Patch(':id')
@Validate(updateUserSchema)
async update(
  @Param('id') id: string,
  @Body() dto: z.infer<typeof updateUserSchema>
) {
  return this.userService.update(id, dto);
}
```

## 📋 Peer Dependencies

This package requires the following peer dependencies based on which modules you use:

| Module | Required Dependencies | Optional |
|--------|----------------------|----------|
| **ddd** | `@nestjs/common`, `@nestjs/core`, `rxjs` | `@nestjs/event-emitter` |
| **database** | `@nestjs/common`, `@nestjs/core` | `@nestjs/typeorm`, `typeorm` |
| **openapi** | `@nestjs/common` | `@nestjs/swagger` |
| **validator** | `@nestjs/common` | `zod` |
| **errors** | `@nestjs/common` | - |
| **types** | - | - |

All peer dependencies are marked as **optional** in `peerDependenciesMeta`, so you only need to install what you use.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © [Your Name]

## 🔗 Links

- [npm Package](https://www.npmjs.com/package/@xlr8-nest/core)
- [GitHub Repository](#)
- [Documentation](#)
- [Issues](#)
