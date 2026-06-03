import type { EntityManager } from 'typeorm';

export const IUnitOfWorkToken = Symbol('IUnitOfWork');

export interface IUnitOfWork {
  /**
   * Executes `fn` inside a database transaction. Commits on success, rolls
   * back on error. Returns whatever `fn` returns.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * The active transactional `EntityManager` when called from inside a
   * `transaction()` callback, or the default `DataSource.manager` otherwise.
   *
   * Use this instead of casting to the concrete `TypeOrmClient` class.
   */
  readonly manager: EntityManager;
}
