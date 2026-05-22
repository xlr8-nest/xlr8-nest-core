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
}

export const OUTBOX_WORKER_OPTIONS = Symbol('OutboxWorkerOptions');

const DEFAULTS: Required<OutboxWorkerOptions> = {
  pollIntervalMs: 2_000,
  batchSize: 25,
  baseBackoffMs: 30_000,
  maxBackoffMs: 60 * 60 * 1000,
};

/**
 * Polls the outbox table on an interval, publishes due events through the
 * message bus, and updates each row's status / retry state accordingly.
 *
 * Retry strategy: exponential backoff capped at maxBackoffMs. After
 * TERMINAL_FAILURE_RETRIES (defined in TypeOrmOutboxRepository) the row
 * transitions to FAILED and is no longer retried.
 *
 * Concurrency: the repository's fetchDueBatch uses SELECT ... FOR UPDATE
 * SKIP LOCKED, so running multiple workers / instances is safe.
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
      await Promise.all(batch.map((record) => this.processOne(record)));
    } catch (err) {
      this.logger.error('OutboxWorker tick failed', err as Error);
    } finally {
      this.running = false;
    }
  }

  private async processOne(record: OutboxEventRecord): Promise<void> {
    try {
      await this.publisher.publish(record);
      await this.outboxRepo.markPublished(record.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttemptAt = this.computeNextAttempt(record.retryCount);
      await this.outboxRepo.recordFailure(record.id, message, nextAttemptAt, false);
      this.logger.warn(
        `Outbox publish failed for ${record.eventName} id=${record.id} (retry ${record.retryCount + 1}): ${message}`,
      );
    }
  }

  private computeNextAttempt(retryCount: number): Date {
    const backoff = Math.min(
      this.opts.maxBackoffMs,
      this.opts.baseBackoffMs * Math.pow(2, retryCount),
    );
    return new Date(Date.now() + backoff);
  }
}
