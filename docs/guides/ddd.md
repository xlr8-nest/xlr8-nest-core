# DDD & CQRS (`@xlr8-nest/core/ddd`)

Aggregates, value objects, domain events, and message buses (CommandBus / QueryBus / EventBus) for building domain-driven NestJS services.

**When to use:** any service that models business rules as domain objects and routes writes through commands and reads through queries instead of plain service methods.

---

## Quick start

### 1. Register CqrsModule in AppModule

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@xlr8-nest/core/ddd';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    CqrsModule.forRoot(),
    UserModule,
  ],
})
export class AppModule {}
```

`CqrsModule.forRoot()` is `@Global()` — it registers `CommandBus`, `QueryBus`, and `EventBus` once. Feature modules only add their handlers to `providers`; they never re-import the buses.

### 2. Define an aggregate

```typescript
// src/user/domain/user.aggregate.ts
import { AggregateRoot } from '@xlr8-nest/core/ddd';
import { UserCreatedEvent } from '../events/user-created.event';

export class User extends AggregateRoot<string> {
  private constructor(
    id: string,
    public readonly email: string,
    public readonly name: string,
  ) {
    super(id);
  }

  /** Factory — use when creating a brand-new user. Raises UserCreatedEvent. */
  static create(id: string, email: string, name: string): User {
    const user = new User(id, email, name);
    user.addEvent(new UserCreatedEvent(id, email));
    return user;
  }

  /** Reconstitution — use when loading from persistence. No events raised. */
  static reconstitute(id: string, email: string, name: string): User {
    return new User(id, email, name);
  }
}
```

### 3. Define a command and handler

```typescript
// src/user/commands/create-user.command.ts
import { ICommand } from '@xlr8-nest/core/ddd';

export class CreateUserCommand implements ICommand {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly name: string,
  ) {}
}
```

```typescript
// src/user/commands/create-user.handler.ts
import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler, EventBus } from '@xlr8-nest/core/ddd';
import { CreateUserCommand } from './create-user.command';
import { User } from '../domain/user.aggregate';
import { UserRepository } from '../user.repository';

@Injectable()
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, string> {
  constructor(
    private readonly users: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const user = User.create(command.id, command.email, command.name);
    await this.users.save(user);
    await this.eventBus.publishAll(user.pullEvents());
    return user.id;
  }
}
```

### 4. Dispatch from a controller

```typescript
// src/user/user.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { CommandBus } from '@xlr8-nest/core/ddd';
import { CreateUserCommand } from './commands/create-user.command';
import { randomUUID } from 'crypto';

@Controller('users')
export class UserController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  create(@Body() body: { email: string; name: string }) {
    return this.commandBus.execute(
      new CreateUserCommand(randomUUID(), body.email, body.name),
    );
  }
}
```

### 5. Register handlers in the feature module

```typescript
// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { CreateUserHandler } from './commands/create-user.handler';
import { UserRepository } from './user.repository';

@Module({
  controllers: [UserController],
  providers: [UserRepository, CreateUserHandler],
})
export class UserModule {}
```

---

## Core concepts

### Entity and AggregateRoot

`Entity<T>` is the base for any domain object with identity. It exposes `.id` / `.getId()` and `.equals()`.

`AggregateRoot<T>` extends `Entity<T>` and adds the event-recording lifecycle:

| Method | Access | Purpose |
|---|---|---|
| `addEvent(event)` | `protected` | Records a domain event inside a business method |
| `pullEvents()` | `public` | Drains and returns all recorded events; call after persisting |

**Factory vs reconstitute pattern:** always split construction into two static methods.

```typescript
// create() — new aggregate, events are raised
static create(id: string, email: string): Order {
  const order = new Order(id, email);
  order.addEvent(new OrderPlacedEvent(id));
  return order;
}

// reconstitute() — loaded from DB, no events raised
static reconstitute(id: string, email: string): Order {
  return new Order(id, email);
}
```

### ValueObject

Extend `ValueObject` and implement `equals(other: this): boolean`. ValueObjects are compared by value, not reference, and must be treated as immutable.

```typescript
// src/user/domain/email.value-object.ts
import { ValueObject } from '@xlr8-nest/core/ddd';

export class Email extends ValueObject {
  private constructor(public readonly value: string) {
    super();
  }

  static create(raw: string): Email {
    const normalised = raw.trim().toLowerCase();
    if (!normalised.includes('@')) {
      throw new Error('Invalid email address');
    }
    return new Email(normalised);
  }

