# Messaging (`@xlr8-nest/core/messaging`)

Transactional outbox pattern: persist integration events inside your database transaction, then deliver them to a message broker asynchronously — guaranteeing at-least-once delivery without two-phase commit.

**When to use:** any time a command handler must emit cross-service events and you cannot afford to lose them on process crash or broker downtime.

---

## Quick start

### 1. Register MessagingModule

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { MessagingModule } from '@xlr8-nest/core/messaging';
import { TenantEventTranslator } from './tenants/tenant-event.translator';
import { KafkaMessagePublisher } from './infrastructure/kafka-message-publisher';

@Module({
  imports: [
    MessagingModule.forRoot({
      translators: [TenantEventTranslator],
      messagePublisher: KafkaMessagePublisher,
      worker: { pollIntervalMs: 3000, batchSize: 50 },
    }),
  ],
})
export class AppModule {}
```

`MessagingModule` is global by default — `OutboxPublisher` and `OutboxAdminService` are injectable everywhere without re-importing.

### 2. Define an IntegrationEvent

```typescript
// src/tenants/events/tenant-provisioned.event.ts
import { IntegrationEvent } from '@xlr8-nest/core/messaging';

export class TenantProvisionedEvent extends IntegrationEvent {
  readonly eventName = 'tenant.provisioned.v1';
  readonly aggregateType = 'Tenant';

  constructor(
    readonly aggregateId: string,
    readonly tenantName: string,
    readonly planId: string,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}
```

### 3. Write a translator

```typescript
// src/tenants/tenant-event.translator.ts
import { Injectable } from '@nestjs/common';
import { IDomainEventTranslator, IntegrationEvent } from '@xlr8-nest/core/messaging';
import type { DomainEvent } from '@xlr8-nest/core/messaging';
import { TenantProvisionedDomainEvent } from './domain-events/tenant-provisioned.domain-event';
import { TenantProvisionedEvent } from './events/tenant-provisioned.event';

@Injectable()
export class TenantEventTranslator implements IDomainEventTranslator {
  supports(eventName: string): boolean {
    return ['tenant.provisioned', 'tenant.suspended'].includes(eventName);
  }

