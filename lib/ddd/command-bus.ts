import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { COMMAND_HANDLER_METADATA } from './common/metadata';
import { AbstractMessageBus } from './abstract-message-bus';

export interface ICommand {}

export interface ICommandHandler<TCommand extends ICommand = ICommand, TResult = unknown> {
  execute(command: TCommand): Promise<TResult>;
}

export { COMMAND_HANDLER_METADATA } from './common/metadata';

@Injectable()
export class CommandBus extends AbstractMessageBus<ICommand> {
  constructor(discoveryService: DiscoveryService) {
    super(discoveryService, COMMAND_HANDLER_METADATA, 'Command');
  }
}
