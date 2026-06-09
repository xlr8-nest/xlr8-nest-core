# Internals: Messaging & Outbox (`lib/messaging`)

How the transactional outbox pattern is implemented — the write path, the atomic claim
mechanism, per-aggregate ordering, and the retry/backoff algorithm.

---

## Table of Contents

- [File map](#file-map)
- [1. The overall flow](#1-the-overall-flow)
- [2. `IntegrationEvent` — the cross-service contract](#2-integrationevent--the-cross-service-contract)
- [3. `IDomainEventTranslator` — Strategy pattern](#3-idomaineventtranslator--strategy-pattern)
- [4. `OutboxPublisher` — write path](#4-outboxpublisher--write-path)
- [5. `OutboxEventOrm` — table schema](#5-outboxeventorm--table-schema)
- [6. `IOutboxRepository` and the atomic claim](#6-ioutboxrepository-and-the-atomic-claim)
- [7. `OutboxWorker` — polling loop and retry algorithm](#7-outboxworker--polling-loop-and-retry-algorithm)
  - [Lifecycle](#lifecycle)
  - [`tick()` — one polling iteration](#tick--one-polling-iteration)
  - [Per-aggregate ordering](#per-aggregate-ordering)
  - [`processOne(record)` — publish or record failure](#processonrecord--publish-or-record-failure)
  - [Exponential backoff with jitter](#exponential-backoff-with-jitter)
- [8. `MessagingModule.forRoot` — DI wiring](#8-messagingmoduleforroot--di-wiring)
- [9. Known limitations](#9-known-limitations)

---

## File map

```
lib/messaging/
├── messaging.module.ts              # MessagingModule.forRoot()
├── integration-event.ts             # IntegrationEvent abstract base class
├── domain-event-translator.ts       # IDomainEventTranslator interface + TRANSLATORS_TOKEN
├── domain-event-translator.registry.ts  # DomainEventTranslatorRegistry
├── outbox-publisher.service.ts      # OutboxPublisher — write path
├── outbox-event.orm.ts              # OutboxEventOrm — TypeORM entity for outbox_events table
├── outbox-event-status.enum.ts      # OutboxEventStatus: PENDING, PUBLISHED, FAILED
├── outbox.repository.ts             # IOutboxRepository interface + OutboxRepositoryToken
├── typeorm-outbox.repository.ts     # TypeOrmOutboxRepository — concrete impl
├── outbox-worker.service.ts         # OutboxWorker — background polling + retry
├── outbox-admin.service.ts          # OutboxAdminService — status queries
├── outbox.command.ts                # OutboxCommandRunner — CLI commands
└── message-publisher.ts            # IMessagePublisher interface + MessagePublisherToken
```

---

## 1. The overall flow

```
WRITE PATH (inside a UoW transaction):
──────────────────────────────────────
commandHandler.execute(command)
  └── uow.transaction(async () => {
        aggregate = new MyAggregate(...)     ← domain operation
        await repo.save(aggregate)           ← persists aggregate in txn
        await outboxPublisher.publishEvents( ← persists outbox rows in SAME txn
          aggregate.pullEvents()
        )
      })
      
      If ANY of the above throws → ROLLBACK (aggregate + outbox rows both undone)
      If all succeed → COMMIT (aggregate + outbox rows both committed atomically)

DELIVERY PATH (background, independent of HTTP requests):
──────────────────────────────────────────────────────────
OutboxWorker (setInterval every pollIntervalMs):
  └── tick()
        ├── outboxRepo.fetchDueBatch(batchSize)   ← atomic claim
        ├── group by aggregateId
        └── for each group (parallel across groups):
              for each record in group (sequential within group):
                publisher.publish(record)
                markPublished(record.id)
                    OR
                recordFailure(record.id, error, nextAttemptAt, isTerminal)
```

The key guarantee: **aggregate state and outbox rows are written in the same database transaction**.
If the process crashes between commit and delivery, the worker picks up the undelivered rows on
the next poll. This gives at-least-once delivery semantics.

---

## 2. `IntegrationEvent` — the cross-service contract

```typescript
abstract class IntegrationEvent {
  readonly id: string;         // UUIDv4, generated at construction
  readonly occurredAt: Date;   // when the domain event happened (default: now)

  abstract readonly eventName: string;       // stable identifier for subscribers
  abstract readonly aggregateType: string;   // e.g. 'user', 'order'
  abstract readonly aggregateId: string;     // which aggregate instance

  toPayload(): Record<string, unknown> { ... }
}
```

**`toPayload()` implementation:**

```typescript
toPayload(): Record<string, unknown> {
  const skip = new Set(['id', 'occurredAt', 'eventName', 'aggregateType', 'aggregateId']);
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(this)) {
    if (!skip.has(key)) raw[key] = this[key];
  }
  return JSON.parse(JSON.stringify(raw));  // deep-clone + JSON-safe serialization
}
```

The five routing fields (`id`, `occurredAt`, `eventName`, `aggregateType`, `aggregateId`) are
excluded from the payload — they are stored as dedicated columns in the outbox table. The payload
contains only the domain-specific data.

`JSON.parse(JSON.stringify(...))` ensures:
- Circular references throw (explicit failure, not silent corruption).
- `Date` objects become ISO strings.
- `undefined` fields are dropped.

**Limitation:** `bigint` values will throw during `JSON.stringify`. Use `String(bigint)` or
exclude bigint fields before calling `toPayload()`.

---

## 3. `IDomainEventTranslator` — Strategy pattern

```typescript
interface IDomainEventTranslator {
  supports(eventName: string): boolean;
  translate(event: DomainEvent): IntegrationEvent[];
}
```

`supports()` is a cheap predicate called before `translate()`. Return `false` to skip.
Return an empty array from `translate()` for domain events that should NOT cross the service
boundary (internal events, projection triggers, metrics).

**`DomainEventTranslatorRegistry`** holds all translators and dispatches to the first one that
returns `true` from `supports()`:

```typescript
translate(event: DomainEvent): IntegrationEvent[] {
  for (const translator of this.translators) {
    if (translator.supports(event.eventName)) {
      return translator.translate(event);
    }
  }
  return [];   // no translator → event stays internal
}
```

**First-match semantics.** If two translators both `support()` the same event name, the one
registered first wins. Register more specific translators before less specific ones.

---

## 4. `OutboxPublisher` — write path

```typescript
async publishEvents(domainEvents: DomainEvent[]): Promise<void> {
  const integrationEvents = domainEvents.flatMap(e =>
    this.translatorRegistry.translate(e),
  );
  if (integrationEvents.length === 0) return;
  await this.outboxRepository.save(integrationEvents);
}
```

`outboxRepository.save()` runs inside the **caller's** `AsyncLocalStorage` context —
`TypeOrmClient.manager` returns the active transactional `EntityManager`. The outbox rows are
inserted into the same database transaction as the aggregate.

If `save()` throws, the exception propagates up to `uow.transaction()`, which rolls back — both
the aggregate row and the outbox rows are discarded atomically.

---

## 5. `OutboxEventOrm` — table schema

The `outbox_events` table (TypeORM entity):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated from `IntegrationEvent.id` |
| `event_name` | varchar | `IntegrationEvent.eventName` |
| `aggregate_type` | varchar | `IntegrationEvent.aggregateType` |
| `aggregate_id` | varchar | `IntegrationEvent.aggregateId` |
| `payload` | jsonb | `IntegrationEvent.toPayload()` |
| `occurred_at` | timestamp | `IntegrationEvent.occurredAt` |
| `status` | enum | `PENDING` → `PUBLISHED` / `FAILED` |
| `retry_count` | int | Incremented on each failure; default 0 |
| `next_attempt_at` | timestamp | When the worker should next retry; default now |
| `last_error` | text | Last failure message; nullable |
| `published_at` | timestamp | Set on success; nullable |

**Indexes:** at minimum, an index on `(status, next_attempt_at)` is needed for efficient polling.
Without this index, every poll is a full table scan.

---

## 6. `IOutboxRepository` and the atomic claim

```typescript
interface IOutboxRepository {
  save(events: IntegrationEvent[]): Promise<void>;
  fetchDueBatch(batchSize: number, now?: Date): Promise<OutboxEventRecord[]>;
  markPublished(id: string, publishedAt?: Date): Promise<void>;
  recordFailure(id: string, error: string, nextAttemptAt: Date, isTerminal: boolean): Promise<void>;
}
```

**`fetchDueBatch(batchSize)` — the atomic claim:**

The implementation uses a PostgreSQL `UPDATE … RETURNING` with `FOR UPDATE SKIP LOCKED`:

```sql
UPDATE outbox_events
SET status = 'PROCESSING', locked_until = NOW() + INTERVAL '30 seconds'
WHERE id IN (
  SELECT id FROM outbox_events
  WHERE status = 'PENDING'
    AND next_attempt_at <= NOW()
  ORDER BY next_attempt_at ASC
  LIMIT $1
  FOR UPDATE SKIP LOCKED
)
RETURNING *
```

**Why `SKIP LOCKED`?**
Without it, concurrent workers would block each other waiting for row locks. `SKIP LOCKED` makes
each worker skip rows that another worker already has locked — they pick the next available rows.
This enables safe parallel processing across multiple worker processes.

**Why `UPDATE … RETURNING` instead of `SELECT` then `UPDATE`?**
A two-step approach has a race condition: two workers could `SELECT` the same row and both start
processing it. The single `UPDATE … RETURNING` is atomic — only one worker gets any given row.

**Limitation:** This SQL is **PostgreSQL-specific** (`FOR UPDATE SKIP LOCKED`, `$1` placeholders).
MySQL 8+, MariaDB 10.6+, and SQL Server also support `SKIP LOCKED`, but the syntax differs.
SQLite does not support it at all.

---

## 7. `OutboxWorker` — polling loop and retry algorithm

### Lifecycle

```
OutboxWorker.onModuleInit()
  if (!opts.enabled) → log and return (worker disabled)
  this.timer = setInterval(() => tick(), opts.pollIntervalMs)
  this.timer.unref()    ← does NOT keep the Node.js process alive (clean shutdown)

OutboxWorker.onModuleDestroy()
  this.stopped = true
  clearInterval(this.timer)
```

`timer.unref()` is important: it allows `process.exit()` to succeed cleanly even if the timer
is still pending. Without it, a test teardown would hang waiting for the interval to fire.

### `tick()` — one polling iteration

```
tick()
  if (running || stopped) → return  (re-entrancy guard)
  running = true
  try:
    batch = outboxRepo.fetchDueBatch(opts.batchSize)
    if (batch is empty) → return
    
    group by aggregateId:
      byAggregate = Map<aggregateId, records[]>
    
    Promise.all(
      for each group: processGroup(group)
    )
  finally:
    running = false
```

The `running` flag prevents concurrent ticks: if the previous tick is still processing when the
next interval fires, the new tick returns immediately. This prevents unbounded parallelism.

### Per-aggregate ordering

Within `processGroup(records)`, records are processed **sequentially**:

```typescript
private async processGroup(records: OutboxEventRecord[]): Promise<void> {
  for (const record of records) {
    await this.processOne(record);
  }
}
```

**Why sequential within a group?**
Events from the same aggregate must be delivered in order. Consider: `OrderPlaced` then
`OrderShipped`. If both are in the same batch and processed in parallel, `OrderShipped`
could arrive at the subscriber before `OrderPlaced`.

**Why parallel across groups?**
Events from different aggregates are independent. Processing them in parallel improves throughput.

### `processOne(record)` — publish or record failure

```
processOne(record)
  try:
    publisher.publish(record)       ← call the message broker
    outboxRepo.markPublished(id)
  catch (err):
    nextAttemptAt = computeNextAttempt(record.retryCount)
    isTerminal = (record.retryCount + 1 >= opts.terminalFailureRetries)
    outboxRepo.recordFailure(id, message, nextAttemptAt, isTerminal)
    logger.warn(...)
```

### Exponential backoff with jitter

```typescript
private computeNextAttempt(retryCount: number): Date {
  const base = Math.min(
    this.opts.maxBackoffMs,
    this.opts.baseBackoffMs * Math.pow(2, retryCount),
  );
  const jitter = Math.floor(Math.random() * this.opts.maxJitterMs);
  return new Date(Date.now() + base + jitter);
}
```

**Default values:**

| Option | Default | Meaning |
|---|---|---|
| `baseBackoffMs` | 30,000 (30s) | Base delay for the first retry |
| `maxBackoffMs` | 3,600,000 (1h) | Cap on the exponential backoff |
| `maxJitterMs` | 5,000 (5s) | Random jitter added to prevent thundering herd |
| `terminalFailureRetries` | 10 | After this many failures, mark as permanently FAILED |

**Example backoff sequence (no jitter, base=30s, max=1h):**

| Retry # | `retryCount` | Base delay |
|---|---|---|
| 1 | 0 | 30s × 2^0 = 30s |
| 2 | 1 | 30s × 2^1 = 60s |
| 3 | 2 | 30s × 2^2 = 120s |
| 4 | 3 | 30s × 2^3 = 240s (~4m) |
| 5 | 4 | 30s × 2^4 = 480s (~8m) |
| 6 | 5 | 30s × 2^5 = 960s (~16m) |
| 7 | 6 | 30s × 2^6 = 1920s (~32m) |
| 8 | 7 | capped at 1h |
| 9 | 8 | capped at 1h |
| 10 | 9 | capped at 1h → TERMINAL |

**Jitter:** `Math.random() * 5000` ms (0–5s) is added to each computed delay. This staggers
retries when multiple events fail at the same time, preventing all of them from retrying
simultaneously and overwhelming the broker.

---

## 8. `MessagingModule.forRoot` — DI wiring

```typescript
providers = [
  TypeOrmOutboxRepository,
  { provide: OutboxRepositoryToken, useExisting: TypeOrmOutboxRepository },
  OutboxPublisher,
  DomainEventTranslatorRegistry,
  ...translatorClasses,
  {
    provide: TRANSLATORS_TOKEN,
    useFactory: (...instances) => instances,
    inject: translatorClasses,
  },
  publisherClass,    // ConsoleMessagePublisher or custom
  { provide: MessagePublisherToken, useExisting: publisherClass },
  { provide: OUTBOX_WORKER_OPTIONS, useValue: options.worker ?? {} },
  OutboxWorker,
  OutboxAdminService,
  ...(cli ? [OutboxCommandRunner] : []),
]
imports: [TypeOrmModule.forFeature([OutboxEventOrm])]
exports: [OutboxPublisher, OutboxRepositoryToken, OutboxAdminService]
```

**Key patterns:**

| Pattern | Explanation |
|---|---|
| `useExisting` for repo/publisher tokens | Single instance; token is an alias |
| `useFactory` + `inject: translatorClasses` | Collects all translator instances into an array |
| `TypeOrmModule.forFeature([OutboxEventOrm])` | Registers the outbox entity and its repository with TypeORM |
| `global: true` (default) | `OutboxPublisher` is injectable anywhere without re-importing `MessagingModule` |

---

## 9. Known limitations

| Limitation | Impact | Workaround |
|---|---|---|
| Outbox table grows unbounded | Storage grows forever | Schedule a periodic `DELETE FROM outbox_events WHERE status IN ('PUBLISHED','FAILED') AND published_at < NOW() - INTERVAL '7 days'` |
| `fetchDueBatch` uses PostgreSQL-specific SQL | MySQL/SQLite workers break at runtime | Add a dialect guard or implement a database-specific `IOutboxRepository` |
| `toPayload()` drops `Date` sub-object fields as strings | Payload deserialization needs to re-parse ISO strings to `Date` | Document in your event contract or add a custom serializer in `toPayload()` |
| Re-entrant `transaction()` opens a new transaction | Nested UoW calls do not join | Redesign to avoid nested transactions, or use TypeORM `QueryRunner` savepoints directly |