  translate(event: DomainEvent): IntegrationEvent[] {
    if (event.eventName === 'tenant.provisioned') {
      const e = event as TenantProvisionedDomainEvent;
      return [
        new TenantProvisionedEvent(e.tenantId, e.tenantName, e.planId, e.occurredOn),
      ];
    }
    // tenant.suspended has no external consumers yet — skip it
    return [];
  }
}
```

### 4. Publish from a command handler

```typescript
// src/tenants/commands/provision-tenant.handler.ts
import { Injectable } from '@nestjs/common';
import { IUnitOfWork, IUnitOfWorkToken } from '@xlr8-nest/core/database';
import { OutboxPublisher } from '@xlr8-nest/core/messaging';
import { EventBus } from '@xlr8-nest/core/ddd';
import { TenantRepository } from '../tenant.repository';
import { ProvisionTenantCommand } from './provision-tenant.command';
import { Inject } from '@nestjs/common';

@Injectable()
export class ProvisionTenantHandler {
  constructor(
    @Inject(IUnitOfWorkToken) private readonly uow: IUnitOfWork,
    private readonly tenants: TenantRepository,
    private readonly outbox: OutboxPublisher,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: ProvisionTenantCommand): Promise<void> {
    // publishFrom MUST be inside the transaction — it writes outbox rows atomically with the aggregate save.
    // It returns the domain events so they can be dispatched to in-process listeners AFTER commit.
    const domainEvents = await this.uow.transaction(async () => {
      const tenant = Tenant.provision(cmd.id, cmd.name, cmd.planId);
      await this.tenants.save(tenant);                  // repository uses uow.manager internally
      return this.outbox.publishFrom(tenant);           // pulls events, translates, writes outbox row
    });

    // After commit: dispatch to in-process EventBus (logging, projectors, sagas)
    // Cross-service delivery is handled by OutboxWorker — do NOT publish to broker here.
    await this.eventBus.publishAll(domainEvents);
  }
}
```

`OutboxPublisher.publishFrom(aggregate)` calls `aggregate.pullEvents()` internally, translates each event via your registered translators, and inserts the outbox rows in the same transaction as your aggregate save. It returns the domain events so you can pass them to `EventBus.publishAll` **after** the transaction commits.

---

## How the outbox works

```
AggregateRoot.addEvent()
       ↓
 OutboxPublisher.publishFrom(aggregate)   ← calls pullEvents() internally, inside uow.transaction()
       ↓
  outbox_events row (status=PENDING)
       ↓  [committed to DB]
  OutboxWorker (polls every N ms)
       ↓  fetchDueBatch — FOR UPDATE SKIP LOCKED
  IMessagePublisher.publish()
       ↓  success → status=PUBLISHED
       ↓  failure → retryCount++, nextAttemptAt=now+backoff
                    after terminalFailureRetries → status=FAILED
```

The worker starts automatically on `OnModuleInit`. Multiple app instances share the same table — `FOR UPDATE SKIP LOCKED` ensures each row is processed by exactly one worker at a time.

---

## Core concepts

### IntegrationEvent

`IntegrationEvent` is the cross-service event contract. Subclass it and declare three abstract fields:

| Field | Type | Purpose |
|---|---|---|
| `eventName` | `string` | Stable, versioned event name (`'order.shipped.v1'`). Consumers key off this. |
| `aggregateType` | `string` | Source aggregate (`'Order'`). For routing and filtering. |
| `aggregateId` | `string` | ID of the specific aggregate instance. Used for per-aggregate ordering. |

The base class sets `id` (UUID) and `occurredAt` automatically. Pass `occurredOn` from the domain event to preserve the original timestamp:

```typescript
new OrderShippedEvent(order.id, order.trackingCode, domainEvent.occurredOn);
//                                                   ^^^^^^^^^^^^^^^^^^^
//                                    preserves when the fact occurred, not when it was translated
```

**`toPayload()`** strips `id`, `occurredAt`, `eventName`, `aggregateType`, `aggregateId` and JSON-round-trips the remainder. Override it when you need custom serialization:

```typescript
// Override example: explicit field selection + enum → code
override toPayload(): Record<string, unknown> {
  return {
    orderId: this.aggregateId,
    trackingCode: this.trackingCode,
    shippedAt: this.occurredAt.toISOString(),
    carrier: this.carrier.code,   // enum → string
  };
}
```

### IDomainEventTranslator

One translator class per bounded context (or per aggregate, if you prefer). It converts domain events into zero or more integration events.

```typescript
interface IDomainEventTranslator {
  supports(eventName: string): boolean;
  translate(event: DomainEvent): IntegrationEvent[];
}
```

Rules:
- `supports` is a cheap predicate — return `true` only for event names this translator handles.
- `translate` may return `[]` for events that have no external audience.
- `DomainEventTranslatorRegistry.translateAll` dispatches each domain event to the **first** matching translator and stops there — translators do not stack.
- Pass `event.occurredOn` as `occurredAt` to `IntegrationEvent` to preserve the original event time.

### OutboxPublisher

```typescript
class OutboxPublisher {
  publishFrom(aggregate: AggregateRoot<any>): Promise<DomainEvent[]>
}
```

`publishFrom(aggregate)` is the only method you call. It:
1. Calls `aggregate.pullEvents()` (clearing the aggregate's event list).
2. Passes each event through the registered translators.
3. Inserts the resulting outbox rows into `outbox_events` using `uow.manager` (inside the active transaction).
4. Returns the domain events so you can pass them to `EventBus.publishAll` after the commit.

**Rules:**
- Call it **inside** `uow.transaction()` — the outbox rows must commit atomically with the aggregate.
- Call it **after** `repository.save(aggregate)` — the aggregate must be persisted first.
- Do **not** call `aggregate.pullEvents()` yourself before `publishFrom` — it will have nothing to publish.

```typescript
// Correct — everything in one transaction, eventBus after commit
const domainEvents = await this.uow.transaction(async () => {
  await this.repo.save(aggregate);
  return this.outbox.publishFrom(aggregate);  // inside ← correct
});
await this.eventBus.publishAll(domainEvents); // after commit ← correct

// Wrong — publishFrom outside the transaction
await this.uow.transaction(async () => {
  await this.repo.save(aggregate);
});
await this.outbox.publishFrom(aggregate); // outside ← wrong: outbox write not atomic with save
```

---

## OutboxWorker options

Pass options in `MessagingModule.forRoot({ worker: { ... } })`.

| Option | Default | Description |
|---|---|---|
| `pollIntervalMs` | `2000` | How often the worker polls in ms. |
| `batchSize` | `25` | Max rows per poll tick. |
| `baseBackoffMs` | `30000` | Initial retry delay (ms). Doubles on each failure. |
| `maxBackoffMs` | `3600000` | Backoff ceiling (1 hour). |
| `maxJitterMs` | `5000` | Random jitter added to each backoff to avoid thundering herd. |
| `terminalFailureRetries` | `10` | Failures before a row becomes FAILED (no more auto-retry). |
| `enabled` | `true` | Set `false` in CLI or web-only processes where a separate worker runs. |

```typescript
MessagingModule.forRoot({
  worker: {
    pollIntervalMs: 5000,
    batchSize: 100,
    terminalFailureRetries: 5,
    enabled: process.env.ENABLE_OUTBOX_WORKER === 'true',
  },
})
```

---

## Implementing IMessagePublisher

Provide your broker-specific class via `messagePublisher`. Throw on any failure — the worker will catch and schedule a retry.

```typescript
// src/infrastructure/kafka-message-publisher.ts
import { Injectable, Logger } from '@nestjs/common';
import { IMessagePublisher, OutboxEventRecord } from '@xlr8-nest/core/messaging';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaMessagePublisher implements IMessagePublisher {
  private readonly logger = new Logger(KafkaMessagePublisher.name);
  private readonly producer: Producer;

  constructor() {
    const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER!] });
    this.producer = kafka.producer();
  }

  async publish(record: OutboxEventRecord): Promise<void> {
    await this.producer.connect();
    await this.producer.send({
      topic: record.eventName,
      messages: [
        {
          key: record.aggregateId,
          value: JSON.stringify({
            id: record.id,          // stable dedupe key across retries
            occurredAt: record.occurredAt,
            aggregateType: record.aggregateType,
            aggregateId: record.aggregateId,
            ...record.payload,
          }),
        },
      ],
    });
  }
}
```

Register it:

```typescript
MessagingModule.forRoot({
  messagePublisher: KafkaMessagePublisher,
})
```

### ConsoleMessagePublisher (development default)

When `messagePublisher` is omitted, `ConsoleMessagePublisher` logs each event to stdout. It is safe to leave in place during local development — no configuration required.

```
[OutboxWorker] [outbox→bus] tenant.provisioned.v1 id=abc… aggregate=Tenant:t-123 payload={"tenantName":"Acme"}
```

---

## Required migration

The `outbox_events` table must exist before the app starts. Generate the migration with the CLI command, then run it.

### Generate

```bash
# via your app CLI (nest-commander bootstrap)
node dist/main outbox migration

