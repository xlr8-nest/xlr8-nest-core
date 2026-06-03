import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { QUERY_HANDLER_METADATA } from './common/metadata';
import { AbstractMessageBus } from './abstract-message-bus';

export interface IQuery {}

export interface IQueryHandler<TQuery extends IQuery = IQuery, TResult = unknown> {
  execute(query: TQuery): Promise<TResult>;
}

export { QUERY_HANDLER_METADATA } from './common/metadata';

@Injectable()
export class QueryBus extends AbstractMessageBus<IQuery> {
  constructor(discoveryService: DiscoveryService) {
    super(discoveryService, QUERY_HANDLER_METADATA, 'Query');
  }
}
