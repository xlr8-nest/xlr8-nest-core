import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DatabaseModuleConfig } from '../types';
import { DATABASE_MODULE_CONFIG } from '../constants';
import { createMigrationFile, prettifyQuery, queryParams } from '../utils';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    @Inject(DATABASE_MODULE_CONFIG) private readonly config: DatabaseModuleConfig,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    if (!this.config.migration?.enabled) {
      this.logger.warn('Migrations are disabled');
      return;
    }

    try {
      this.logger.log('Running migrations...');
      const migrations = await this.dataSource.runMigrations({
        transaction: 'all',
      });
      
      if (migrations.length > 0) {
        this.logger.log(`Successfully ran ${migrations.length} migration(s)`);
        migrations.forEach((migration) => {
          this.logger.log(`  ✓ ${migration.name}`);
        });
      } else {
        this.logger.log('No pending migrations');
      }
    } catch (error) {
      this.logger.error('Migration failed', error);
      throw error;
    }
  }

  /**
   * Revert the last migration
   */
  async revertMigration(): Promise<void> {
    if (!this.config.migration?.enabled) {
      this.logger.warn('Migrations are disabled');
      return;
    }

    try {
      this.logger.log('Reverting last migration...');
      await this.dataSource.undoLastMigration({ transaction: 'all' });
      this.logger.log('Successfully reverted last migration');
    } catch (error) {
      this.logger.error('Migration revert failed', error);
      throw error;
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<string[]> {
    const pendingMigrations = await this.dataSource.showMigrations();
    return pendingMigrations ? ['Has pending migrations'] : [];
  }

  /**
   * Check if there are pending migrations
   */
  async hasPendingMigrations(): Promise<boolean> {
    return await this.dataSource.showMigrations();
  }

  /**
   * Get all executed migrations
   */
  async getExecutedMigrations(): Promise<any[]> {
    const tableName = this.config.migration?.tableName || 'migrations';
    try {
      const migrations = await this.dataSource.query(
        `SELECT * FROM "${tableName}" ORDER BY timestamp ASC`,
      );
      return migrations || [];
    } catch (error) {
      this.logger.warn('Could not fetch executed migrations', error);
      return [];
    }
  }

  /**
   * Show migration status
   */
  async showStatus(): Promise<void> {
    this.logger.log('📊 Migration Status');
    
    const executed = await this.getExecutedMigrations();
    const hasPending = await this.hasPendingMigrations();

    this.logger.log('\nExecuted Migrations:');
    if (executed.length > 0) {
      executed.forEach((m: any) => {
        this.logger.log(`  ✓ ${m.name}`);
      });
    } else {
      this.logger.log('  (none)');
    }

    this.logger.log(`\n${hasPending ? '⚠️  Has pending migrations' : '✅ All migrations are up to date'}`);
  }

  /**
   * Generate a new migration file
   */
  async generateMigration(name: string): Promise<string> {
    if (!name) {
      throw new Error('Migration name is required');
    }

    const upSqls: string[] = [];
    const downSqls: string[] = [];

    const sqlInMemory = await this.dataSource.driver.createSchemaBuilder().log();

    sqlInMemory.upQueries.forEach((upQuery) => {
      upQuery.query = prettifyQuery(upQuery.query);
      upSqls.push(
        "    await queryRunner.query(`" +
        upQuery.query.replaceAll("`", "\\`") +
        "`" +
        queryParams(
          upQuery.parameters,
        ) +
        ");",
      )
    })
    sqlInMemory.downQueries.forEach((downQuery) => {
      downQuery.query = prettifyQuery(downQuery.query);
      downSqls.push(
        "    await queryRunner.query(`" +
        downQuery.query.replaceAll("`", "\\`") +
        "`" +
        queryParams(
          downQuery.parameters,
        ) +
        ");",
      )
    })
    

    const {filePath, fileName} = await createMigrationFile(
      this.config.migration?.migrationsPath || '',
      name,
      {
        upSqls,
        downSqls,
      }
    )

    this.logger.log(`✅ Migration created: ${fileName}`);

    return filePath;

  }

  async createMigration(name: string): Promise<string> {
    if (!name) {
      throw new Error('Migration name is required');
    }

    const {filePath, fileName} = await createMigrationFile(
      this.config.migration?.migrationsPath || '',
      name
    )

    this.logger.log(`✅ Migration created: ${fileName}`);

    return filePath;
  }
}
