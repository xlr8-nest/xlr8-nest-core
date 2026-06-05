# @xlr8-nest/core

> A comprehensive NestJS utility library with DDD, CQRS, TypeORM extensions, OpenAPI decorators, and Zod validation.

[![npm version](https://img.shields.io/npm/v/@xlr8-nest/core.svg)](https://www.npmjs.com/package/@xlr8-nest/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-9%20%7C%2010%20%7C%2011%20%7C%2012-red.svg)](https://nestjs.com/)

## ✨ Features

- 🏗️ **Event Module & CQRS**: Domain events, aggregate roots, and Command/Query buses
- 📦 **Unit of Work**: TypeORM extensions with UoW pattern using AsyncLocalStorage
- 🔄 **Event-Driven**: Domain events with Saga pattern support
- 📬 **Outbox & Messaging**: Transactional outbox pattern with background worker, retries, and pluggable brokers
- 🛡️ **Authorization**: Declarative RBAC, permission, policy, and resource/property-based access control behind one extensible guard
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

| Package                 | Supported Versions                                                   |
| ----------------------- | -------------------------------------------------------------------- |
| `@nestjs/common`        | ^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0 \|\| ^12.0.0                        |
| `@nestjs/core`          | ^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0 \|\| ^12.0.0                        |
| `@nestjs/swagger`       | ^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0 \|\| ^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0 |
| `@nestjs/typeorm`       | ^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0 \|\| ^12.0.0                        |
| `@nestjs/event-emitter` | ^2.0.0 \|\| ^3.0.0 \|\| ^4.0.0                                       |
| `rxjs`                  | ^7.0.0 \|\| ^8.0.0                                                   |
| `typeorm`               | ^0.3.0 \|\| ^0.4.0                                                   |
| `zod`                   | ^3.0.0 \|\| ^4.0.0 \|\| ^5.0.0                                       |
| `reflect-metadata`      | ^0.1.13 \|\| ^0.2.0 \|\| ^0.3.0                                      |

✅ **Tested with latest versions**: NestJS 11, Swagger 11, Zod 4, Event Emitter 3

## 🧩 Standalone Imports

Use standalone subpath imports when you only need constants or utilities:

```typescript
import { StatusCode, CommonErrors } from '@xlr8-nest/core/constants';
import { validateInput } from '@xlr8-nest/core/utils';
```

`@xlr8-nest/core/constants` has no runtime peer dependencies. `@xlr8-nest/core/utils` currently contains Zod/Nest validation helpers, so install `@nestjs/common` and `zod` when using it.

## 🚀 Quick Start

### 1. Event Module

```typescript
import { Module } from '@nestjs/common';
import { EventModule } from '@xlr8-nest/core/ddd';

@Module({
  imports: [
    EventModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 10,
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
        type: DatabaseType.POSTGRES,
        host: 'localhost',
        port: 5432,
        username: 'user',
        password: 'pass',
        database: 'mydb',
      },
      entities: [UserOrm, ProductOrm],        // required — TypeORM entity classes or globs
      migration: {
        enabled: true,
        autoRun: false,                        // true → runs on module init (throws on failure)
        migrationsPath: 'src/database/migrations',
      },
      seeder: {
        enabled: true,
        seeds: [UserSeeder, ProductSeeder],    // seeder classes (not a path string)
        autoRun: false,
      },
    }),
  ],
})
export class AppModule {}
```

### 3. OpenAPI Decorators

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiGet, ApiPost } from '@xlr8-nest/core/openapi';
import { CreateUserDto, UserDto } from './dto';

@Controller('users')
export class UserController {
  @Post()
  @ApiPost(UserDto, { summary: 'Create a new user' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get()
  @ApiGet(UserDto, { summary: 'Get paginated users', paginated: true })
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

### 5. Authorization

```typescript
import { AuthzModule, RequireRoles, RequirePermissions } from '@xlr8-nest/core/authz';

// Register once (global by default)
@Module({
  imports: [AuthzModule.forRoot({ registerGlobalGuard: true })],
})
export class AppModule {}

// Then declare access on routes
@Controller('users')
export class UserController {
  @Post()
  @RequireRoles('admin')                 // RBAC
  create() {}

  @Patch(':id')
  @RequirePermissions('user:write')      // permission-based (supports wildcards)
  update() {}
}
```

→ See the **[Authorization deep-dive guide](docs/authz.md)** for the full mental
model, all four models, custom strategies, and the complete API reference.

## 📚 Modules

This package provides multiple modules that can be imported individually:

### 🏗️ Event Module & CQRS (`@xlr8-nest/core/ddd`)

Domain model primitives, EventEmitter-backed domain event handlers, and optional CQRS buses for NestJS.

```typescript
import {
  AggregateRoot,
  Entity,
  ValueObject,
  DomainEvent,
  CommandBus,
  QueryBus,
  EventBus,
  EventModule,
  CqrsModule,
} from '@xlr8-nest/core/ddd';
```

**Features:**

- `EventModule` - EventEmitter infrastructure for domain event handlers
- `AggregateRoot` - Base class that records domain events and exposes `pullEvents()` for publishing
- `Entity` - Base entity class with identity management
- `ValueObject` - Abstract value object base class
- `EventBus` - Publishes pulled aggregate events to `@EventHandler()` handlers and sagas
- `CommandBus` / `QueryBus` - CQRS buses with automatic handler discovery
- Decorators: `@Event()`, `@EventHandler()`, `@CommandHandler()`, `@QueryHandler()`, `@Saga()`

Aggregate roots only collect events. Use protected `addEvent()` inside aggregate methods, then publish with `EventBus` by calling public `pullEvents()` after the aggregate has been persisted. `pullEvents()` returns the recorded events and clears the aggregate event list.

**Example:**

```typescript
// Define domain event
@Event()
export class UserCreatedEvent implements DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly occurredOn = new Date(),
  ) {}
  get eventName() {
    return getEventName(this);
  }
}

@Event()
export class UserEmailChangedEvent implements DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly occurredOn = new Date(),
  ) {}
  get eventName() {
    return getEventName(this);
  }
}

// Create aggregate root
export class User extends AggregateRoot<string> {
  constructor(
    id: string,
    private name: string,
    private email: string,
  ) {
    super(id);
  }

  static create(name: string, email: string): User {
    const user = new User(uuid(), name, email);
    user.addEvent(new UserCreatedEvent(user.id));
    return user;
  }

  changeEmail(email: string): void {
    this.email = email;
    this.addEvent(new UserEmailChangedEvent(this.id, email));
  }
}

// Command handler
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly repository: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand) {
    const user = User.create(command.name, command.email);
    await this.repository.save(user);
    await this.eventBus.publishAll(user.pullEvents());
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
  IUnitOfWork,
  IUnitOfWorkToken,
  InjectUnitOfWork,
  UnitOfWork,
  MigrationService,
  SeederService,
  BaseSeeder,
  BaseFactory,
  BaseOrm,
} from '@xlr8-nest/core/database';
```

**Features:**

- Unit of Work pattern with AsyncLocalStorage
- Migration & Seeder services with CLI commands
- Base classes for seeders, factories, and ORM entities (`BaseOrm` for partial-constructor TypeORM entities)
- Support for PostgreSQL, MySQL, MariaDB, SQLite, MSSQL
- Auto-run migrations and seeders
- Transaction isolation per request

**Example:**

```typescript
// Unit of Work — two methods only: transaction() and manager
@Injectable()
export class UserService {
  constructor(@InjectUnitOfWork() private readonly uow: IUnitOfWork) {}

  async createUser(dto: CreateUserDto) {
    // Wrap writes in a transaction; both save calls share the same QueryRunner
    return this.uow.transaction(async () => {
      const user = this.uow.manager.create(User, dto);
      await this.uow.manager.save(user);
      return user;
    });
    // On success: commits. On error: rolls back. No manual commit/rollback needed.
  }

  async findById(id: string) {
    // Outside a transaction, manager falls back to DataSource.manager (read-only safe)
    return this.uow.manager.findOne(User, { where: { id } });
  }
}

// Seeder — extend BaseSeeder; use this.manager (injected from DataSource)
export class UserSeeder extends BaseSeeder {
  async run() {
    await this.clearTable('users'); // validates identifier before TRUNCATE
    const users = [
      { name: 'John', email: 'john@example.com' },
      { name: 'Jane', email: 'jane@example.com' },
    ];
    await this.manager.save(User, users);
  }
}

// Use BaseOrm for partial-constructor TypeORM entities
@Entity('users')
export class UserOrm extends BaseOrm<UserOrm> {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column()
  email: string;

  @Column()
  name: string;
}

// Construct with any subset of fields — useful for adapter mapping
const orm = new UserOrm({ id, email });
```

### 📬 Messaging (`@xlr8-nest/core/messaging`)

Transactional outbox pattern for reliable cross-service event delivery. Domain events raised by your aggregates are translated into versioned **integration events** and persisted to an outbox table inside the same DB transaction as the aggregate state — guaranteeing at-least-once delivery to downstream services.

```typescript
import {
  MessagingModule,
  OutboxPublisher,
  IntegrationEvent,
  IDomainEventTranslator,
  IMessagePublisher,
  OutboxEventRecord,
  ConsoleMessagePublisher,
} from '@xlr8-nest/core/messaging';
```

**Features:**

- Two clearly separated event types:
  - **Domain events** (in-process, transient) — already provided by `@xlr8-nest/core/ddd`
  - **Integration events** (cross-service, durable) — new contracts versioned per consumer
- `IntegrationEvent` base class with stable `id`, `eventName`, `aggregateType`, `aggregateId`, `occurredAt`
- `IDomainEventTranslator` pattern to map domain events → 0+ integration events
- `OutboxPublisher`: pulls events from an aggregate, translates, and atomically stashes them inside the active `UnitOfWork.transaction()`
- `OutboxEventOrm` mapping for the `outbox_events` table (you write the migration)
- `OutboxWorker`: background poller with exponential backoff retry (configurable interval, batch size, backoff)
- Concurrent worker support via `SELECT ... FOR UPDATE SKIP LOCKED`
- Pluggable `IMessagePublisher` — default `ConsoleMessagePublisher` logs to stdout; swap for Kafka, RabbitMQ, SNS, NATS, etc.
- One-line module wiring via `MessagingModule.forRoot({ translators, messagePublisher, worker })`

**The flow:**

```
Application handler:
  uow.transaction(async () => {
    await repo.save(aggregate);          // step 1: persist aggregate
    await outbox.publishFrom(aggregate); // step 2: pull events → translate → stash to outbox
  });                                    // step 3: COMMIT (atomic)

Background:
  OutboxWorker polls outbox → MessagePublisher.publish() → mark PUBLISHED
                                                     └── on failure → exponential backoff retry
```

**Example:**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import {
  IntegrationEvent,
  IDomainEventTranslator,
  OutboxPublisher,
  MessagingModule,
} from '@xlr8-nest/core/messaging';
import {
  IUnitOfWork,
  IUnitOfWorkToken,
} from '@xlr8-nest/core/database';
import { CommandHandler, EventBus, DomainEvent } from '@xlr8-nest/core/ddd';

// 1. Define an integration event (the cross-service contract)
export class UserRegisteredIntegrationEvent extends IntegrationEvent {
  readonly eventName = 'user.registered.v1';
  readonly aggregateType = 'user';
  readonly aggregateId: string;

  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {
    super();
    this.aggregateId = userId;
  }
}

// 2. Define a translator: domain event → integration event(s)
@Injectable()
export class UserEventTranslator implements IDomainEventTranslator {
  supports(eventName: string): boolean {
    return eventName === 'user.created';
  }

  translate(event: DomainEvent): IntegrationEvent[] {
    if (event instanceof UserCreatedEvent) {
      return [new UserRegisteredIntegrationEvent(event.userId, event.email)];
    }
    return [];
  }
}

// 3. Wire up the messaging module
@Module({
  imports: [
    MessagingModule.forRoot({
      translators: [UserEventTranslator],
      // messagePublisher: KafkaMessagePublisher, // optional; defaults to ConsoleMessagePublisher
      // worker: { pollIntervalMs: 2000, batchSize: 25 }, // optional tuning
    }),
  ],
})
export class AppModule {}

// 4. Use the OutboxPublisher in your command handler
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly userRepo: UserRepository,
    @Inject(IUnitOfWorkToken) private readonly uow: IUnitOfWork,
    private readonly outbox: OutboxPublisher,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand) {
    const user = User.create(command.name, command.email);

    // Single atomic transaction: aggregate + integration events committed together
    const domainEvents = await this.uow.transaction(async () => {
      await this.userRepo.save(user);
      return this.outbox.publishFrom(user);
    });

    // After commit, dispatch domain events to in-process listeners
    // (logging, metrics, projectors). Cross-service delivery is already in the outbox.
    for (const event of domainEvents) {
      this.eventBus.publish(event);
    }
  }
}
```

**Custom message publisher (Kafka example):**

```typescript
@Injectable()
export class KafkaMessagePublisher implements IMessagePublisher {
  constructor(private readonly kafka: KafkaClient) {}

  async publish(record: OutboxEventRecord): Promise<void> {
    await this.kafka.send({
      topic: record.eventName,
      key: record.aggregateId,
      messages: [{
        value: JSON.stringify(record.payload),
        headers: { 'event-id': record.id }, // stable across retries — use as dedupe key
      }],
    });
    // throw on broker rejection so the worker records the failure and schedules a retry
  }
}
```

**Outbox CLI (`outbox` command):**

The messaging module ships an `outbox` CLI command (powered by `nest-commander`) that you wire into your existing CLI bootstrap alongside `migration` and `seed`:

```typescript
// cli.ts
import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli.module';

async function bootstrap() {
  await CommandFactory.run(CliModule, ['warn', 'error', 'log']);
}
bootstrap();
```

```typescript
// cli.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseExtensionModule.registerAsync({ useFactory: () => ({ /* ... */ }) }),
    MessagingModule.forRoot({
      translators: [/* ... */],
      // cli: true is the default — the `outbox` command is registered automatically
    }),
  ],
})
export class CliModule {}
```

Then in `package.json`:

```json
{
  "scripts": {
    "cli": "ts-node -r tsconfig-paths/register src/cli.ts"
  }
}
```

**Available outbox commands:**

```bash
# Generate the outbox_events table migration into the configured migrations path
npm run cli -- outbox migration
npm run cli -- outbox migration --name AddOutboxTable
npm run cli -- outbox migration --path ./src/db/migrations