  equals(other: this): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
```

Never mutate a `ValueObject` after construction. To "change" a value, replace the instance.

### CompositeKey

Use `CompositeKey` when an entity's identity is made up of multiple parts (e.g. tenant + user in a multi-tenant system).

```typescript
import { CompositeKey, AggregateRoot } from '@xlr8-nest/core/ddd';

export class TenantUser extends AggregateRoot<CompositeKey<readonly [string, string]>> {
  private constructor(tenantId: string, userId: string) {
    super(new CompositeKey(tenantId, userId));
  }

  static create(tenantId: string, userId: string): TenantUser {
    return new TenantUser(tenantId, userId);
  }
}

// Equality delegates to CompositeKey.equals()
const a = TenantUser.create('t1', 'u1');
const b = TenantUser.create('t1', 'u1');
a.equals(b); // true — same parts, different instances
```

`CompositeKey.equals()` compares parts positionally. If a part is a `ValueObject`, it calls that object's `equals()`. Everything else uses `===`.

---

## Domain events

### Define an event

```typescript
// src/user/events/user-created.event.ts
import { DomainEvent, Event, getEventName } from '@xlr8-nest/core/ddd';

@Event()
export class UserCreatedEvent implements DomainEvent {
  readonly occurredOn: Date = new Date();

  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}

  get eventName(): string {
    return getEventName(this);
  }
}
```

`@Event()` uses the class name as the event name by default. Pass an explicit string `@Event('user.created')` to override — useful for stable event names that survive refactoring.

### Handle an event

```typescript
// src/notification/notification.event-handlers.ts
import { Injectable } from '@nestjs/common';
import { EventHandler } from '@xlr8-nest/core/ddd';
import { UserCreatedEvent } from '../user/events/user-created.event';

@Injectable()
export class NotificationEventHandlers {
  @EventHandler(UserCreatedEvent)
  async onUserCreated(event: UserCreatedEvent): Promise<void> {
    // send welcome email, push notification, etc.
    console.log(`Welcome email dispatched to ${event.email}`);
  }
}
```

Register the provider in its feature module's `providers` array. `@EventHandler` wraps NestJS `@OnEvent` — no manual subscription needed.

---

## CQRS buses

### QueryBus

```typescript
// src/user/queries/get-user.query.ts
import { IQuery } from '@xlr8-nest/core/ddd';

