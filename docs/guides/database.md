# Database (`@xlr8-nest/core/database`)

Provides a TypeORM-backed `IUnitOfWork` abstraction, migration and seeder orchestration, and factory helpers — registered through a single `DatabaseExtensionModule`.

**When to use:** any NestJS service that needs PostgreSQL (or MySQL/SQLite) access with first-class transaction support, schema migrations, and optional seed data for local development or tests.

---

## Table of Contents

- [Quick start](#quick-start)
  - [1. Register the module](#1-register-the-module)
  - [2. Inject and use `IUnitOfWork`](#2-inject-and-use-iunitofwork)
- [Core concepts](#core-concepts)
  - [`IUnitOfWork`](#iunitofwork)
  - [Inject decorators](#inject-decorators)
- [`DatabaseModuleConfig` reference](#databasemoduleconfig-reference)
- [`BaseOrm` — entity partial-construction](#baseorm--entity-partial-construction)
- [Unified config (`defineConfig` / `toDatabaseModuleConfig`)](#unified-config-defineconfig--todatabasemoduleconfig)
- [Migrations](#migrations)
  - [Enable and configure](#enable-and-configure)
  - [CLI commands](#cli-commands)
  - [Injecting `MigrationService` programmatically](#injecting-migrationservice-programmatically)
- [Seeders](#seeders)
  - [Define a seeder](#define-a-seeder)
  - [Register seeders](#register-seeders)
  - [Run via CLI](#run-via-cli)
- [`BaseFactory` — test and seed data](#basefactory--test-and-seed-data)
  - [Define a factory](#define-a-factory)
  - [Use in a seeder](#use-in-a-seeder)
  - [Use in tests](#use-in-tests)
- [Patterns and recipes](#patterns-and-recipes)
- [Gotchas](#gotchas)
- [See also](#see-also)

---

## Quick start

### 1. Register the module

**Static registration** — use when your database credentials are in `process.env` or a plain config object at import time.

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { DatabaseExtensionModule } from '@xlr8-nest/core/database';
import { DatabaseType } from '@xlr8-nest/core/database';
import { UserOrm } from './users/user.orm';

@Module({
  imports: [
    DatabaseExtensionModule.register({
      connection: {
        type: DatabaseType.POSTGRES,
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASS ?? 'postgres',
        database: process.env.DB_NAME ?? 'app',
      },
      entities: [UserOrm],
    }),
  ],
})
export class AppModule {}
```

**Async registration** — use when credentials come from `ConfigService` or another async provider.

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseExtensionModule, DatabaseType } from '@xlr8-nest/core/database';
import { UserOrm } from './users/user.orm';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseExtensionModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          type: DatabaseType.POSTGRES,
          host: config.get<string>('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USER'),
          password: config.get<string>('DB_PASS'),
          database: config.get<string>('DB_NAME'),
        },
        entities: [UserOrm],
      }),
      migration: true, // explicitly opt in to MigrationService
    }),
  ],
})
export class AppModule {}
```

Both forms register `TypeOrmModule` internally and export `IUnitOfWorkToken` globally by default (`global = true`).

### 2. Inject and use `IUnitOfWork`

```typescript
// src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { InjectUnitOfWork, IUnitOfWork } from '@xlr8-nest/core/database';
import { NotFoundError } from '@xlr8-nest/core/errors';
import { UserOrm } from './user.orm';
import { USER_ERRORS } from './errors/user.errors';

@Injectable()
export class UsersService {
  constructor(
    @InjectUnitOfWork() private readonly uow: IUnitOfWork,
  ) {}

  async findById(id: string): Promise<UserOrm> {
    const user = await this.uow.manager.findOne(UserOrm, { where: { id } });
    if (!user) throw new NotFoundError(USER_ERRORS.USER_NOT_FOUND);
    return user;
  }

  async transfer(fromId: string, toId: string, amount: number): Promise<void> {
    await this.uow.transaction(async () => {
      // uow.manager is now the transactional EntityManager
      const from = await this.uow.manager.findOneOrFail(UserOrm, { where: { id: fromId } });
      const to   = await this.uow.manager.findOneOrFail(UserOrm, { where: { id: toId } });
      from.balance -= amount;
      to.balance   += amount;
      await this.uow.manager.save([from, to]);
    });
  }
}
```

---

## Core concepts

### `IUnitOfWork`

The interface has exactly two members:

```typescript
interface IUnitOfWork {
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  readonly manager: EntityManager;
}
```

| Member | Outside a transaction | Inside `transaction()` callback |
|---|---|---|
| `manager` | `DataSource.manager` (no transaction) | Transactional `EntityManager` tied to the active `QueryRunner` |
| `transaction(fn)` | Starts a new transaction | (avoid nesting — behaviour is undefined) |

`AsyncLocalStorage` propagates the active `QueryRunner` automatically. Every nested call to `uow.manager` inside the callback uses the same transaction without you passing the manager around.

**There is no `getRepository()`, no `commit()`, no `rollback()`.** The transaction commits when `fn` resolves and rolls back when `fn` throws.

### Inject decorators

`@InjectUnitOfWork()` is the canonical injection decorator. `@UnitOfWork()` is an alias — both resolve to `IUnitOfWorkToken`.

```typescript
// Preferred
@InjectUnitOfWork() private readonly uow: IUnitOfWork

// Alias — identical runtime behaviour
@UnitOfWork() private readonly uow: IUnitOfWork
```

Never inject `TypeOrmClient` directly. The concrete class is an implementation detail; inject the interface token so tests can substitute a fake.

### `TypeOrmClient`

`TypeOrmClient` is the concrete implementation of `IUnitOfWork`. Two notes:

- `.manager` — current transactional `EntityManager`, or `DataSource.manager` outside a transaction.
- `.client` — **deprecated alias** for `.manager`. Do not use in new code.

---

## `DatabaseModuleConfig` reference

```typescript
interface DatabaseModuleConfig {
  connection: DatabaseConnectionConfig;   // required
  entities:   EntityDefinition[];         // required — class array or glob strings
  migration?: MigrationConfig;            // optional
  seeder?:    SeederConfig;               // optional
}
```

Full example with all options:

```typescript
import {
  DatabaseExtensionModule,
  DatabaseType,
  DatabaseModuleConfig,
} from '@xlr8-nest/core/database';
import { UserOrm } from './users/user.orm';
import { RoleOrm } from './roles/role.orm';
import { UserSeeder } from './database/seeders/user.seeder';

const config: DatabaseModuleConfig = {
  connection: {
    type: DatabaseType.POSTGRES,
    host: 'localhost',
    port: 5432,
    username: 'app',
    password: 'secret',
    database: 'appdb',
    synchronize: false,     // never true in production
    logging: ['error', 'warn'],
  },
  entities: [UserOrm, RoleOrm],
  migration: {
    enabled: true,
    migrationsPath: 'src/database/migrations',
    tableName: 'migrations',   // default
    autoRun: false,            // set true to migrate on boot
  },
  seeder: {
    enabled: true,
    seeds: [UserSeeder],
    autoRun: false,
  },
};

DatabaseExtensionModule.register(config);
```

---

## `BaseOrm` — entity partial-construction

Extend `BaseOrm<T>` to get a partial-construction constructor in every TypeORM entity. This simplifies adapter methods (`toOrm`, `toDomain`) without writing boilerplate assignment code.

```typescript
// src/users/user.orm.ts
import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';
import { BaseOrm } from '@xlr8-nest/core/database';

@Entity('users')
export class UserOrm extends BaseOrm<UserOrm> {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

Adapter usage — build ORM rows from domain objects without listing every field:

```typescript
// src/users/user.adapter.ts
import { UserOrm } from './user.orm';
import { User } from '../domain/user.entity';

export function toOrm(user: User): UserOrm {
  return new UserOrm({ id: user.id, email: user.email, name: user.name });
}

export function toDomain(row: UserOrm): User {
  return new User({ id: row.id, email: row.email, name: row.name });
}
```

`BaseOrm` adds no columns. Every `@Column`, `@PrimaryColumn`, and lifecycle decorator belongs to the subclass so each table controls its own shape.

---

## Unified config (`defineConfig` / `toDatabaseModuleConfig`)

Keep one config object shared between the NestJS module and the TypeORM CLI so connection settings are never duplicated.

```typescript
// src/database/database.config.ts
import {
  defineConfig,
  toDatabaseModuleConfig,
  createDataSource,
  DatabaseType,
} from '@xlr8-nest/core/database';
import { UserOrm } from '../users/user.orm';
import { UserSeeder } from './seeders/user.seeder';

export const unifiedConfig = defineConfig({
  connection: {
    type: DatabaseType.POSTGRES,
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? 'postgres',
    database: process.env.DB_NAME ?? 'app',
  },
  entities: [UserOrm],
  migrations: ['src/database/migrations/**/*.{ts,js}'],
  seeds: [UserSeeder],
  migrationsTableName: 'migrations',
});

// For NestJS module:
export const dbModuleConfig = toDatabaseModuleConfig(unifiedConfig, {
  migrationEnabled: true,
  migrationAutoRun: false,
  seederEnabled: true,
  seederAutoRun: false,
});

// For TypeORM CLI (data-source.ts):
export const AppDataSource = createDataSource(unifiedConfig);
```

```typescript
// src/app.module.ts
import { DatabaseExtensionModule } from '@xlr8-nest/core/database';
import { dbModuleConfig } from './database/database.config';

DatabaseExtensionModule.register(dbModuleConfig)
```

```typescript
// data-source.ts  (used by typeorm CLI)
export { AppDataSource } from './src/database/database.config';
```

---

## Migrations

### Enable and configure

```typescript
migration: {
  enabled: true,
  migrationsPath: 'src/database/migrations',
  tableName: 'migrations',
  autoRun: false,        // true → run on module init; throws on failure
}
```

Set `autoRun: true` to apply pending migrations automatically at application startup. The app refuses to boot if any migration fails — this is intentional.

> **Caution:** do not set `autoRun: true` on more than one replica behind a load balancer. There is no distributed lock. Run migrations from a separate deploy step or a dedicated migration job.

### CLI commands

```bash
# Run pending migrations
npm run cli -- migration run

# Revert the last migration
npm run cli -- migration revert

# Generate a migration from entity diff
npm run cli -- migration generate AddUserPhoneColumn

# Create an empty migration skeleton
npm run cli -- migration create AddIndexOnEmail

# Show migration status
npm run cli -- migration status
```

### Injecting `MigrationService` programmatically

```typescript
import { Injectable } from '@nestjs/common';
import { MigrationService } from '@xlr8-nest/core/database';

@Injectable()
export class AppHealthService {
  constructor(private readonly migrations: MigrationService) {}

  async isReady(): Promise<boolean> {
    return !(await this.migrations.hasPendingMigrations());
  }
}
```

`MigrationService` is only available when `migration.enabled = true` (static) or `migration: true` (async). Attempting to inject it without enabling migrations throws a NestJS provider-not-found error at startup.

---

## Seeders

### Define a seeder

```typescript
// src/database/seeders/user.seeder.ts
import { BaseSeeder } from '@xlr8-nest/core/database';
import { UserOrm } from '../../users/user.orm';

export class UserSeeder extends BaseSeeder {
  async run(): Promise<void> {
    await this.clearTable('users');

    await this.manager.save(UserOrm, [
      { id: '1', email: 'admin@example.com', name: 'Admin' },
      { id: '2', email: 'user@example.com',  name: 'Regular User' },
    ]);
  }
}
```

Key rules:
- `run()` takes **no parameters**. Use `this.manager` to access the database and `this.clearTable(tableName)` to truncate before inserting.
- `clearTable` validates the table name as a safe SQL identifier and uses `TRUNCATE ... CASCADE`. It does not wrap in a transaction itself.
- `disableForeignKeyChecks()` / `enableForeignKeyChecks()` are available for PostgreSQL deferred constraints.

### Register seeders

```typescript
seeder: {
  enabled: true,
  seeds: [RoleSeeder, UserSeeder],   // order matters — runs top-to-bottom
  autoRun: false,
}
```

### Run via CLI

```bash
# Run all configured seeders
npm run cli -- seed run
```

---

## `BaseFactory` — test and seed data

Use `BaseFactory<T>` for generating realistic entity instances in tests and seeders.

### Define a factory

```typescript
// src/database/factories/user.factory.ts
import { DataSource } from 'typeorm';
import { BaseFactory } from '@xlr8-nest/core/database';
import { UserOrm } from '../../users/user.orm';

export class UserFactory extends BaseFactory<UserOrm> {
  constructor(dataSource: DataSource) {
    super(dataSource, UserOrm);
  }

  protected definition(): Partial<UserOrm> {
    return {
      id:    this.faker.string.uuid(),
      email: this.faker.internet.email(),
      name:  this.faker.person.fullName(),
    };
  }
}
```

### Use in a seeder

```typescript
import { BaseSeeder } from '@xlr8-nest/core/database';
import { UserFactory } from '../factories/user.factory';

export class UserSeeder extends BaseSeeder {
  async run(): Promise<void> {
    await this.clearTable('users');
    const factory = new UserFactory(this.dataSource);
    await factory.createMany(20);
    await factory.create({ email: 'admin@example.com', name: 'Admin' });
  }
}
```

### Use in tests

```typescript
// test/users.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { UserFactory } from '../src/database/factories/user.factory';

describe('UsersController (e2e)', () => {
  let factory: UserFactory;

  beforeAll(async () => {
    const app = await Test.createTestingModule({ ... }).compile();
    const dataSource = app.get(getDataSourceToken());
    factory = new UserFactory(dataSource);
  });

  it('GET /users/:id returns the user', async () => {
    const user = await factory.create({ email: 'test@example.com' });
    // ... assert
  });
});
```

| Method | Persisted | Description |
|---|---|---|
| `make(overrides?)` | No | Build an entity instance |
| `makeMany(n, overrides?)` | No | Build `n` instances |
| `create(overrides?)` | Yes | Build and `save` one entity |
| `createMany(n, overrides?)` | Yes | Build and `save` `n` entities |
| `createEach(items[])` | Yes | Build and `save` each with distinct overrides |

---

## Patterns and recipes

### Sharing `uow.manager` with a repository class

```typescript
// src/users/users.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectUnitOfWork, IUnitOfWork } from '@xlr8-nest/core/database';
import { UserOrm } from './user.orm';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectUnitOfWork() private readonly uow: IUnitOfWork,
  ) {}

  findById(id: string) {
    return this.uow.manager.findOne(UserOrm, { where: { id } });
  }

  save(user: UserOrm) {
    return this.uow.manager.save(UserOrm, user);
  }
}
```

Because `uow.manager` switches to the transactional manager automatically when inside a `transaction()` callback, this repository participates in the caller's transaction with no extra plumbing.

### Seeding with FK-dependent tables

```typescript
export class OrderSeeder extends BaseSeeder {
  async run(): Promise<void> {
    await this.disableForeignKeyChecks();
    await this.clearTable('order_items');
    await this.clearTable('orders');
    // insert orders then items...
    await this.enableForeignKeyChecks();
  }
}
```

---

## Gotchas

**`IUnitOfWork` has no `getRepository()` and no `commit()`.**
That is the old TypeORM API. Always use `uow.manager.find(...)`, `uow.manager.save(...)`, etc. There is no explicit commit call — the transaction commits when your callback returns successfully.

**`seeder.run()` takes no parameters.**
The signature is `run(): Promise<void>`. Do not attempt to pass a manager or DataSource — use `this.manager` and `this.dataSource` (inherited from `BaseSeeder`).

**`autoRun: true` runs on every replica.**
The module calls `runMigrations()` / `runSeeders()` in `onModuleInit`. There is no distributed lock. If you deploy multiple instances simultaneously you will hit race conditions on the migrations table. Run migrations as a separate step (init container, pre-deploy job, or `npm run cli -- migration run`) rather than relying on `autoRun` in production clusters.

**`registerAsync` requires explicit `migration` / `seeder` flags.**
Unlike `register()`, the async variant cannot inspect the factory return value at module construction time. Pass `migration: true` or `seeder: true` in the options object to enable those services, or `MigrationService` and `SeederService` will not be registered.

**`TypeOrmClient.client` is deprecated.**
Use `.manager`. The `.client` getter is kept for backward compatibility and will be removed in a future major version.

**`synchronize: true` destroys data in production.**
The field is on `DatabaseConnectionConfig` and passes directly to TypeORM. Leave it `false` (the default) and use migrations instead.

**Entity glob patterns may not resolve on Windows.**
The module sets `autoLoadEntities: true` on the underlying `TypeOrmModule`, so entities registered via `TypeOrmModule.forFeature()` are always picked up. Prefer class references over glob strings in `entities: [UserOrm, RoleOrm]` to avoid cross-platform issues.

---

## See also

- [Errors guide](./errors.md) — throw typed errors from service methods that operate on `uow.manager`
- [Response guide](./response.md) — `GlobalExceptionFilter` and `buildSuccessResponse`
- [API Reference — database section](../api-reference.md)
