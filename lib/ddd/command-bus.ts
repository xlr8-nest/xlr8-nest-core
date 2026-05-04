import { Injectable, Type, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { COMMAND_HANDLER_METADATA } from './common/metadata';
import { getModuleProviders } from './utils/provider-discovery.util';

export interface ICommand {}

export interface ICommandHandler<TCommand extends ICommand = ICommand, TResult = unknown> {
  execute(command: TCommand): Promise<TResult>;
}

export { COMMAND_HANDLER_METADATA } from './common/metadata';

@Injectable()
export class CommandBus implements OnModuleInit {
  private readonly logger = new Logger(CommandBus.name);
  private handlers = new Map<string, ICommandHandler<ICommand, unknown>>();

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit(): Promise<void> {
    await this.register();
  }

  /**
   * Execute a command
   */
  async execute<TCommand extends ICommand = ICommand, TResult = unknown>(
    command: TCommand,
  ): Promise<TResult> {
    const commandName = command.constructor.name;
    const handler = this.handlers.get(commandName);

    if (!handler) {
      const message = `Command handler not found for ${commandName}`;
      this.logger.error(message);
      throw new Error(message);
    }

    this.logger.debug(`Executing command: ${commandName}`);
    return (await handler.execute(command)) as TResult;
  }

  /**
   * Register a command handler
   */
  bind<TCommand extends ICommand = ICommand>(
    handler: ICommandHandler<TCommand>,
    command: Type<TCommand>,
  ): void {
    this.handlers.set(command.name, handler);
  }

  /**
   * Automatically discover and register all command handlers
   */
  private async register(): Promise<void> {
    const providers = getModuleProviders(this.moduleRef);

    providers.forEach((wrapper) => {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) {
        return;
      }

      const command = Reflect.getMetadata(COMMAND_HANDLER_METADATA, metatype) as
        | Type<ICommand>
        | undefined;
      if (!command) {
        return;
      }

      const handler = instance as ICommandHandler<ICommand, unknown>;
      this.bind(handler, command);

      this.logger.log(`Registered command handler: ${command.name}`);
    });
  }
}
