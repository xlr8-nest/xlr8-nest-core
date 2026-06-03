import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { DATABASE_MODULE_CONFIG } from '../database/constants';
import type { DatabaseModuleConfig } from '../database/types';
import { toKebabCase } from '../database/utils/string.util';
import { OutboxEventOrm } from './outbox-event.orm';
import { OutboxEventStatus } from './outbox-event-status.enum';

export interface GenerateOutboxMigrationOptions {
  /** Filename / class name stem. Defaults to "CreateOutboxEvents". */
  name?: string;
  /** Where to drop the file. Falls back to DatabaseModuleConfig.migration.migrationsPath. */
  path?: string;
}

export interface OutboxStats {
  pending: number;
  /** Rows currently being published (PROCESSING state; should drain quickly). */
  processing: number;
  published: number;
  failed: number;
  /** PENDING rows whose next_attempt_at has passed — what the worker will pick up next. */
  dueNow: number;
}

/**
 * Operational service for the outbox table. Exposed to consumers directly and
 * also driven by `OutboxCommandRunner` (the `outbox` CLI command).
 *
 * Responsibilities:
 *   - Generate the canonical `outbox_events` TypeORM migration.
 *   - Report counts (pending / published / failed / due-now).
 *   - Re-queue FAILED events back to PENDING so the worker retries them.
 */
@Injectable()
export class OutboxAdminService {
  private readonly logger = new Logger(OutboxAdminService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Optional()
    @Inject(DATABASE_MODULE_CONFIG)
    private readonly dbConfig?: DatabaseModuleConfig,
  ) {}

  /**
   * Writes a TypeORM migration file that creates the outbox_events table,
   * its status enum, and the supporting index. The schema matches OutboxEventOrm.
   */
  async generateMigration(
    opts: GenerateOutboxMigrationOptions = {},
  ): Promise<{ filePath: string; fileName: string }> {
    const migrationsPath = opts.path ?? this.dbConfig?.migration?.migrationsPath;
    if (!migrationsPath) {
      throw new Error(
        'Migrations path is not configured. Pass it explicitly via opts.path or set ' +
          'migration.migrationsPath in your DatabaseModuleConfig.',
      );
    }

    const name = opts.name ?? 'CreateOutboxEvents';
    const timestamp = Date.now();
    const className = `${name.replace(/[^a-zA-Z0-9]/g, '')}${timestamp}`;
    const fileName = `${timestamp}-${toKebabCase(name)}.ts`;
    const filePath = path.join(migrationsPath, fileName);

    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }
    fs.writeFileSync(filePath, this.renderTemplate(className), 'utf8');

    this.logger.log(`Outbox migration created: ${fileName}`);
    return { filePath, fileName };
  }

  /** Snapshot of the outbox table's status distribution. */
  async getStats(): Promise<OutboxStats> {
    const now = new Date();
    // Single grouped query for pending/processing/published/failed counts
    const rows: Array<{ status: string; cnt: string }> = await this.dataSource.query(
      `SELECT status, COUNT(*) AS cnt FROM outbox_events GROUP BY status`,
    );
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = Number(row.cnt);

    const dueNow: [{ cnt: string }] = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM outbox_events WHERE status = $1 AND next_attempt_at <= $2`,
      [OutboxEventStatus.PENDING, now],
    );

    return {
      pending: byStatus[OutboxEventStatus.PENDING] ?? 0,
      processing: byStatus[OutboxEventStatus.PROCESSING] ?? 0,
      published: byStatus[OutboxEventStatus.PUBLISHED] ?? 0,
      failed: byStatus[OutboxEventStatus.FAILED] ?? 0,
      dueNow: Number(dueNow[0]?.cnt ?? 0),
    };
  }

  /**
   * Resets all FAILED events back to PENDING with retry_count=0 and
   * next_attempt_at=now, so the worker picks them up immediately.
   * Returns the number of rows that were re-queued.
   */
  async requeueFailed(): Promise<number> {
    const repo = this.dataSource.getRepository(OutboxEventOrm);
    const result = await repo
      .createQueryBuilder()
      .update()
      .set({
        status: OutboxEventStatus.PENDING,
        retryCount: 0,
        nextAttemptAt: new Date(),
        lastError: null,
      })
      .where('status = :status', { status: OutboxEventStatus.FAILED })
      .execute();
    return result.affected ?? 0;
  }

  private renderTemplate(className: string): string {
    return `import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`
      CREATE TYPE "public"."outbox_events_status_enum"
        AS ENUM('pending', 'processing', 'published', 'failed')
    \`);

    await queryRunner.query(\`
      CREATE TABLE "outbox_events" (
        "id"              uuid                                       NOT NULL,
        "event_name"      character varying(255)                     NOT NULL,
        "aggregate_type"  character varying(100)                     NOT NULL,
        "aggregate_id"    character varying(255)                     NOT NULL,
        "payload"         jsonb                                      NOT NULL,
        "status"          "public"."outbox_events_status_enum"       NOT NULL DEFAULT 'pending',
        "retry_count"     integer                                    NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE                   NOT NULL,
        "locked_until"    TIMESTAMP WITH TIME ZONE,
        "last_error"      text,
        "occurred_at"     TIMESTAMP WITH TIME ZONE                   NOT NULL,
        "published_at"    TIMESTAMP WITH TIME ZONE,
        "created_at"      TIMESTAMP WITH TIME ZONE                   NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_events" PRIMARY KEY ("id")
      )
    \`);

    -- Partial index: only tracks the live working set (pending/processing rows).
    -- Scales independently of how many published rows accumulate.
    await queryRunner.query(\`
      CREATE INDEX "idx_outbox_events_due"
        ON "outbox_events" ("status", "next_attempt_at")
        WHERE status IN ('pending', 'processing')
    \`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`DROP INDEX "public"."idx_outbox_events_due"\`);
    await queryRunner.query(\`DROP TABLE "outbox_events"\`);
    await queryRunner.query(\`DROP TYPE "public"."outbox_events_status_enum"\`);
  }
}
`;
  }
}
