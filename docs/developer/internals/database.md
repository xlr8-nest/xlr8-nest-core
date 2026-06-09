# Internals: Database (`lib/database`)

How `TypeOrmClient` creates an ambient transaction context using `AsyncLocalStorage`,
how `DatabaseExtensionModule` composes the TypeORM and library providers,
and how the migration/seeder infrastructure is wired.

---

## Table of Contents

- [File map](#file-map)
- [1. `IUnitOfWork` — the interface contract](#1-iunitofwork--the-interface-contract)
- [2. `TypeOrmClient` — `AsyncLocalStorage` as ambient context](#2-typeormclient--asynclocalstorage-as-ambient-context)
- [3. Repository pattern integration](#3-repository-pattern-integration)
- [4. `@InjectUnitOfWork()` and `@UnitOfWork()` decorators](#4-injectunitofwork-and-unitofwork-decorators)
- [5. `DatabaseExtensionModule` — DynamicModule wiring](#5-databaseextensionmodule--dynamicmodule-wiring)
  - [`register(config, global?)`](#registerconfig-global)
  - [`buildTypeOrmOptions(config)` — internal config adapter](#buildtypeormoptionsconfig--internal-config-adapter)
  - [`registerAsync(options)`](#registerasyncoptions)
- [6. `MigrationService` internals](#6-migrationservice-internals)
- [7. `SeederService` internals](#7-seederservice-internals)
- [8. `BaseFactory<Entity>` — test data factories](#8-basefactoryentity--test-data-factories)
- [9. `BaseOrm<T>` — partial constructor for ORM entities](#9-baseormt--partial-constructor-for-orm-entities)

---

## File map

```
lib/database/
├── database-extension.module.ts     # DatabaseExtensionModule.register() / registerAsync()
├── constants/
│   └── database.constants.ts        # DATABASE_MODULE_CONFIG (Symbol)
├── types/
│   ├── database-config.interface.ts # DatabaseModuleConfig, DatabaseConnectionConfig, ...
│   ├── seeder.interface.ts          # Seeder interface, SeederOptions
│   └── uow.type.ts                  # IUnitOfWork interface, IUnitOfWorkToken
├── providers/
│   └── typeorm-client.provider.ts   # TypeOrmClient (IUnitOfWork implementation)
├── decorators/
│   └── uow.decorator.ts             # @InjectUnitOfWork / @UnitOfWork
├── services/
│   ├── migration.service.ts         # MigrationService
│   └── seeder.service.ts            # SeederService
├── helpers/
│   ├── base-orm.ts                  # BaseOrm<T> (partial constructor)
│   ├── base-seeder.ts               # BaseSeeder (extends Seeder)
│   ├── base-factory.ts              # BaseFactory<Entity> (Faker-based test factories)
│   └── config-builder.ts            # createDataSource(), toDatabaseModuleConfig(), defineConfig()
├── commands/
│   ├── migration.command.ts         # MigrationCommandRunner (nest-commander CLI)
│   └── seeder.command.ts            # SeederCommandRunner (nest-commander CLI)
└── utils/
    ├── migration.util.ts            # Migration generation utilities
    └── string.util.ts               # assertSafeIdentifier()
```

---

## 1. `IUnitOfWork` — the interface contract

```typescript
interface IUnitOfWork {
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  readonly manager: EntityManager;
}
```

`transaction(fn)` begins a database transaction, runs `fn`, commits on success, rolls back on
any thrown error, and always releases the connection.

`manager` returns the active `EntityManager`. Inside a `transaction()` callback this is the
transactional manager. Outside it is the `DataSource`'s default manager.

**Why `manager` and not `getManager()`?**
A getter feels more natural for a property that represents the "current" transaction state.
It also aligns with TypeORM's own `DataSource.manager` convention.

---

## 2. `TypeOrmClient` — `AsyncLocalStorage` as ambient context

The central mechanism that makes UoW work without threading parameters through every repository:

```typescript
@Injectable()
export class TypeOrmClient implements IUnitOfWork {
  private asyncLocalStorage = new AsyncLocalStorage<QueryRunner>();

  constructor(private readonly dataSource: DataSource) {}

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      return await this.asyncLocalStorage.run(queryRunner, async () => {
        try {
          const result = await fn();
          await queryRunner.commitTransaction();
          return result;
        } catch (error) {
          await queryRunner.rollbackTransaction();
          throw error;
        }
      });
    } finally {
      await queryRunner.release();
    }
  }

  get manager(): EntityManager {
    const queryRunner = this.asyncLocalStorage.getStore();
    return queryRunner ? queryRunner.manager : this.dataSource.manager;
  }
}
```

### How `AsyncLocalStorage` works here

`AsyncLocalStorage<T>` is Node.js's async-context API (similar to thread-local storage in other
languages). `als.run(value, callback)` stores `value` in a context that is visible to any async
operation initiated within `callback` — including `await`, `Promise.then`, `setTimeout`, and
NestJS interceptors.

```
transaction(fn)
  │
  ├── createQueryRunner() + connect() + startTransaction()
  │
  └── asyncLocalStorage.run(queryRunner, async () => {
        ┌─────────────────────────────────────────────────────────┐
        │  ASYNC CONTEXT: asyncLocalStorage.getStore() === qr    │
        │                                                          │
        │  fn()                                                    │
        │   └── userRepo.save(user)                               │
        │         └── uow.manager ← getStore() → qr.manager      │
        │   └── orderRepo.save(order)                             │
        │         └── uow.manager ← getStore() → qr.manager      │
        │                                                          │
        │  commit / rollback                                       │
        └─────────────────────────────────────────────────────────┘
      })
```

Any code that calls `this.uow.manager` while inside the `asyncLocalStorage.run()` context
automatically receives the transactional `EntityManager` — without any parameter being passed.

### Outside a transaction

When `manager` is accessed outside a `transaction()` call, `getStore()` returns `undefined`
(no context active). The fallback is `this.dataSource.manager` — the global/default manager
that auto-commits each operation.

### Re-entrant transactions

If `transaction()` is called while already inside another `transaction()` call (nested/re-entrant),
**a new independent `QueryRunner` is created**. There is no join, no savepoint. The inner
transaction commits/rolls back independently.

This is a known limitation. If you need savepoints or nested transactions, you must manage them
manually via the TypeORM `QueryRunner` API.

---

## 3. Repository pattern integration

Repositories inject `TypeOrmClient` (via `IUnitOfWorkToken`) and use `this.uow.manager` to
perform all operations:

```typescript
@Injectable()
export class UserRepository {
  constructor(
    @InjectUnitOfWork() private readonly uow: IUnitOfWork,
  ) {}

  save(user: User): Promise<UserOrm> {
    return this.uow.manager.save(UserOrm, toOrm(user));
  }

  findById(id: string): Promise<UserOrm | null> {
    return this.uow.manager.findOneBy(UserOrm, { id });
  }
}
```

Because `manager` reads from `AsyncLocalStorage`, the repository needs no awareness of whether
it is inside a transaction. The same repository method works both inside and outside a transaction:
- Inside: uses the transactional manager (same connection, same transaction).
- Outside: uses the default manager (auto-commits).

---

## 4. `@InjectUnitOfWork()` and `@UnitOfWork()` decorators

Both are thin wrappers over NestJS's `@Inject(IUnitOfWorkToken)`:

```typescript
export const InjectUnitOfWork = (): ParameterDecorator => Inject(IUnitOfWorkToken);
export const UnitOfWork = (): ParameterDecorator => Inject(IUnitOfWorkToken);
```

`IUnitOfWorkToken` is a `Symbol`:
```typescript
export const IUnitOfWorkToken = Symbol('IUnitOfWork');
```

Using a Symbol prevents string-token collisions if multiple libraries register UoW tokens.

---

## 5. `DatabaseExtensionModule` — DynamicModule wiring

### `register(config, global?)`

```
DatabaseExtensionModule.register(config)
  imports:
    TypeOrmModule.forRoot(buildTypeOrmOptions(config))  ← registers DataSource
  providers:
    DATABASE_MODULE_CONFIG: config (useValue)
    TypeOrmClient                                       ← depends on DataSource
    { provide: IUnitOfWorkToken, useExisting: TypeOrmClient }
    (if migration.enabled): MigrationService, MigrationCommandRunner
    (if seeder.enabled):    SeederService,   SeederCommandRunner
  exports:
    IUnitOfWorkToken, TypeOrmClient, MigrationService, SeederService, ...
  global: true (default)
  implements OnModuleInit:
    if (config.migration.autoRun) → migrationService.runMigrations()
    if (config.seeder.autoRun)    → seederService.runSeeders()
```

**Why `useExisting` for `IUnitOfWorkToken`?**
`TypeOrmClient` is a regular provider. `IUnitOfWorkToken` is an alias pointing to the same instance.
This lets consumer code inject `@InjectUnitOfWork() uow: IUnitOfWork` (typed against the interface)
without knowing about `TypeOrmClient`.

### `buildTypeOrmOptions(config)` — internal config adapter

```typescript
private static buildTypeOrmOptions(config: DatabaseModuleConfig): TypeOrmModuleOptions {
  return {
    type: config.connection.type,       // 'postgres', 'mysql', etc.
    host: config.connection.host,
    port: config.connection.port,
    ...
    autoLoadEntities: true,             // picks up entities added via TypeOrmModule.forFeature()
    entities: config.entities,          // explicit entity list / globs
    synchronize: config.connection.synchronize ?? false,
    logging: config.connection.logging ?? false,
    migrations: migration.migrationsPath ? [`${path}/*.{ts,js}`] : undefined,
    migrationsTableName: migration.tableName || 'migrations',
  };
}
```

`autoLoadEntities: true` is always set, enabling the TypeORM feature that automatically
registers entities declared in feature modules via `TypeOrmModule.forFeature([...])`.

### `registerAsync(options)`

The async variant accepts a `useFactory` that returns `DatabaseModuleConfig`. The factory is
used for both:
1. The `DATABASE_MODULE_CONFIG` provider.
2. `TypeOrmModule.forRootAsync({ useFactory: async (...) => buildTypeOrmOptions(config) })`.

This ensures TypeORM itself is also configured asynchronously (e.g. loading credentials from a
`ConfigService` or `SecretsManager`).

---

## 6. `MigrationService` internals

`MigrationService` is a thin facade over TypeORM's `DataSource` migration API:

| Method | TypeORM call | Notes |
|---|---|---|
| `runMigrations()` | `dataSource.runMigrations()` | Runs all pending migrations |
| `revertMigration()` | `dataSource.undoLastMigration()` | Reverts the last applied migration |
| `getPendingMigrations()` | `dataSource.showMigrations()` | Returns pending count (TypeORM limitation: no typed list) |
| `hasPendingMigrations()` | `dataSource.showMigrations()` | Returns boolean |
| `getExecutedMigrations()` | `dataSource.query(SELECT * FROM migrations)` | Raw query |
| `showStatus()` | `dataSource.showMigrations()` | Logs status |
| `generateMigration(name)` | `typeorm migration:generate` equivalent | Compares schema |
| `createMigration(name)` | `typeorm migration:create` equivalent | Empty migration template |

The CLI runner (`MigrationCommandRunner`) wraps `MigrationService` methods and maps them to
`nest-commander` subcommands: `migration:run`, `migration:revert`, `migration:status`, etc.

---

## 7. `SeederService` internals

`SeederService` runs seeder classes in a controlled order:

```typescript
async runSeeders(options?: SeederOptions): Promise<void> {
  const seeders = options?.only
    ? this.config.seeder.seeds.filter(s => options.only.includes(s.name))
    : this.config.seeder.seeds;

  const ordered = options?.order
    ? options.order.map(name => seeders.find(s => s.name === name)!).filter(Boolean)
    : seeders;

  for (const SeederClass of ordered) {
    const seeder = new SeederClass(this.dataSource);
    await seeder.run();
  }
}
```

Each seeder is instantiated with the `DataSource`. `BaseSeeder` exposes:
- `this.manager` — the DataSource's default manager (no transaction by default).
- `this.clearTable(tableName)` — truncates a table; calls `assertSafeIdentifier(tableName)` first
  to prevent SQL injection via table name.

The transaction modes (`all`, `each`, `none`) in `SeederOptions` are currently not fully
implemented — they are accepted but do not actually wrap seeders in transactions.

---

## 8. `BaseFactory<Entity>` — test data factories

`BaseFactory<Entity>` uses the Template Method pattern:

```typescript
abstract class BaseFactory<Entity> {
  protected readonly faker = faker;           // @faker-js/faker instance
  protected readonly repository: Repository<Entity>;

  abstract definition(): Partial<Entity> | Promise<Partial<Entity>>;

  async make(overrides?): Promise<Entity>   { ... }
  async makeMany(count, overrides?): ...    { ... }
  async create(overrides?): Promise<Entity> { ... }
  async createMany(count, overrides?): ...  { ... }
  async createEach(items): Promise<Entity[]>{ ... }
  async count(): Promise<number>            { ... }
  async clear(): Promise<void>              { ... }
  protected resetSeed(seed?): void          { ... }
}
```

**`make` vs `create`:** `make()` builds the entity object without persisting; `create()` calls
`repository.save()`. Use `make()` in unit tests (no DB); `create()` in integration tests.

**`definition()`:** The abstract method to override. Return a `Partial<Entity>` with faker-based
default values:

```typescript
protected async definition(): Promise<Partial<UserOrm>> {
  return {
    id: this.faker.string.uuid(),
    email: this.faker.internet.email(),
    name: this.faker.person.fullName(),
    createdAt: new Date(),
  };
}
```

**`resetSeed(seed?)`:** Resets faker's random seed for deterministic test output. Default seed
is `12345`.

---

## 9. `BaseOrm<T>` — partial constructor for ORM entities

```typescript
export abstract class BaseOrm<T> {
  constructor(partial?: Partial<T>) {
    if (partial) Object.assign(this, partial);
  }
}
```

Allows constructing TypeORM entities from partial data:

```typescript
@Entity('users')
export class UserOrm extends BaseOrm<UserOrm> {
  @PrimaryColumn() id: string;
  @Column() email: string;
}

const user = new UserOrm({ id: '123', email: 'a@b.com' });
```

Without `BaseOrm`, TypeORM entities have no-arg constructors and you must assign fields
individually after construction.
