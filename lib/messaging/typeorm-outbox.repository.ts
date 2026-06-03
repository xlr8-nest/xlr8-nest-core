import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { type IUnitOfWork, IUnitOfWorkToken } from '../database/types';
import { IntegrationEvent } from './integration-event';
import { OutboxEventOrm } from './outbox-event.orm';
import { OutboxEventStatus } from './outbox-event-status.enum';
import { type IOutboxRepository, type OutboxEventRecord } from './outbox.repository';

const TERMINAL_FAILURE_RETRIES = 10;

/** Default lease duration for the PROCESSING state (30 s). */
const LEASE_DURATION_MS = 30_000;

/**
 * TypeORM-backed implementation of IOutboxRepository.
 *
 * `save()` reads the current EntityManager from the active UnitOfWork transaction
 * (via the IUnitOfWork.manager accessor), so outbox writes commit atomically with
 * aggregate writes.
 *
 * `fetchDueBatch()` uses an atomic UPDATE … RETURNING pattern to claim rows:
 * the row is flipped to PROCESSING in the same statement that selects it, so
 * no separate read-then-update window exists. Expired PROCESSING rows (lease
 * elapsed) are automatically re-claimed by the next tick.
 *
 * `markPublished()` and `recordFailure()` issue single atomic UPDATEs keyed by
 * id + expected status (PROCESSING) to avoid lost-update races.
 */
@Injectable()
export class TypeOrmOutboxRepository implements IOutboxRepository {
  private readonly outbox: Repository<OutboxEventOrm>;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(IUnitOfWorkToken)
    private readonly uow: IUnitOfWork,
  ) {
    this.outbox = dataSource.getRepository(OutboxEventOrm);
  }

  async save(events: IntegrationEvent[]): Promise<void> {
    if (events.length === 0) return;
    const em = this.uow.manager;
    const now = new Date();
    const rows = events.map(
      (ev) =>
        new OutboxEventOrm({
          id: ev.id,
          eventName: ev.eventName,
          aggregateType: ev.aggregateType,
          aggregateId: ev.aggregateId,
          payload: ev.toPayload(),
          status: OutboxEventStatus.PENDING,
          retryCount: 0,
          nextAttemptAt: now,
          occurredAt: ev.occurredAt,
        }),
    );
    await em.insert(OutboxEventOrm, rows);
  }

  async fetchDueBatch(batchSize: number, now: Date = new Date()): Promise<OutboxEventRecord[]> {
    const lockedUntil = new Date(now.getTime() + LEASE_DURATION_MS);

    // Atomic claim: select pending/expired-processing rows and flip to PROCESSING
    // in a single statement, releasing no locks between select and update.
    const claimed: Array<Record<string, unknown>> = await this.dataSource.query(
      `
      UPDATE "outbox_events"
      SET "status" = $1,
          "locked_until" = $2
      WHERE "id" IN (
        SELECT "id"
        FROM "outbox_events"
        WHERE (
            "status" = $3 AND "next_attempt_at" <= $4
          ) OR (
            "status" = $1 AND "locked_until" < $4
          )
        ORDER BY "next_attempt_at" ASC
        LIMIT $5
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
      `,
      [OutboxEventStatus.PROCESSING, lockedUntil, OutboxEventStatus.PENDING, now, batchSize],
    );

    return claimed.map((r) => ({
      id: r['id'] as string,
      eventName: r['event_name'] as string,
      aggregateType: r['aggregate_type'] as string,
      aggregateId: r['aggregate_id'] as string,
      payload: r['payload'] as Record<string, unknown>,
      occurredAt: r['occurred_at'] as Date,
      retryCount: r['retry_count'] as number,
    }));
  }

  async markPublished(id: string, publishedAt: Date = new Date()): Promise<void> {
    // Conditional on status=PROCESSING so a re-claimed row is not accidentally
    // marked published by the previous (stale) worker.
    await this.dataSource.query(
      `UPDATE "outbox_events"
       SET "status" = $1, "published_at" = $2, "last_error" = NULL, "locked_until" = NULL
       WHERE "id" = $3 AND "status" = $4`,
      [OutboxEventStatus.PUBLISHED, publishedAt, id, OutboxEventStatus.PROCESSING],
    );
  }

  async recordFailure(
    id: string,
    error: string,
    nextAttemptAt: Date,
    isTerminal: boolean,
  ): Promise<void> {
    // Single atomic UPDATE: increment retry_count and compute terminal state in SQL.
    // No read-before-write; safe under concurrent workers.
    await this.dataSource.query(
      `UPDATE "outbox_events"
       SET "retry_count"     = "retry_count" + 1,
           "last_error"      = $1,
           "next_attempt_at" = $2,
           "locked_until"    = NULL,
           "status"          = CASE
             WHEN ($3 OR "retry_count" + 1 >= $4)
             THEN $5::text
             ELSE $6::text
           END
       WHERE "id" = $7 AND "status" = $8`,
      [
        error.substring(0, 4_000),
        nextAttemptAt,
        isTerminal,
        TERMINAL_FAILURE_RETRIES,
        OutboxEventStatus.FAILED,
        OutboxEventStatus.PENDING,
        id,
        OutboxEventStatus.PROCESSING,
      ],
    );
  }
}
