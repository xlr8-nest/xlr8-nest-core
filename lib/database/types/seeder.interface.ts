import { DataSource, EntityManager } from 'typeorm';

/**
 * Abstract base class for seeders
 * DataSource is injected via constructor for better DI support
 */
export abstract class Seeder {
  constructor(protected readonly dataSource: DataSource) {}

  protected get manager(): EntityManager {
    return this.dataSource.manager;
  }

  /**
   * Run the seeder
   */
  abstract run(): Promise<void>;

  /**
   * Clear a table (truncate with cascade)
   */
  protected async clearTable(tableName: string): Promise<void> {
    await this.dataSource.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
  }

  /**
   * Disable foreign key checks (PostgreSQL)
   */
  protected async disableForeignKeyChecks(): Promise<void> {
    await this.dataSource.query('SET CONSTRAINTS ALL DEFERRED');
  }

  /**
   * Enable foreign key checks (PostgreSQL)
   */
  protected async enableForeignKeyChecks(): Promise<void> {
    await this.dataSource.query('SET CONSTRAINTS ALL IMMEDIATE');
  }
}

/**
 * Seeder constructor type
 */
export interface SeederConstructor {
  new (dataSource: DataSource): Seeder;
  name: string;
}

/**
 * Options for running seeders
 */
export interface SeederOptions {
  /**
   * Transaction mode for seeding
   * - 'all': Run all seeders in a single transaction
   * - 'each': Run each seeder in its own transaction
   * - 'none': Do not use transactions
   */
  transaction?: 'all' | 'each' | 'none';

  /**
   * Run only specific seeders by name
   * If empty or undefined, run all configured seeders
   */
  only?: string[];

  /**
   * Run seeders in specified order
   * If undefined, use the order from config
   */
  order?: string[];
}