export class GetUserQuery implements IQuery {
  constructor(public readonly userId: string) {}
}
```

```typescript
// src/user/queries/get-user.handler.ts
import { Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@xlr8-nest/core/ddd';
import { NotFoundError } from '@xlr8-nest/core/errors';
import { GetUserQuery } from './get-user.query';
import { USER_ERRORS } from '../errors/user.errors';
import { UserRepository } from '../user.repository';

export interface UserDto {
  id: string;
  email: string;
  name: string;
}

@Injectable()
@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery, UserDto> {
  constructor(private readonly users: UserRepository) {}

  async execute(query: GetUserQuery): Promise<UserDto> {
    const user = await this.users.findById(query.userId);
    if (!user) throw new NotFoundError(USER_ERRORS.USER_NOT_FOUND);
    return { id: user.id, email: user.email, name: user.name };
  }
}
```

```typescript
// controller usage
import { QueryBus } from '@xlr8-nest/core/ddd';

@Get(':id')
findOne(@Param('id') id: string) {
  return this.queryBus.execute(new GetUserQuery(id));
}
```

### Handling missing handlers

When no handler is registered for a command or query, the bus throws `NotFoundError` (from `@xlr8-nest/core/errors`). Distinguish it from a domain `NotFoundError` using the code:

```typescript
import { NotFoundError } from '@xlr8-nest/core/errors';
import { DddErrors } from '@xlr8-nest/core/ddd';

try {
  await commandBus.execute(new CreateUserCommand(...));
} catch (err) {
  if (
    err instanceof NotFoundError &&
    err.code === DddErrors.CommandHandlerNotFound.code
  ) {
    // misconfiguration — handler not registered
    throw err;
  }
  // domain NotFoundError — handle normally
  throw err;
}
```

---

## Sagas

Sagas are reactive cross-aggregate workflows. They listen to the event stream and dispatch commands in response.

```typescript
// src/order/order.sagas.ts
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { Saga, ICommand, DomainEvent } from '@xlr8-nest/core/ddd';
import { UserCreatedEvent } from '../user/events/user-created.event';
import { CreateWelcomeOrderCommand } from './commands/create-welcome-order.command';

@Injectable()
export class OrderSagas {
  @Saga()
  onUserCreated = (events$: Observable<DomainEvent>): Observable<ICommand> => {
    return events$.pipe(
      filter((event): event is UserCreatedEvent => event instanceof UserCreatedEvent),
      map((event) => new CreateWelcomeOrderCommand(event.userId)),
    );
  };
}
```

Register in the feature module's `providers` array:

```typescript
@Module({
  providers: [OrderSagas, CreateWelcomeOrderHandler],
})
export class OrderModule {}
```

`EventBus` discovers all `@Saga()`-decorated properties on `onModuleInit` and wires them to the `CommandBus` automatically via `setCommandBus`. No manual wiring needed.

---

## EventBus teardown

`EventBus` implements `OnModuleDestroy`. When the application shuts down, it unsubscribes all RxJS subscriptions and completes the internal Subject. You do not need to call any cleanup method manually.

---

## Patterns and recipes

### Domain error catalog for a feature

```typescript
// src/user/errors/user.errors.ts
import type { ErrorType } from '@xlr8-nest/core/errors';

export const USER_ERRORS = {
  USER_NOT_FOUND:   { code: 'USER-USER_NOT_FOUND',   message: 'User not found' },
  USER_EMAIL_TAKEN: { code: 'USER-USER_EMAIL_TAKEN', message: 'Email address is already in use' },
  USER_INACTIVE:    { code: 'USER-USER_INACTIVE',    message: 'User account is inactive' },
} as const satisfies Record<string, ErrorType>;
```

Throw with a typed error class from `@xlr8-nest/core/errors`:

```typescript
import { NotFoundError, ConflictError } from '@xlr8-nest/core/errors';
import { USER_ERRORS } from '../errors/user.errors';

throw new NotFoundError(USER_ERRORS.USER_NOT_FOUND);
throw new ConflictError(USER_ERRORS.USER_EMAIL_TAKEN);
```

### Events-only module (no command/query buses)

If a module only needs domain events and no CQRS buses, import `EventModule` instead:

```typescript
import { EventModule } from '@xlr8-nest/core/ddd';

@Module({
  imports: [EventModule.forRoot({ maxListeners: 20 })],
})
export class AppModule {}
```

### DomainService for stateless invariants

```typescript
// src/order/domain/pricing.service.ts
import { DomainService } from '@xlr8-nest/core/ddd';

export class PricingService extends DomainService {
  applyDiscount(price: number, discountPct: number): number {
    this.guard(discountPct >= 0 && discountPct <= 100, 'Discount must be 0–100');
    this.guard(price >= 0, 'Price must not be negative');
    return price * (1 - discountPct / 100);
  }
}
```

`guard(condition, message)` throws a plain `Error` when `condition` is `false`. Wrap it in a domain error at the aggregate boundary if you need a typed error propagated to HTTP.

---

## Gotchas

**`@Saga()` must decorate an arrow-function property, not a regular method.**

```typescript
// CORRECT — arrow property, @Saga() works
@Saga()
onUserCreated = (events$: Observable<DomainEvent>): Observable<ICommand> => { ... };

// WRONG — regular method, discovered but `this` will be unbound
@Saga()
onUserCreated(events$: Observable<DomainEvent>): Observable<ICommand> { ... }
```

**Never import `CqrsModule` (or `EventModule`) more than once.** Both modules are `@Global()`. Re-importing them in a feature module creates a second `EventBus` instance. The `CommandBus` is wired to the first instance; the second instance has no `CommandBus` — saga command dispatch silently fails.

**Handler registry is keyed by `constructor.name`.** Minifiers rename classes (e.g. `CreateUserCommand` → `a`), causing every lookup to collide or miss. Disable class-name mangling in your bundler, or do not bundle the NestJS application (standard for server-side apps).

**`pullEvents()` clears the internal list.** Call it exactly once per aggregate after persisting. Calling it twice returns an empty array on the second call — events are lost.

**Handlers must be registered as NestJS providers in a feature module.** Adding a `@CommandHandler` class to `AppModule.providers` is technically valid but mixes infrastructure with domain. Place handlers in the module that owns the corresponding domain concept.

**`EventBus.subscribe()` is for programmatic subscriptions.** Use `@EventHandler` on methods for the normal case. Use `subscribe()` only when you need to manage the subscription lifecycle manually (e.g. conditional subscriptions, testing).

---

## See Also

- [Errors guide](./errors.md) — `NotFoundError`, `ConflictError`, error catalog pattern, `GlobalExceptionFilter`
- [Database guide](./database.md) — `IUnitOfWork`, repositories, persistence layer that aggregates save into
- [Response guide](./response.md) — standard response envelope and exception filter registration