# Show counts (pending / published / failed / due-now)
npm run cli -- outbox status

# Reset all FAILED events back to PENDING for immediate retry
npm run cli -- outbox requeue-failed

# Help
npm run cli -- outbox
```

**Example output of `outbox status`:**

```
📊 Outbox Status

  Pending:   3
  Published: 142
  Failed:    1
  Due now:   3  (will be picked up by the next worker tick)

⚠️  There are failed events. Inspect them, then run:
     <prefix> outbox requeue-failed
```

**Using `OutboxAdminService` programmatically:**

The same logic is exposed via `OutboxAdminService` for non-CLI use (admin dashboards, health checks, etc.):

```typescript
@Injectable()
export class AdminService {
  constructor(private readonly outboxAdmin: OutboxAdminService) {}

  async getOutboxHealth() {
    const stats = await this.outboxAdmin.getStats();
    return {
      backlog: stats.pending,
      stuck: stats.failed,
      throughput: stats.published,
    };
  }
}
```

**Required migration in your service:**

The CLI command above generates this for you. You can also create it by hand — the schema must match `OutboxEventOrm`:

```sql
CREATE TYPE outbox_events_status_enum AS ENUM ('pending', 'published', 'failed');

CREATE TABLE outbox_events (
  id              uuid PRIMARY KEY,
  event_name      varchar(255) NOT NULL,
  aggregate_type  varchar(100) NOT NULL,
  aggregate_id    varchar(255) NOT NULL,
  payload         jsonb NOT NULL,
  status          outbox_events_status_enum NOT NULL DEFAULT 'pending',
  retry_count     integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  last_error      text,
  occurred_at     timestamptz NOT NULL,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_events_due ON outbox_events (status, next_attempt_at);
```

**Retry strategy:**

Failed publishes are retried with exponential backoff (defaults: 30s → 60s → 2m → 4m → ... capped at 1 hour). After 10 failed attempts the row transitions to `status='failed'` and is no longer retried automatically — surface these for operator inspection via a dashboard query on `WHERE status = 'failed'`.

### 🛡️ Authorization (`@xlr8-nest/core/authz`)

Declarative authorization for NestJS. One guard, one service, and a small set of
decorators cover **four authorization models** — and any future model plugs in
without touching the framework.

> **Authorization, not authentication.** This module answers *"is this known
> user allowed?"*. Keep your existing JWT/auth guard to answer *"who is this
> user?"* — this framework reads the already-authenticated `request.user` via a
> pluggable resolver.

```typescript
import {
  AuthzModule,
  AuthorizationService,
  AuthorizationGuard,
  RequireRoles,
  RequirePermissions,
  RequirePolicy,
  RequireResource,
  CheckOwnership,
  Authorize,
  Public,
} from '@xlr8-nest/core/authz';
```

**The model — requirement + handler + principal:**

| Concept | What it is | Example |
| --- | --- | --- |
| **Requirement** | a declarative demand attached to a route (object with a `type`) | "must have role `admin`" |
| **Handler** | a strategy that evaluates one requirement `type` | `RolesHandler` → `type: 'roles'` |
| **Principal** | the normalized authenticated subject | `{ id, roles, permissions, attributes }` |

A decorator attaches requirements; the `AuthorizationGuard` resolves the
principal and dispatches each requirement to its handler; the
`AuthorizationService` exposes the same evaluation for imperative checks. **A new
authorization model = one requirement + one handler + register it.** Nothing
else changes.

**Features:**

- **RBAC** — `@RequireRoles('admin', 'manager', { mode: 'any' | 'all' })`
- **Permission-based** — `@RequirePermissions('user:write', { mode })`, with
  wildcard matching (`billing:*`, `user:*:read`)
- **Policy-based** — named, reusable rules (requirements and/or a custom
  predicate) registered via `AuthzModule.forRoot({ policies })`, applied with
  `@RequirePolicy('CanManageBilling')`
- **Resource / property-based** — `@CheckOwnership({ ownerField, bypassRoles,
  load })` and `@RequireResource(evaluate, load?)`
- **Imperative** — `AuthorizationService.authorize() / can() / checkAll()` for
  checks inside command handlers and domain services
- **Pluggable principal** — implement `PrincipalResolver` to source
  roles/permissions from JWT claims (default), a DB lookup, or a remote service
- **Global or per-route** — `registerGlobalGuard: true` (+ `@Public()` to opt
  out), or `@UseGuards(AuthorizationGuard)` per controller
- **Extensible** — add custom strategies (ABAC, time-window, tenant-scoped, ...)
  with no framework changes

**Setup:**

```typescript
import { Module } from '@nestjs/common';
import { AuthzModule, RolesRequirement, PermissionsRequirement } from '@xlr8-nest/core/authz';

@Module({
  imports: [
    AuthzModule.forRoot({
      registerGlobalGuard: true, // gate every route; use @Public() to opt out
      policies: [
        {
          name: 'CanManageBilling',
          requirements: [
            new RolesRequirement(['admin', 'billing-manager']), // any of
            new PermissionsRequirement(['billing:write']),
          ],
        },
      ],
    }),
  ],
})
export class AppModule {}
```

**Declarative usage:**

```typescript
import {
  RequireRoles,
  RequirePermissions,
  RequirePolicy,
  CheckOwnership,
  Public,
} from '@xlr8-nest/core/authz';

@Controller('articles')
export class ArticleController {
  @Get('public')
  @Public()                                    // bypass the guard entirely
  publicList() {}

  @Post()
  @RequireRoles('editor', 'admin')             // RBAC — any of these roles
  create() {}

  @Get('reports')
  @RequirePermissions('reports:view', 'reports:export') // all of (default mode)
  reports() {}

  @Post('invoices/:id/charge')
  @RequirePolicy('CanManageBilling')           // named policy
  charge() {}

  @Patch(':id')
  @CheckOwnership({                            // resource/ownership-based
    ownerField: 'authorId',
    bypassRoles: ['admin'],
    load: (ctx) => articleRepo.findById((ctx.request as Request).params.id),
  })
  update() {}
}
```

**Imperative usage (inside services / command handlers):**

```typescript
import { Injectable } from '@nestjs/common';
import {
  AuthorizationService,
  RolesRequirement,
  ResourceRequirement,
  type AuthorizationPrincipal,
} from '@xlr8-nest/core/authz';

@Injectable()
export class ArticleService {
  constructor(private readonly authz: AuthorizationService) {}

  async publish(principal: AuthorizationPrincipal, article: Article) {
    await this.authz.authorize(
      principal,
      [
        new RolesRequirement(['editor', 'admin']),
        new ResourceRequirement<Article>(
          (p, a) => a.authorId === p.id || p.roles.includes('admin'),
        ),
      ],
      { resource: article }, // pre-attach the resource
    ); // throws ForbiddenError if not satisfied

    article.status = 'published';
  }
}
```

**Custom strategy (no framework changes):**

```typescript
import { Injectable } from '@nestjs/common';
import {
  Authorize,
  AuthzModule,
  type AuthorizationRequirement,
  type RequirementHandler,
} from '@xlr8-nest/core/authz';

// 1. requirement (unique `type`)
class TimeWindowRequirement implements AuthorizationRequirement<'time-window'> {
  readonly type = 'time-window';
  constructor(public readonly startUtc: number, public readonly endUtc: number) {}
}

// 2. handler (matches by requirementType)
@Injectable()
class TimeWindowHandler implements RequirementHandler<TimeWindowRequirement> {
  readonly requirementType = 'time-window';
  handle(req: TimeWindowRequirement): boolean {
    const h = new Date().getUTCHours();
    return h >= req.startUtc && h < req.endUtc;
  }
}

// 3. register
AuthzModule.forRoot({ handlers: [TimeWindowHandler] });

// 4. (optional) decorator + use — composes with everything else
const DuringBusinessHours = () => Authorize(new TimeWindowRequirement(8, 18));

@Post('payouts')
@RequireRoles('finance')
@DuringBusinessHours()
runPayouts() {}
```

**Behavior summary:**

- A route with **no** authorization requirements is **allowed** — this guard
  governs authorization, not authentication.
- **No principal** but requirements present ⇒ `401 UnauthorizedError`.
- A requirement **not satisfied** ⇒ `403 ForbiddenError`.
- **Stacked decorators ⇒ logical AND**, short-circuiting on the first denial.
- `@RequireRoles` defaults to `mode: 'any'`; `@RequirePermissions` defaults to
  `mode: 'all'`.

> ℹ️ `UserIdentity.roles` was widened from `string` to `string[]` to support
> RBAC. The default `RequestUserResolver` still accepts a single string and
> normalizes it to an array.

📖 **Full guide:** [docs/authz.md](docs/authz.md) — mental model, request flow,
every decorator/handler/type, recipes for all four models, the principal
resolver, the extension recipe, and a complete API reference.

### 🚨 Errors (`@xlr8-nest/core/errors`)

Standardized error classes that extend native `Error` (not NestJS `HttpException`). Use `GlobalExceptionFilter` from `@xlr8-nest/core/response` to map them to HTTP responses.

```typescript
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalServerError,
} from '@xlr8-nest/core/errors';
```

Define a named error catalog per domain (never inline codes at throw sites):

```typescript
// src/common/errors/user.errors.ts
import type { ErrorType } from '@xlr8-nest/core/types';

