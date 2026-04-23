import { Injectable, Type, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export interface IQuery {}

export interface IQueryHandler<TQuery extends IQuery = IQuery, TResult = unknown> {
  execute(query: TQuery): Promise<TResult>;
}

export const QUERY_HANDLER_METADATA = '__queryHandler__';

interface HandlerWrapper {
  instance?: unknown;
  metatype?: Type<unknown>;
}

interface ModuleProviderMap {
  providers: Map<unknown, HandlerWrapper>;
}

interface NestContainerLike {
  getModules(): Map<unknown, ModuleProviderMap>;
}

@Injectable()
export class QueryBus implements OnModuleInit {
  private readonly logger = new Logger(QueryBus.name);
  private handlers = new Map<string, IQueryHandler<IQuery, unknown>>();

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit(): Promise<void> {
    await this.register();
  }

  /**
   * Execute a query
   */
  async execute<TQuery extends IQuery = IQuery, TResult = unknown>(
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
    return await handler.execute(query) as TResult;
  }

  /**
   * Register a query handler
   */
  bind<TQuery extends IQuery = IQuery>(
    handler: IQueryHandler<TQuery>,
    query: Type<TQuery>,
  ): void {
    this.handlers.set(query.name, handler);
  }

  /**
   * Automatically discover and register all query handlers
   */
  private async register(): Promise<void> {
    const container = this.moduleRef['container'] as NestContainerLike;
    const providers = [...container.getModules().values()]
      .map((module) => module.providers)
      .reduce<Map<unknown, HandlerWrapper>>((acc, map) => {
        map.forEach((value, key) => acc.set(key, value));
        return acc;
      }, new Map<unknown, HandlerWrapper>());

    providers.forEach((wrapper) => {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) {
        return;
      }

      const query = Reflect.getMetadata(QUERY_HANDLER_METADATA, metatype) as Type<IQuery> | undefined;
      if (!query) {
        return;
      }

      const handler = instance as IQueryHandler<IQuery, unknown>;
      this.bind(handler, query);

      this.logger.log(`Registered query handler: ${query.name}`);
    });
  }
}
