import { Logger, OnModuleInit, Type } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { NotFoundError } from '../errors/not-found.error';

/** Generic handler interface: `execute(message): Promise<TResult>`. */
export interface IMessageHandler<TMessage, TResult = unknown> {
  execute(message: TMessage): Promise<TResult>;
}

/**
 * Shared discovery + dispatch base for CommandBus and QueryBus.
 *
 * Uses the official DiscoveryService from @nestjs/core instead of private
 * container internals, so it is stable across Nest 9–12+.
 *
 * Subclasses supply the Reflect metadata key and a human-readable message kind.
 */
export abstract class AbstractMessageBus<TMessage> implements OnModuleInit {
  protected readonly logger: Logger;
  private readonly handlers = new Map<Type<TMessage>, IMessageHandler<TMessage>>();

  constructor(
    protected readonly discoveryService: DiscoveryService,
    /** The Reflect metadata key set by the handler decorator (e.g. COMMAND_HANDLER_METADATA). */
    private readonly metadataKey: string,
    /** Human-readable label used in error/log messages. */
    private readonly messageKind: string,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  onModuleInit(): void {
    this.discover();
  }

  async execute<TResult = unknown>(message: TMessage): Promise<TResult> {
    const ctor = (message as object).constructor as Type<TMessage>;
    const handler = this.handlers.get(ctor);

    if (!handler) {
      const name = ctor.name;
      this.logger.error(`${this.messageKind} handler not found for "${name}"`);
      throw new NotFoundError({
        code: `${this.messageKind.toUpperCase()}_HANDLER_NOT_FOUND`,
        message: `No handler registered for ${this.messageKind} "${name}". Add a class decorated with @${this.messageKind}Handler(${name}).`,
      });
    }

    this.logger.debug(`Executing ${this.messageKind}: ${ctor.name}`);
    return (await handler.execute(message)) as TResult;
  }

  bind(handler: IMessageHandler<TMessage>, messageCtor: Type<TMessage>): void {
    if (this.handlers.has(messageCtor)) {
      this.logger.warn(`Overwriting ${this.messageKind} handler for "${messageCtor.name}"`);
    }
    this.handlers.set(messageCtor, handler);
    this.logger.log(`Registered ${this.messageKind} handler: ${messageCtor.name}`);
  }

  private discover(): void {
    const providers = this.discoveryService.getProviders();
    // Track seen metatypes so alias registrations don't trigger duplicate-handler warnings.
    const seen = new Set<Type<unknown>>();

    for (const wrapper of providers) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype || seen.has(metatype as Type<unknown>)) continue;
      seen.add(metatype as Type<unknown>);

      const messageCtor = Reflect.getMetadata(this.metadataKey, metatype) as
        | Type<TMessage>
        | undefined;
      if (!messageCtor) continue;

      this.bind(instance as IMessageHandler<TMessage>, messageCtor);
    }
  }
}