export const UserErrors = {
  NotFound:      { code: 'USER-NOT_FOUND',     message: 'User not found.' },
  EmailConflict: { code: 'USER-EMAIL_CONFLICT', message: 'This email is already in use.' },
} as const satisfies Record<string, ErrorType>;
```

Then import and throw via the catalog:

```typescript
import { NotFoundError, ConflictError } from '@xlr8-nest/core/errors';
import { UserErrors } from './common/errors/user.errors';

@Injectable()
export class UserService {
  async findById(id: string) {
    const user = await this.repository.findOne({ where: { id } });
    if (!user) throw new NotFoundError(UserErrors.NotFound);
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.repository.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictError(UserErrors.EmailConflict);
    // ...
  }
}
```

### 📝 OpenAPI (`@xlr8-nest/core/openapi`)

Swagger documentation decorators with standardized response format.

```typescript
import {
  ApiDelete,
  ApiGet,
  ApiMethod,
  ApiPatch,
  ApiPost,
  ApiPut,
  ApiError,
  ApiBadRequest,
  ApiConflict,
  ApiNotFound,
} from '@xlr8-nest/core/openapi';
```

**Features:**

- HTTP method-based decorators with wrapped response format
- Error response decorators
- Custom success/error wrapper factories
- Pagination support via `ApiGet(..., { paginated: true })`
- Automatic schema generation

**Breaking change migration:**

| Removed decorator | Use instead                        |
| ----------------- | ---------------------------------- |
| `ApiCreate`       | `ApiPost`                          |
| `ApiGetOne`       | `ApiGet`                           |
| `ApiGetMany`      | `ApiGet(..., { isArray: true })`   |
| `ApiGetPaginated` | `ApiGet(..., { paginated: true })` |
| `ApiUpdate`       | `ApiPatch` or `ApiPut`             |
| `ApiAction`       | `ApiMethod`                        |

`ApiDelete` is still available, but it now follows the HTTP method-based API and defaults to `200`.

**Example:**

```typescript
@Controller('users')
@ApiTags('users')
export class UserController {
  @Post()
  @ApiPost(UserDto, {
    summary: 'Create a new user',
    description: 'Creates a new user with the provided data',
  })
  @ApiBadRequest({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input data',
    },
    includeErrors: true,
  })
  @ApiConflict({
    error: {
      code: 'USER_EMAIL_EXISTS',
      message: 'Email already registered',
    },
  })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get(':id')
  @ApiGet(UserDto, { summary: 'Get user by ID' })
  @ApiNotFound()
  async findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Get()
  @ApiGet(UserDto, { summary: 'Get paginated users', paginated: true })
  async findAll(@Query() query: PaginationDto) {
    return this.userService.findAll(query);
  }

  @Delete(':id')
  @ApiDelete(null, { summary: 'Delete user' })
  async delete(@Param('id') id: string) {
    await this.userService.delete(id);
    return null;
  }
}
```

Use `null` or `undefined` as the response data type for endpoints whose wrapped response has `data: null`.

### 5. Response Builders

```typescript
import {
  buildSuccessResponse,
  buildErrorResponse,
  normalizeUnknownException,
  type ApiFailure,
  type ApiSuccess,
  type ErrorType,
} from '@xlr8-nest/core/response';
import { NotFoundError } from '@xlr8-nest/core/errors';

