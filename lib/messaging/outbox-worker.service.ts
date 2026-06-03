import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  type IOutboxRepository,
  type OutboxEventRecord,
  OutboxRepositoryToken,
} from './outbox.repository';
import {
  type IMessagePublisher,
  MessagePublisherToken,
} from './message-publisher';

export interface OutboxWorkerOptions {
  /** How often to poll for due events (ms). Default 2000. */
  pollIntervalMs?: number;
  /** Max events processed per tick. Default 25. */
  batchSize?: number;
  /** Initial backoff between retries (ms). Default 30 000. */
  baseBackoffMs?: number;
  /** Cap on backoff (ms). Default 3 600 000 (1 hour). */
  maxBackoffMs?: number;
  /**
   * Maximum jitter added to each backoff to de-synchronise parallel workers (ms).
   * Actual jitter is a random value in [0, maxJitterMs]. Default 5 000.
   */
  maxJitterMs?: number;
  /**
   * How many consecutive failures before a row is marked FAILED and no longer
   * retried automatically. Default 10.
   */
  terminalFailureRetries?: number;
  /**
   * Set to `false` to disable the background poller entirely (e.g. in CLI
   * processes or dedicated web replicas where a separate worker process runs).
   * Default: `true`.
   */
  enabled?: boolean;
}

export const OUTBOX_WORKER_OPTIONS = Symbol('OutboxWorkerOptions');

const DEFAULTS: Required<OutboxWorkerOptions> = {
  pollIntervalMs: 2_000,
  batchSize: 25,
  baseBackoffMs: 30_000,
  maxBackoffMs: 60 * 60 * 1000,
  maxJitterMs: 5_000,
  terminalFailureRetries: 10,
  enabled: true,
};

/**
 * Polls the outbox table on an interval, publishes due events through the
 * message bus, and updates each row's status / retry state accordingly.
 *
 * Retry strategy: exponential backoff capped at maxBackoffMs. After
 * TERMINAL_FAILURE_RETRIES (defined in TypeOrmOutboxRepository) the row
 * transitions to FAILED and is no longer retried.
 *
 * Concurrency: the repository's fetchDueBatch uses an atomic UPDATE … RETURNING
 * with SKIP LOCKED, so running multiple workers / instances is safe.
 *
 * Per-aggregate ordering: events for the same aggregateId are published
 * sequentially within a batch to preserve ordering. Events for different
 * aggregates are published in parallel.
 *
 * Set `enabled: false` in MessagingModule.forRoot({ worker: { enabled: false } })
 * to prevent the poller from starting in CLI or non-worker processes.
 */
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly opts: Required<OutboxWorkerOptions>;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    @Inject(OutboxRepositoryToken)
    private readonly outboxRepo: IOutboxRepository,
    @Inject(MessagePublisherToken)
    private readonly publisher: IMessagePublisher,
    @Inject(OUTBOX_WORKER_OPTIONS)
    options: OutboxWorkerOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
  }

  onModuleInit(): void {
    if (!this.opts.enabled) {
      this.logger.log('OutboxWorker is disabled (enabled: false) — poller not started.');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.opts.pollIntervalMs);
    this.timer.unref?.();
    this.logger.log(
      `OutboxWorker started (poll=${this.opts.pollIntervalMs}ms, batch=${this.opts.batchSize})`,
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Exposed for tests and ad-hoc draining (e.g. graceful shutdown hooks). */
  async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const batch = await this.outboxRepo.fetchDueBatch(this.opts.batchSize);
      if (batch.length === 0) return;

      // Group by aggregateId to preserve per-aggregate ordering.
      // Events for different aggregates are published in parallel; events for the
      // same aggregate are published sequentially in next_attempt_at order.
      const byAggregate = new Map<string, OutboxEventRecord[]>();
      for (const record of batch) {
        const group = byAggregate.get(record.aggregateId) ?? [];
        group.push(record);
        byAggregate.set(record.aggregateId, group);
      }

      await Promise.all(
        Array.from(byAggregate.values()).map((group) =>
          this.processGroup(group),
        ),
      );
    } catch (err) {
      this.logger.error('OutboxWorker tick failed', err as Error);
    } finally {
      this.running = false;
    }
  }

  /** Publish all records for one aggregate sequentially. */
  private async processGroup(records: OutboxEventRecord[]): Promise<void> {
    for (const record of records) {
      await this.processOne(record);
    }
  }

  private async processOne(record: OutboxEventRecord): Promise<void> {
    try {
      await this.publisher.publish(record);
      await this.outboxRepo.markPublished(record.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttemptAt = this.computeNextAttempt(record.retryCount);
      const isTerminal = record.retryCount + 1 >= this.opts.terminalFailureRetries;
      await this.outboxRepo.recordFailure(record.id, message, nextAttemptAt, isTerminal);
      this.logger.warn(
        `Outbox publish failed for ${record.eventName} id=${record.id} (retry ${record.retryCount + 1}): ${message}`,
      );
    }
  }

  private computeNextAttempt(retryCount: number): Date {
    const base = Math.min(
      this.opts.maxBackoffMs,
      this.opts.baseBackoffMs * Math.pow(2, retryCount),
    );
    const jitter = Math.floor(Math.random() * this.opts.maxJitterMs);
    return new Date(Date.now() + base + jitter);
  }
}