# with custom name or path
node dist/main outbox migration --name AddOutboxTable --path ./src/db/migrations
```

Or generate programmatically:

```typescript
// src/scripts/generate-outbox-migration.ts
import { OutboxAdminService } from '@xlr8-nest/core/messaging';

const { filePath } = await outboxAdmin.generateMigration({
  path: './src/db/migrations',
  name: 'CreateOutboxEvents',
});
console.log('Created:', filePath);
```

### Generated DDL (for reference)

```sql
CREATE TYPE "public"."outbox_events_status_enum"
  AS ENUM('pending', 'processing', 'published', 'failed');

CREATE TABLE "outbox_events" (
  "id"              uuid                                 NOT NULL,
  "event_name"      character varying(255)               NOT NULL,
  "aggregate_type"  character varying(100)               NOT NULL,
  "aggregate_id"    character varying(255)               NOT NULL,
  "payload"         jsonb                                NOT NULL,
  "status"          "public"."outbox_events_status_enum" NOT NULL DEFAULT 'pending',
  "retry_count"     integer                              NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP WITH TIME ZONE             NOT NULL,
  "locked_until"    TIMESTAMP WITH TIME ZONE,
  "last_error"      text,
  "occurred_at"     TIMESTAMP WITH TIME ZONE             NOT NULL,
  "published_at"    TIMESTAMP WITH TIME ZONE,
  "created_at"      TIMESTAMP WITH TIME ZONE             NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMP WITH TIME ZONE             NOT NULL DEFAULT now(),
  CONSTRAINT "PK_outbox_events" PRIMARY KEY ("id")
);

-- Partial index: only covers the live working set (pending/processing).
-- Scales independently of published row accumulation.
CREATE INDEX "idx_outbox_events_due"
  ON "outbox_events" ("status", "next_attempt_at")
  WHERE status IN ('pending', 'processing');
```

---

## OutboxAdminService

Inject `OutboxAdminService` for dashboards and operational workflows.

```typescript
import { Injectable } from '@nestjs/common';
import { OutboxAdminService } from '@xlr8-nest/core/messaging';

@Injectable()
export class OutboxHealthService {
  constructor(private readonly outboxAdmin: OutboxAdminService) {}

  async check() {
    const stats = await this.outboxAdmin.getStats();
    // { pending: 4, processing: 1, published: 9823, failed: 2, dueNow: 4 }
    return stats;
  }