const USER_NOT_FOUND_ERROR: ErrorType<'USER_NOT_FOUND'> = {
  code: 'USER_NOT_FOUND',
  message: 'User not found',
};

@Get(':id')
async findOne(@Param('id') id: string): Promise<ApiSuccess<UserDto>> {
  const user = await this.userService.findById(id);
  return buildSuccessResponse(user, {
    message: 'User retrieved successfully',
  });
}

function buildNotFoundBody(): ApiFailure {
  return buildErrorResponse(new NotFoundError(USER_NOT_FOUND_ERROR));
}

function normalizeException(exception: unknown): ApiFailure {
  return buildErrorResponse(exception, {
    fallbackError: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error',
    },
  }).body;
}
```

**Custom wrapper example:**

```typescript
const auditWrapper = ({ defaultSchema, defaultExtraModels }) => ({
  schema: {
    ...defaultSchema,
    properties: {
      ...defaultSchema.properties,
      traceId: { type: 'string', example: 'req_123' },
    },
    required: [...(defaultSchema.required ?? []), 'traceId'],
  },
  extraModels: defaultExtraModels,
});

@Post()
@ApiPost(UserDto, {
  summary: 'Create user',
  wrapper: auditWrapper,
})
@ApiBadRequest({
  includeErrors: true,
  wrapper: auditWrapper,
})
async create(@Body() dto: CreateUserDto) {
  return this.userService.create(dto);
}
```

### 📐 Types (`@xlr8-nest/core/types`)

Shared TypeScript types and interfaces.

```typescript
import {
  Response,
  SuccessResponse,
  ErrorResponse,
  ApiResult,
  ApiSuccess,
  ApiFailure,
  UserIdentity,
  PaginationMeta,
} from '@xlr8-nest/core/types';
```

### 📦 Response (`@xlr8-nest/core/response`)

Response builders for standardized success/error payloads.

```typescript
import {
  buildSuccessResponse,
  buildErrorResponse,
  normalizeUnknownException,
  type ApiResult,
  type ApiSuccess,
  type ApiFailure,
  type SuccessResponse,
} from '@xlr8-nest/core/response';
```

**Features:**

- Type-safe success response builder for controller/service returns
- Type-safe error response builder that derives payloads from exceptions
- Exception normalizer for `BaseError`, Nest `HttpException`, and unknown errors
- Short aliases for controller signatures: `ApiSuccess<T>`, `ApiFailure<T>`, `ApiResult<T>`

**Recommended naming for controller return types:**

- Prefer `ApiSuccess<T>` when the controller method only returns the success body.
- Prefer `ApiResult<T>` when you want one shared API contract type across app layers or tests.
- Avoid using bare `Response<T>` in controllers if your app also imports Nest/Express `Response`, because the name can be confusing.
- For error builders and decorators, prefer passing a single `ErrorType` object instead of separate `code` and `message`.

**Example:**

```typescript
@Controller('users')
export class UserController {
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiSuccess<UserDto>> {
    const user = await this.userService.findById(id);

    return buildSuccessResponse(user, {
      message: 'User retrieved successfully',
    });
  }

