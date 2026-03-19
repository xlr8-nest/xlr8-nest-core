import { DataSource } from 'typeorm';

/**
 * Abstract base class for database seeders
 * Implement the run() method to define your seeding logic
 */
export abstract class BaseSeeder {
  /**
   * Run the seeder
   * @param dataSource - TypeORM DataSource instance
   */
  abstract run(dataSource: DataSource): Promise<void>;
}
