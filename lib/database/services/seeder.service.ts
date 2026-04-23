import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DatabaseModuleConfig, Seeder, SeederOptions, SeederConstructor } from '../types';
import { DATABASE_MODULE_CONFIG } from '../constants';

@Injectable()
export class SeederService {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    @Inject(DATABASE_MODULE_CONFIG) private readonly config: DatabaseModuleConfig,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Run all or specific seeders
   */
  async runSeeders(options?: SeederOptions): Promise<void> {
    if (!this.config.seeder?.enabled) {
      this.logger.warn('Seeders are disabled');
      return;
    }

    let seederClasses = this.config.seeder.seeds;
    if (!seederClasses || seederClasses.length === 0) {
      this.logger.warn('No seeders configured');
      return;
    }

    try {
      // Filter seeders if 'only' option is provided
      if (options?.only && options.only.length > 0) {
        seederClasses = this.filterSeedersByName(seederClasses, options.only);
        if (seederClasses.length === 0) {
          this.logger.warn('No matching seeders found');
          return;
        }
      }

      // Reorder seeders if 'order' option is provided
      if (options?.order && options.order.length > 0) {
        seederClasses = this.reorderSeeders(seederClasses, options.order);
      }

      const seeders = this.instantiateSeeders(seederClasses);
      
      this.logger.log(`Running ${seeders.length} seeder(s)`);

      // Default to 'none' because repository.save() already handles transactions
      const transactionMode = options?.transaction ?? 'none';

      if (transactionMode === 'all') {
        await this.runSeedersInTransaction(seeders);
      } else if (transactionMode === 'each') {
        await this.runSeedersInSeparateTransactions(seeders);
      } else {
        await this.runSeedersWithoutTransaction(seeders);
      }

      this.logger.log('✓ All seeders completed successfully');
    } catch (error) {
      this.logger.error('Seeding failed', error);
      throw error;
    }
  }

  /**
   * Get list of available seeder names
   */
  getAvailableSeeders(): string[] {
    if (!this.config.seeder?.seeds) {
      return [];
    }
    return this.config.seeder.seeds.map((SeederClass) => SeederClass.name);
  }

  /**
   * Filter seeders by name
   */
  private filterSeedersByName(
    seederClasses: SeederConstructor[],
    names: string[],
  ): SeederConstructor[] {
    const normalizedNames = names.map((name) => name.toLowerCase());
    return seederClasses.filter((SeederClass) =>
      normalizedNames.includes(SeederClass.name.toLowerCase()),
    );
  }

  /**
   * Reorder seeders based on specified order
   */
  private reorderSeeders(
    seederClasses: SeederConstructor[],
    order: string[],
  ): SeederConstructor[] {
    const seederMap = new Map<string, SeederConstructor>();
    seederClasses.forEach((SeederClass) => {
      seederMap.set(SeederClass.name.toLowerCase(), SeederClass);
    });

    const reordered: SeederConstructor[] = [];
    const normalizedOrder = order.map((name) => name.toLowerCase());

    // Add seeders in specified order
    for (const name of normalizedOrder) {
      const seeder = seederMap.get(name);
      if (seeder) {
        reordered.push(seeder);
        seederMap.delete(name);
      }
    }

    // Add remaining seeders that weren't in the order list
    reordered.push(...Array.from(seederMap.values()));

    return reordered;
  }

  /**
   * Run seeders in a single transaction
   */
  private async runSeedersInTransaction(seeders: Seeder[]): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const seeder of seeders) {
        this.logger.log(`Running seeder: ${seeder.constructor.name}`);
        await seeder.run();
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Run each seeder in its own transaction
   */
  private async runSeedersInSeparateTransactions(seeders: Seeder[]): Promise<void> {
    for (const seeder of seeders) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        this.logger.log(`Running seeder: ${seeder.constructor.name}`);
        await seeder.run();
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    }
  }

  /**
   * Run seeders without transaction
   */
  private async runSeedersWithoutTransaction(seeders: Seeder[]): Promise<void> {
    for (const seeder of seeders) {
      this.logger.log(`Running seeder: ${seeder.constructor.name}`);
      await seeder.run();
    }
  }

  /**
   * Instantiate seeders from class constructors with DataSource injection
   */
  private instantiateSeeders(seederClasses: SeederConstructor[]): Seeder[] {
    const seeders: Seeder[] = [];

    for (const SeederClass of seederClasses) {
      try {
        if (SeederClass && typeof SeederClass === 'function') {
          // Inject DataSource via constructor
          const seeder = new SeederClass(this.dataSource);
          seeders.push(seeder);
          this.logger.log(`  ✓ Loaded: ${SeederClass.name}`);
        } else {
          this.logger.warn(`Invalid seeder class: ${SeederClass}`);
        }
      } catch (error) {
        this.logger.error(`Failed to instantiate seeder: ${SeederClass?.name}`, error);
      }
    }

    return seeders;
  }
}
