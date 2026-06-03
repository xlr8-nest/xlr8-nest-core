import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseOrm } from '../database/helpers/base-orm';
import { OutboxEventStatus } from './outbox-event-status.enum';

/**
 * Outbox table for the transactional outbox pattern.
 *
 * Schema is part of the library contract — services own the migration that
 * creates this table but its shape must match this entity definition.
 */
@Entity('outbox_events')
@Index('idx_outbox_events_due', ['status', 'nextAttemptAt'])
export class OutboxEventOrm extends BaseOrm<OutboxEventOrm> {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'event_name', type: 'varchar', length: 255 })
  eventName: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 100 })
  aggregateType: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 255 })
  aggregateId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    default: OutboxEventStatus.PENDING,
  })
  status: OutboxEventStatus;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount: number;

  /** When the worker should next attempt this event. Indexed for cheap "due now" scans. */
  @Column({ name: 'next_attempt_at', type: 'timestamptz' })
  nextAttemptAt: Date;

  /**
   * Lease expiry for the PROCESSING state. If a worker crashes after claiming a
   * row, another worker will re-claim it once this timestamp passes.
   */
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil?: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