  @Get()
  async findAll(): Promise<ApiSuccess<UserDto[]>> {
    const users = await this.userService.findAll();

    return buildSuccessResponse(users);
  }
}
```

**Function reference:**

```typescript
import {
  buildSuccessResponse,
  buildErrorResponse,
  normalizeUnknownException,
  type ErrorType,
} from '@xlr8-nest/core/response';
import { NotFoundError } from '@xlr8-nest/core/errors';

const USER_NOT_FOUND: ErrorType<'USER_NOT_FOUND'> = {
  code: 'USER_NOT_FOUND',
  message: 'User not found',
};

const success = buildSuccessResponse({ id: 'u_1' });

const error = buildErrorResponse(new NotFoundError(USER_NOT_FOUND));

const normalized = normalizeUnknownException(exception, {
  fallbackError: {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Unexpected error',
  },
  customErrorFactory: (error) => {
    if (error instanceof ExternalServiceError) {
      return {
        statusCode: 502,
        error: {
          code: 'EXTERNAL_SERVICE_ERROR',
          message: error.message,
        },
      };
    }

    return undefined;
  },
});
```

**Shared contract example:**

```typescript
import { buildSuccessResponse, type ApiResult } from '@xlr8-nest/core/response';

@Injectable()
export class UserFacade {
  async findOne(id: string): Promise<ApiResult<UserDto>> {
    const user = await this.userService.findById(id);

    return buildSuccessResponse(user, {
      message: 'User retrieved successfully',
    });
  }
}
```

**Exception filter example:**

```typescript
import {
  buildErrorResponse,
  normalizeUnknownException,
  type ApiFailure,
} from '@xlr8-nest/core/response';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const options = {
      fallbackError: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error',
      },
    };
    const { statusCode } = normalizeUnknownException(exception, options);
    const payload: ApiFailure = buildErrorResponse(exception, options);

    response.status(statusCode).json(payload);
  }
}
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

