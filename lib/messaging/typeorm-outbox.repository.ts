import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { type IUnitOfWork, IUnitOfWorkToken } from '../database/types';
import { TypeOrmClient } from '../database/providers/typeorm-client.provider';
import { IntegrationEvent } from './integration-event';
import { OutboxEventOrm } from './outbox-event.orm';
import { OutboxEventStatus } from './outbox-event-status.enum';
import { type IOutboxRepository, type OutboxEventRecord } from './outbox.repository';

const TERMINAL_FAILURE_RETRIES = 10;

/**
 * TypeORM-backed implementation of IOutboxRepository.
 *
 * `save()` reads the current EntityManager from the active UnitOfWork transaction
 * (via TypeOrmClient.client), so outbox writes commit atomically with aggregate writes.
 * `fetchDueBatch()` uses SELECT ... FOR UPDATE SKIP LOCKED to allow multiple workers
 * to claim disjoint batches safely.
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
    const em = (this.uow as TypeOrmClient).client;
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
    return this.dataSource.transaction(async (em) => {
      const claimed: Array<Record<string, unknown>> = await em.query(
        `
        SELECT *
        FROM "outbox_events"
        WHERE "status" = $1
          AND "next_attempt_at" <= $2
        ORDER BY "next_attempt_at" ASC
        LIMIT $3
        FOR UPDATE SKIP LOCKED
        `,
        [OutboxEventStatus.PENDING, now, batchSize],
      );

      return claimed.map((r) => ({
        id: r.id as string,
        eventName: r.event_name as string,
        aggregateType: r.aggregate_type as string,
        aggregateId: r.aggregate_id as string,
        payload: r.payload as Record<string, unknown>,
        occurredAt: r.occurred_at as Date,
        retryCount: r.retry_count as number,
      }));
    });
  }

  async markPublished(id: string, publishedAt: Date = new Date()): Promise<void> {
    await this.outbox.update(
      { id },
      {
        status: OutboxEventStatus.PUBLISHED,
        publishedAt,
        lastError: null,
      },
    );
  }

  async recordFailure(
    id: string,
    error: string,
    nextAttemptAt: Date,
    isTerminal: boolean,
  ): Promise<void> {
    const row = await this.outbox.findOne({ where: { id } });
    if (!row) return;
    const retryCount = row.retryCount + 1;
    const terminal = isTerminal || retryCount >= TERMINAL_FAILURE_RETRIES;
    await this.outbox.update(
      { id },
      {
        retryCount,
        lastError: error.substring(0, 4000),
        nextAttemptAt,
        status: terminal ? OutboxEventStatus.FAILED : OutboxEventStatus.PENDING,
      },
    );
  }
}
