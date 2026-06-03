import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { AsyncLocalStorage } from 'async_hooks';
import { IUnitOfWork } from '../types';
@Injectable()
export class TypeOrmClient implements IUnitOfWork {
  private asyncLocalStorage = new AsyncLocalStorage<QueryRunner>();

  constructor(private readonly dataSource: DataSource) {}

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      return await this.asyncLocalStorage.run(queryRunner, async () => {
        try {
          const result = await fn();

          await queryRunner.commitTransaction();

          return result;
        } catch (error) {
          await queryRunner.rollbackTransaction();
          throw error;
        }
      });
    } finally {
      await queryRunner.release();
    }
  }

  /** The active transactional EntityManager, or the default DataSource.manager outside a transaction. */
  get manager(): EntityManager {
    const queryRunner = this.asyncLocalStorage.getStore();
    return queryRunner ? queryRunner.manager : this.dataSource.manager;
  }

  /** @deprecated Use `manager` instead. */
  get client(): EntityManager {
    return this.manager;
  }
}
