import { faker } from '@faker-js/faker';
import { DataSource, EntityTarget, Repository, ObjectLiteral } from 'typeorm';

/**
 * Abstract base class for entity factories
 * Provides faker integration and common factory patterns
 */
export abstract class BaseFactory<Entity extends ObjectLiteral> {
  protected readonly faker = faker;
  protected readonly repository: Repository<Entity>;

  constructor(
    protected readonly dataSource: DataSource,
    protected readonly entity: EntityTarget<Entity>,
  ) {
    this.repository = dataSource.getRepository(entity);
  }

  /**
   * Define the default attributes for the entity
   * Override this method to define your factory attributes
   */
  protected abstract definition(): Partial<Entity> | Promise<Partial<Entity>>;

  /**
   * Make a single entity instance without saving
   */
  async make(overrides?: Partial<Entity>): Promise<Entity> {
    const definition = await this.definition();
    const attributes = { ...definition, ...overrides };
    return this.repository.create(attributes as Entity);
  }

  /**
   * Make multiple entity instances without saving
   */
  async makeMany(count: number, overrides?: Partial<Entity>): Promise<Entity[]> {
    const entities: Entity[] = [];
    for (let i = 0; i < count; i++) {
      entities.push(await this.make(overrides));
    }
    return entities;
  }

  /**
   * Create and save a single entity
   */
  async create(overrides?: Partial<Entity>): Promise<Entity> {
    const entity = await this.make(overrides);
    return this.repository.save(entity);
  }

  /**
   * Create and save multiple entities
   */
  async createMany(count: number, overrides?: Partial<Entity>): Promise<Entity[]> {
    const entities = await this.makeMany(count, overrides);
    return this.repository.save(entities);
  }

  /**
   * Create entities with different attributes for each
   */
  async createEach(items: Partial<Entity>[]): Promise<Entity[]> {
    const entities = await Promise.all(items.map((item) => this.make(item)));
    return this.repository.save(entities);
  }

  /**
   * Get the count of existing entities
   */
  async count(): Promise<number> {
    return this.repository.count();
  }

  /**
   * Clear all entities from the table
   */
  async clear(): Promise<void> {
    await this.repository.clear();
  }

  /**
   * Reset faker seed for reproducible data
   */
  protected resetSeed(seed: number = 12345): void {
    faker.seed(seed);
  }
}
