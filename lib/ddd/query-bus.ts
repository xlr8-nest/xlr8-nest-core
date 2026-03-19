import { Injectable, Type, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export interface IQuery {}

export interface IQueryHandler<TQuery extends IQuery = any, TResult = any> {
  execute(query: TQuery): Promise<TResult>;
}

export const QUERY_HANDLER_METADATA = '__queryHandler__';

@Injectable()
export class QueryBus implements OnModuleInit {
  private readonly logger = new Logger(QueryBus.name);
  private handlers = new Map<string, IQueryHandler>();

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    await this.register();
  }

  /**
   * Execute a query
   */
  async execute<TQuery extends IQuery = IQuery, TResult = any>(
    query: TQuery,
  ): Promise<TResult> {
    const queryName = query.constructor.name;
    const handler = this.handlers.get(queryName);

    if (!handler) {
      const message = `Query handler not found for ${queryName}`;
      this.logger.error(message);
      throw new Error(message);
    }

    this.logger.debug(`Executing query: ${queryName}`);
    return await handler.execute(query);
  }

  /**
   * Register a query handler
   */
  bind<TQuery extends IQuery = IQuery>(
    handler: IQueryHandler<TQuery>,
    query: Type<TQuery>,
  ) {
    this.handlers.set(query.name, handler);
  }

  /**
   * Automatically discover and register all query handlers
   */
  private async register() {
    const providers = [...this.moduleRef['container'].getModules().values()]
      .map((module) => module.providers)
      .reduce((acc, map) => {
        map.forEach((value, key) => acc.set(key, value));
        return acc;
      }, new Map());

    providers.forEach((wrapper: any) => {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) {
        return;
      }

      const query = Reflect.getMetadata(QUERY_HANDLER_METADATA, metatype);
      if (!query) {
        return;
      }

      const handler = instance as IQueryHandler;
      this.bind(handler, query);

      this.logger.log(`Registered query handler: ${query.name}`);
    });
  }
}