| Module        | Required Dependencies                              | Optional                     |
| ------------- | -------------------------------------------------- | ---------------------------- |
| **ddd**       | `@nestjs/common`, `@nestjs/core`, `rxjs`           | `@nestjs/event-emitter`      |
| **database**  | `@nestjs/common`, `@nestjs/core`                   | `@nestjs/typeorm`, `typeorm` |
| **messaging** | `@nestjs/common`, `@nestjs/core`, `@nestjs/typeorm`, `typeorm` | -                |
| **authz**     | `@nestjs/common`, `@nestjs/core`                   | -                            |
| **openapi**   | `@nestjs/common`                                   | `@nestjs/swagger`            |
| **response**  | `@nestjs/common`                                   | -                            |
| **validator** | `@nestjs/common`                                   | `zod`                        |
| **errors**    | `@nestjs/common`                                   | -                            |
| **types**     | -                                                  | -                            |
| **constants** | -                                                  | -                            |
| **utils**     | `@nestjs/common`, `zod`                            | -                            |

All peer dependencies are marked as **optional** in `peerDependenciesMeta`, so you only need to install what you use.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © [Your Name]

## 🔗 Links

- [npm Package](https://www.npmjs.com/package/@xlr8-nest/core)
- [GitHub Repository](https://github.com/xlr8-nest/xlr8-nest-core)
- [Documentation](https://github.com/xlr8-nest/xlr8-nest-core#readme)
- [Issues](https://github.com/xlr8-nest/xlr8-nest-core/issues)