  async recoverFailed() {
    const requeued = await this.outboxAdmin.requeueFailed();
    // Resets FAILED → PENDING, retry_count = 0, next_attempt_at = now
    return { requeued };
  }
}
```

### CLI commands

| Command | Action |
|---|---|
| `outbox migration` | Generate the `outbox_events` migration file |
| `outbox status` | Print pending / published / failed / due-now counts |
| `outbox requeue-failed` | Reset all FAILED rows back to PENDING for immediate retry |

Disable CLI registration when you do not bootstrap nest-commander:

```typescript
MessagingModule.forRoot({ cli: false })
```

---

## Patterns & recipes

### One translator per aggregate family

Group related aggregates into a single translator rather than one translator per event:

```typescript
@Injectable()
export class OrderEventTranslator implements IDomainEventTranslator {
  supports(eventName: string): boolean {
    // handles all order.* events
    return eventName.startsWith('order.');
  }

  translate(event: DomainEvent): IntegrationEvent[] {
    switch (event.eventName) {
      case 'order.placed':    return [new OrderPlacedEvent(...)];
      case 'order.shipped':   return [new OrderShippedEvent(...)];
      case 'order.cancelled': return [];  // internal only — not published externally
      default:                return [];
    }
  }
}
```

### Disable the worker in CLI processes

CLI entry points (database seeders, migration runners, one-off scripts) should not spin up the outbox poller:

```typescript
// src/cli.module.ts
import { MessagingModule } from '@xlr8-nest/core/messaging';

@Module({
  imports: [
    MessagingModule.forRoot({
      translators: [TenantEventTranslator],
      worker: { enabled: false },   // no background poller in CLI
    }),
  ],
})
export class CliModule {}
```

### Health check endpoint

```typescript
// src/health/outbox-health.indicator.ts
import { Injectable } from '@nestjs/common';
import { OutboxAdminService } from '@xlr8-nest/core/messaging';

@Injectable()
export class OutboxHealthIndicator {
  constructor(private readonly outboxAdmin: OutboxAdminService) {}

  async isHealthy() {
    const stats = await this.outboxAdmin.getStats();
    const healthy = stats.failed === 0 && stats.dueNow < 100;
    return { outbox: { status: healthy ? 'up' : 'degraded', ...stats } };
  }
}
```

---

## Gotchas

**`publishFrom(aggregate)` must be called inside `uow.transaction()`.**
Outbox rows written outside a transaction use a separate DB connection and commit independently. If the aggregate save then fails, the outbox row is already committed — you get phantom events with no matching aggregate state. Always call `publishFrom` inside the same transaction closure as the aggregate save.

**Do not call `pullEvents()` before `publishFrom()`.**
`publishFrom` calls `pullEvents()` internally. If you call `pullEvents()` first, the aggregate's event list is already empty and `publishFrom` has nothing to translate. Let `publishFrom` own the event extraction.

**The outbox table grows unbounded.**
There is no pruning mechanism yet. Published rows are marked `PUBLISHED` but never deleted automatically. Add a periodic cleanup job (e.g. `DELETE FROM outbox_events WHERE status = 'published' AND published_at < now() - interval '7 days'`) or size the table accordingly.

**The worker starts in every process by default.**
If you run multiple process types (web + CLI + worker), set `enabled: false` in every process that should not poll. Running multiple workers is safe (SKIP LOCKED handles concurrency), but wastes connections.

**`FOR UPDATE SKIP LOCKED` is Postgres-only.**
`TypeOrmOutboxRepository.fetchDueBatch` uses `SELECT … FOR UPDATE SKIP LOCKED`. This SQL is not portable to MySQL or SQLite. The library only supports Postgres for the outbox repository.

**Pass `occurredOn` from the domain event as `occurredAt`.**
`DomainEvent.occurredOn` is when the fact happened in the domain. `IntegrationEvent.occurredAt` defaults to `new Date()` (translation time) if you do not pass it. Consumers rely on `occurredAt` for ordering and event sourcing — always forward the original timestamp.

**`eventName` must be stable across deployments.**
Changing `eventName` after consumers have subscribed breaks their subscriptions silently. Treat `eventName` as a public API. Use versioning suffixes (`order.shipped.v1` → `order.shipped.v2`) rather than renaming.

---

## See also

- [Database guide](./database.md) — `IUnitOfWork`, `uow.transaction()`, and TypeORM entity persistence
- [Errors guide](./errors.md) — `BaseError` hierarchy used in command handlers that call `publishFrom`
- [API Reference — messaging section](../api-reference.md)
