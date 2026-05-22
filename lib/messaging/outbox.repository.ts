import { IntegrationEvent } from './integration-event';

export const OutboxRepositoryToken = Symbol('OutboxRepository');

/**
 * Plain projection of a row in the outbox table — what the worker receives.
 */
export interface OutboxEventRecord {
  id: string;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  retryCount: number;
}

/**
 * Persists IntegrationEvents into the outbox and serves them to the OutboxWorker.
 *
 * `save()` runs inside the active UnitOfWork transaction (alongside aggregate persistence).
 * The polling methods run outside any transaction.
 */
export interface IOutboxRepository {
  /**
   * Append integration events to the outbox in the active unit-of-work transaction.
   * Status is PENDING, nextAttemptAt = now.
   */
  save(events: IntegrationEvent[]): Promise<void>;

  /**
   * Fetches up to `batchSize` events that are PENDING and due now (next_attempt_at <= now).
   * Locks them so concurrent workers do not pick the same row.
   */
  fetchDueBatch(batchSize: number, now?: Date): Promise<OutboxEventRecord[]>;

  /**
   * Mark an event as successfully published.
   */
  markPublished(id: string, publishedAt?: Date): Promise<void>;

  /**
   * Record a failed publish attempt: increment retry_count, store error,
   * schedule next attempt at the supplied timestamp.
   */
  recordFailure(id: string, error: string, nextAttemptAt: Date, isTerminal: boolean): Promise<void>;
}
