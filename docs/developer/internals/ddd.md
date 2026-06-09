# Internals: DDD & CQRS (`lib/ddd`)

Deep dive into how the DDD primitives and CQRS buses are implemented — discovery, dispatch,
event propagation, sagas, and module wiring.

---

## Table of Contents

- [File map](#file-map)
- [1. Domain primitives](#1-domain-primitives)
  - [`Entity<T>` and `AggregateRoot<T>`](#entityt-and-aggregateroott)
  - [`CompositeKey<Parts>`](#compositkeyparts)
  - [`ValueObject`](#valueobject)
  - [`DomainService.guard(condition, message)`](#domainserviceguardcondition-message)
- [2. Domain events and the `@Event` decorator](#2-domain-events-and-the-event-decorator)
  - [`@Event(name?)` and `getEventName()`](#eventname-and-geteventname)
  - [`@EventHandler(eventClassOrName)`](#eventhandlereventclassorname)
- [3. CQRS buses: AbstractMessageBus](#3-cqrs-buses-abstractmessagebus)
  - [Handler discovery (`onModuleInit` → `discover()`)](#handler-discovery-onmoduleinit--discover)
  - [Handler dispatch (`execute(message)`)](#handler-dispatch-executemessage)
  - [Manual `bind(handler, messageCtor)`](#manual-bindhandler-messagector)
- [4. EventBus — internals](#4-eventbus--internals)
  - [Two dispatch channels](#two-dispatch-channels)
  - [Saga discovery (`setupSagas()` in `onModuleInit`)](#saga-discovery-setupsagas-in-onmoduleinit)
  - [Saga-to-CommandBus wiring](#saga-to-commandbus-wiring)
  - [`OnModuleDestroy` cleanup](#onmoduledestroy-cleanup)
- [5. Module wiring](#5-module-wiring)
  - [`EventModule.forRoot(options)`](#eventmoduleforrootoptions)
  - [`CqrsModule.forRoot(options)`](#cqrsmoduleforrootoptions)
- [6. Reflect metadata keys](#6-reflect-metadata-keys)
- [7. Common pitfalls (implementation perspective)](#7-common-pitfalls-implementation-perspective)

---

## File map

```
lib/ddd/
├── type.ts                   # Identifier, Primitive, KeyPart, CompositeKey
├── entity.ts                 # Entity<T> — identity + equality
├── aggregate-root.ts         # AggregateRoot<T> — event collection
├── value-object.ts           # ValueObject — abstract equality
├── domain-event.ts           # DomainEvent interface
├── domain-event.decorator.ts # @Event(), @EventHandler(), getEventName()
├── domain-service.ts         # DomainService — guard() helper
├── common/
│   ├── metadata.ts           # Reflect metadata key constants
│   └── event-bus.type.ts     # CommandBusLike, IEventBus, ISaga, DomainEventHandler
├── abstract-message-bus.ts   # Shared discovery + dispatch for CommandBus/QueryBus
├── command-bus.ts            # CommandBus + ICommand + ICommandHandler
├── query-bus.ts              # QueryBus + IQuery + IQueryHandler
├── event-bus.ts              # EventBus — EventEmitter2 adapter + RxJS Subject + sagas
├── cqrs.decorator.ts         # @CommandHandler, @QueryHandler, @Saga
├── event.module.ts           # EventModule.forRoot() — DynamicModule
├── cqrs.module.ts            # CqrsModule.forRoot() — DynamicModule
└── errors/ddd.errors.ts      # CommandHandlerNotFound, QueryHandlerNotFound
```

---

## 1. Domain primitives

### `Entity<T>` and `AggregateRoot<T>`

`Entity<T>` holds an immutable `_id: T` set in the constructor. The `id` getter and `getId()` method
both return `_id` (the getter exists for syntactic sugar; both are equivalent).

`equals()` compares by identity:
- If `_id` is a `CompositeKey`, delegates to `CompositeKey.equals()` (value-semantic comparison).
- Otherwise, uses `===` (reference equality for primitives/strings/UUIDs).

`AggregateRoot<T>` extends `Entity<T>` and adds an internal `events: DomainEvent[]` array:

```
AggregateRoot
 ├── addEvent(event)    — protected; appends to events[]
 └── pullEvents()       — public; copies events[], clears the array, returns the copy
```

**Why copy + clear in `pullEvents()`?**
The aggregate must not hold on to already-dispatched events. The copy + clear ensures that calling
`pullEvents()` a second time returns `[]`, not the same events again.

**Why `protected addEvent`?**
Domain invariants live inside the aggregate. External code should never inject events directly —
only the aggregate's own business methods call `addEvent`. The `protected` modifier enforces this
boundary at compile time.

---

### `CompositeKey<Parts>`

A value-object wrapper around a frozen tuple of identity parts. Used when an entity's identity
consists of multiple pieces (e.g. `[tenantId, userId]`).

```typescript
constructor(...parts: Parts) {
  this.parts = Object.freeze(parts);
}
```

`Object.freeze` makes the tuple immutable after construction.

`equals(other)` iterates positionally:
- If both parts at position `i` are `ValueObject` instances → delegates to `a.equals(b)`.
- Otherwise → strict `===`.

`toString(separator = ':')` joins parts. Symbols are converted via `String(sym)`. `ValueObject`
parts call `part.toString()`.

`unwrap()` returns the frozen tuple — useful when you need the raw parts.

---

### `ValueObject`

An abstract base with a single method: `abstract equals(other: this): boolean`.

The `this` parameter type means the implementation must compare against the same concrete subclass —
you cannot accidentally compare an `Email` with a `PhoneNumber` even though both extend `ValueObject`.

There is intentionally **no** `clone()`, `with()`, or mutation method. Value objects are replaced,
not mutated.

---

### `DomainService.guard(condition, message)`

A thin helper: `if (!condition) throw new Error(message)`. Subclasses call it in business methods
to enforce invariants without repeating the if/throw pattern.

The thrown error is a plain `Error`, not a `BaseError`. The aggregate or application service at
the boundary must catch it and re-throw as a typed `BadRequestError` / `ConflictError` if the
invariant violation should produce an HTTP response.

---

## 2. Domain events and the `@Event` decorator

### `@Event(name?)` and `getEventName()`

`@Event()` writes the event name into Reflect metadata on both the class constructor and its
prototype:

```typescript
const name = eventName || eventTarget.name;
Reflect.defineMetadata(EVENT_NAME_METADATA, name, eventTarget);        // on constructor
Reflect.defineMetadata(EVENT_NAME_METADATA, name, eventTarget.prototype); // on prototype
```

Writing to both targets ensures `getEventName()` can resolve the name from:
1. An instance (reads from `instance.constructor`).
2. The prototype directly.
3. The class itself.

`getEventName(eventOrClass)` has a three-step lookup:
1. `Reflect.getMetadata(..., instance.constructor)` — covers the common case of passing an instance.
2. `Reflect.getMetadata(..., eventOrClass)` — covers passing the class directly.
3. `Reflect.getMetadata(..., eventOrClass.prototype)` — covers passing an instance whose constructor
   was not resolvable.
4. Fallback to `constructor.name` or `name` property — graceful degradation for events without `@Event()`.

**Why default to class name?**
Decorator-less events work with a fallback. Explicit names (via `@Event('user.created')`) survive
minification and refactoring without breaking existing subscribers.

---

### `@EventHandler(eventClassOrName)`

A thin wrapper over NestJS's `@OnEvent(eventName)`:

```typescript
const eventName = typeof eventClassOrName === 'string'
  ? eventClassOrName
  : getEventName(eventClassOrName);
return OnEvent(eventName);
```

This means NestJS's `EventEmitterModule` registers the decorated method as a listener. The
`EventBus.publish()` method calls `eventEmitter.emitAsync(eventName, event)`, which triggers
all `@OnEvent(eventName)` listeners in the NestJS DI container automatically.

Developers do not need to manually subscribe — NestJS wires it at module startup.

---

## 3. CQRS buses: AbstractMessageBus

`CommandBus` and `QueryBus` both extend `AbstractMessageBus<TMessage>` and differ only in the
metadata key they pass to the constructor.

### Handler discovery (`onModuleInit` → `discover()`)

```
CqrsModule.forRoot()
  ├── imports: [EventModule.forRoot(), DiscoveryModule]
  └── providers: [CommandBus, QueryBus]

CommandBus(discoveryService) — OnModuleInit
  └── discover()
        │
        ├── discoveryService.getProviders()   ← official @nestjs/core public API
        │       returns InstanceWrapper[] for every provider in the container
        │
        └── for each wrapper:
              if (no instance || no metatype || already seen) → skip
              messageCtor = Reflect.getMetadata(COMMAND_HANDLER_METADATA, metatype)
              if (messageCtor found) → bind(instance, messageCtor)
```

**What is `metatype`?**
In NestJS, `wrapper.metatype` is the class constructor — the same value passed to
`@Injectable()`, `providers: [MyHandler]`. `Reflect.getMetadata(COMMAND_HANDLER_METADATA, metatype)`
reads what `@CommandHandler(CreateUserCommand)` wrote: the `CreateUserCommand` class.

**The `seen` set:**
Prevents duplicate-handler warnings when the same provider is registered under multiple tokens
(e.g. via `useExisting`). Both wrappers point to the same metatype; only the first is processed.

**Registry key:**
The `handlers` map is keyed by `Type<TMessage>` (the class constructor reference), not by
`constructor.name`. This means the map key is a stable object reference, not a string —
resistant to minification collisions. However, `execute()` looks up `(message as object).constructor`,
which IS affected by minification of the **message class** itself (not the handler). This is a
known limitation documented in the guides.

---

### Handler dispatch (`execute(message)`)

```typescript
async execute<TResult>(message: TMessage): Promise<TResult> {
  const ctor = (message as object).constructor as Type<TMessage>;
  const handler = this.handlers.get(ctor);

  if (!handler) {
    throw new NotFoundError({
      ...DddErrors.CommandHandlerNotFound,
      message: `... add @CommandHandler(${ctor.name}).`,
    });
  }

  return handler.execute(message) as TResult;
}
```

The lookup is O(1) (Map lookup by reference). The error message is intentionally actionable:
it names the missing decorator and the message class.

---

### Manual `bind(handler, messageCtor)`

The `bind()` method is public — you can register handlers programmatically without using the
decorator + discovery mechanism. This is useful for testing:

```typescript
const bus = new CommandBus(discoveryServiceMock);
bus.bind(myHandler, CreateUserCommand);
```

Calling `bind()` on an already-registered key logs a warning but overwrites — the last `bind`
wins. This is intentional for overriding handlers in tests.

---

## 4. EventBus — internals

The `EventBus` is more complex than the command/query buses. It has two independent dispatch
channels and manages the saga lifecycle.

### Two dispatch channels

```
EventBus.publish(event)
    │
    ├── 1. eventEmitter.emitAsync(eventName, event)
    │         NestJS EventEmitter2 — notifies all @EventHandler methods
    │         awaited serially by EventEmitter2 when using emitAsync
    │
    └── 2. subject$.next(event)
              RxJS Subject — feeds the saga stream
              observed by all registered saga observables
```

**Why two channels?**
- `EventEmitter2` is the primary channel for normal event handlers decorated with `@EventHandler`.
  NestJS wires these automatically; no manual subscription needed.
- The RxJS `Subject` feeds saga streams. Sagas need RxJS operators (filter, map, debounce, etc.)
  which EventEmitter2 does not provide.

These channels are independent: a failure in an `@EventHandler` does not affect saga processing,
and vice versa.

---

### Saga discovery (`setupSagas()` in `onModuleInit`)

```
EventBus.onModuleInit()
  └── setupSagas()
        │
        ├── discoveryService.getProviders()     ← scan the DI container
        └── for each provider instance:
              for each method/property name on instance + prototype:
                if Reflect.getMetadata(SAGA_METADATA, instance, methodName):
                  candidate = instance[methodName]
                  if typeof candidate === 'function':
                    registerSaga(candidate.bind(instance))
                    logger.log("Registered saga: ClassName.methodName")
```

**Why scan both `Object.getOwnPropertyNames(prototype)` AND `Object.getOwnPropertyNames(instance)`?**

- Regular methods live on the prototype.
- Arrow-function properties (`onUserCreated = (events$) => ...`) are **own properties on the
  instance** (set by the constructor), not on the prototype.

The decorator `@Saga()` writes `SAGA_METADATA` on `(target, propertyKey)` where `target` is the
**prototype** for both methods and properties (TypeScript property decorators always receive the
prototype as `target`). But the actual function is either on the prototype (regular method) or on
the instance (arrow property). That is why discovery:
1. Reads metadata from the **prototype** (where the decorator wrote it).
2. Accesses the function from the **instance** (where arrow properties live).

The `.bind(instance)` call is critical for arrow properties: it ensures `this` inside the saga
function always refers to the class instance.

---

### Saga-to-CommandBus wiring

```
CqrsModule.onModuleInit()
  └── if (eventBus && commandBus):
        eventBus.setCommandBus(commandBus)

EventBus.setCommandBus(commandBus)
  ├── this.commandBus = commandBus
  └── connectSagasToCommandBus()
        └── for each saga not yet connected:
              const command$ = saga(this.subject$)   ← saga observes the RxJS stream
              sub = command$.subscribe({
                next: (command) => commandBus.execute(command)
                error: (err)   => logger.error(...)   ← error LOGGED, stream not killed
              })
              connectedSagas.add(saga)
              subscriptions.push(sub)
```

**The `connectedSagas` Set:** prevents double-wiring if `setCommandBus` is called again after
new sagas are registered dynamically.

**Error handling in saga subscriptions:** An error inside a saga observable is **caught and
logged** — the subscription does not unsubscribe. However, if the saga observable itself errors
out (not just emits an error), the subscription is terminated for that saga. Use `catchError`
+ `EMPTY` in your saga if you need resilience:

```typescript
@Saga()
onUserCreated = (events$: Observable<DomainEvent>): Observable<ICommand> => {
  return events$.pipe(
    filter(e => e instanceof UserCreatedEvent),
    map(e => new CreateWelcomeOrderCommand(e.userId)),
    catchError((err, caught) => {
      this.logger.error('Saga error', err);
      return caught; // resubscribe
    }),
  );
};
```

---

### `OnModuleDestroy` cleanup

```typescript
onModuleDestroy(): void {
  for (const sub of this.subscriptions) sub.unsubscribe();
  this.subscriptions.length = 0;
  this.subject$.complete();
}
```

Completing the subject signals all saga observables that the stream is done — they clean up their
own internal subscriptions. The `subscriptions` array is cleared to release handler/saga references.

---

## 5. Module wiring

### `EventModule.forRoot(options)`

```
EventModule.forRoot()
  imports:
    DiscoveryModule          ← provides DiscoveryService for saga discovery
    EventEmitterModule.forRoot(options)  ← NestJS EventEmitter2 singleton
  providers:
    EventBus                 ← depends on EventEmitter2 and DiscoveryService
  exports:
    EventBus
  global: true               ← EventBus is available everywhere without re-importing
```

The `options` passed to `EventModule.forRoot()` map directly to `EventEmitter2` options
(wildcard, delimiter, maxListeners, etc.).

---

### `CqrsModule.forRoot(options)`

```
CqrsModule.forRoot(options)
  options defaults: { events: true, commands: true, queries: true }
  imports:
    EventModule.forRoot(options)   ← NOT EventEmitterModule — prevents double-init
    DiscoveryModule
  providers:
    CommandBus (if commands)
    QueryBus   (if queries)
  exports:
    CommandBus, QueryBus
  implements OnModuleInit:
    eventBus.setCommandBus(commandBus)  ← wires sagas to command dispatch
```

**Why does `CqrsModule` import `EventModule` instead of `EventEmitterModule` directly?**
If `CqrsModule` imported `EventEmitterModule.forRoot()` directly, and an application had already
imported `EventModule.forRoot()`, there would be two `EventEmitter2` instances. Buses registered
on one instance would never fire on the other. By always importing `EventModule.forRoot()`, and
because `EventModule` is `@Global()`, NestJS deduplicates the import — the same `EventEmitter2`
instance is reused everywhere.

---

## 6. Reflect metadata keys

All metadata keys are defined in `lib/ddd/common/metadata.ts`:

| Constant | Value | Written by | Read by |
|---|---|---|---|
| `COMMAND_HANDLER_METADATA` | `'command_handler_metadata'` | `@CommandHandler` | `AbstractMessageBus.discover()` |
| `QUERY_HANDLER_METADATA` | `'query_handler_metadata'` | `@QueryHandler` | `AbstractMessageBus.discover()` |
| `SAGA_METADATA` | `'saga_metadata'` | `@Saga()` | `EventBus.setupSagas()` |
| `EVENT_NAME_METADATA` | `Symbol(...)` | `@Event()` | `getEventName()`, `@EventHandler()` |

Using a `Symbol` for `EVENT_NAME_METADATA` prevents collisions with third-party metadata.
The command/query/saga keys use plain strings for historical compatibility.

---

## 7. Common pitfalls (implementation perspective)

### Double `CqrsModule` import creates a second EventBus

Because `EventModule` is `@Global()`, a second import is a no-op — NestJS skips it.
But if you somehow created a second `EventBus` provider in a non-global context, `CommandBus`
would call `setCommandBus` on the global one, while the second `EventBus` would never have a
`commandBus` set. Saga commands dispatched through the second bus would silently fail.

**Fix:** never re-declare `EventBus` as a provider outside of `EventModule`. Import `CqrsModule`
only in `AppModule`.

### Arrow saga must be a property, not a method

As explained in the saga discovery section, the decorator writes metadata on the prototype.
The function itself must be accessible as an instance property for `registerSaga(fn.bind(instance))`
to work. Regular methods work too since they are on the prototype and can be accessed from
`Object.getOwnPropertyNames(prototype)`, but `this` binding may cause issues if the method
reads `this.someService`. Arrow properties avoid this: the closure always captures the correct
instance.

### `pullEvents()` on a reconstituted aggregate returns stale events

Only call `pullEvents()` on aggregates that just had write operations performed. Calling it on a
reconstituted (loaded-from-DB) aggregate that had no domain operations returns `[]`, which is correct.
But if you accidentally call a mutating method on a reconstituted aggregate (loaded for read-only
queries), `pullEvents()` will return events that should not be published.

**Recommendation:** only call `pullEvents()` in command handlers, never in query handlers.
