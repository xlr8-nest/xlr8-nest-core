import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DiscoveryService } from '@nestjs/core';
import { DomainEvent } from './domain-event';
import { getEventName } from './domain-event.decorator';
import { Subject, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type {
  CommandBusLike,
  DomainEventHandler,
  EventConstructor,
  IEventBus,
  ISaga,
} from './common/event-bus.type';
import { SAGA_METADATA } from './common/metadata';

export type { DomainEventHandler, IEventBus, ISaga } from './common/event-bus.type';
export { SAGA_METADATA } from './common/metadata';

/**
 * Event bus - adapter for NestJS EventEmitter2
 * Use @EventHandler to mark handlers; NestJS registers them automatically.
 *
 * @example
 * ```typescript
 * // 1. Define event
 * @Event()
 * class UserCreatedEvent implements DomainEvent {
 *   constructor(
 *     public readonly userId: string,
 *     public readonly occurredOn: Date = new Date()
 *   ) {}
 *   get eventName(): string { return getEventName(this); }
 * }
 *
 * // 2. Create handler (Injectable provider)
 * @Injectable()
 * class UserEventHandlers {
 *   @EventHandler(UserCreatedEvent)
 *   async handle(event: UserCreatedEvent) {
 *     console.log('User created:', event.userId);
 *   }
 * }
 *
 * // 3. Register in module
 * @Module({
 *   providers: [UserEventHandlers]
 * })
 * class UserModule {}
 *
 * // 4. Publish events collected by an aggregate
 * await eventBus.publishAll(user.pullEvents());
 * ```
 */
@Injectable()
export class EventBus implements IEventBus, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBus.name);
  private readonly subject$ = new Subject<DomainEvent>();
  private sagas: Array<ISaga<DomainEvent>> = [];
  private readonly connectedSagas = new Set<ISaga<DomainEvent>>();
  private readonly subscriptions: Subscription[] = [];
  private commandBus?: CommandBusLike;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly discoveryService: DiscoveryService,
  ) {}

  onModuleInit(): void {
    this.setupSagas();
  }

  onModuleDestroy(): void {
    // Unsubscribe all tracked RxJS subscriptions to prevent memory leaks
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions.length = 0;
    this.subject$.complete();
  }

  /**
   * Set CommandBus (lazy injection)
   */
  setCommandBus(commandBus: CommandBusLike): void {
    this.commandBus = commandBus;
    this.connectSagasToCommandBus();
  }

  /**
   * Dispatch one domain event
   * Event name is taken from @Event decorator metadata or event.eventName
   *
   * Handlers are registered automatically through @EventHandler.
   */
  async publish<TEvent extends DomainEvent>(event: TEvent): Promise<void> {
    const eventName = getEventName(event);

    // Publish to EventEmitter2 (for @EventHandler)
    await this.eventEmitter.emitAsync(eventName, event);

    // Publish to RxJS subject (for Sagas)
    this.subject$.next(event);
  }

  /**
   * Dispatch multiple events sequentially.
   */
  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Subscribe to specific event type
   */
  subscribe<T extends DomainEvent>(
    eventType: EventConstructor<T>,
    handler: DomainEventHandler<T>,
  ): Subscription {
    const sub = this.subject$
      .pipe(filter((event): event is T => event instanceof eventType))
      .subscribe((event) => {
        void Promise.resolve(handler(event));
      });
    this.subscriptions.push(sub);
    return sub;
  }

  /**
   * Register a saga
   */
  registerSaga(saga: ISaga<DomainEvent>): void {
    this.sagas.push(saga);
    this.connectSagaToCommandBus(saga);
  }

  /**
   * Discover and register all @Saga()-decorated members using the official
   * DiscoveryService instead of private container internals.
   *
   * Scans candidate keys from BOTH the prototype (regular methods) and the
   * instance (arrow-function properties bound in the constructor — the form the
   * @Saga() JSDoc advertises). The SAGA_METADATA flag is read with the instance
   * as the target so it resolves through the prototype chain regardless of where
   * the saga function value lives.
   */
  private setupSagas(): void {
    const providers = this.discoveryService.getProviders();
    const seen = new Set<object>();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (typeof instance !== 'object' || instance === null || seen.has(instance)) continue;
      seen.add(instance);

      const prototype = Object.getPrototypeOf(instance) as object | null;
      const candidateKeys = new Set<string>([
        ...(prototype ? Object.getOwnPropertyNames(prototype) : []),
        ...Object.getOwnPropertyNames(instance),
      ]);

      for (const methodName of candidateKeys) {
        if (methodName === 'constructor') continue;

        const hasSagaMeta = Reflect.getMetadata(SAGA_METADATA, instance, methodName) as unknown;
        if (!hasSagaMeta) continue;

        const candidate = (instance as Record<string, unknown>)[methodName];
        if (typeof candidate !== 'function') continue;

        this.registerSaga((candidate as ISaga<DomainEvent>).bind(instance) as ISaga<DomainEvent>);
        this.logger.log(
          `Registered saga: ${(instance as { constructor: { name: string } }).constructor.name}.${methodName}`,
        );
      }
    }

    this.connectSagasToCommandBus();
  }

  private connectSagasToCommandBus(): void {
    this.sagas.forEach((saga) => this.connectSagaToCommandBus(saga));
  }

  private connectSagaToCommandBus(saga: ISaga<DomainEvent>): void {
    if (!this.commandBus || this.connectedSagas.has(saga)) {
      return;
    }

    this.connectedSagas.add(saga);
    const command$ = saga(this.subject$);
    const sub = command$.subscribe({
      next: (command) => {
        void this.commandBus?.execute(command).catch((err: Error) => {
          this.logger.error(`Saga command execution failed: ${err.message}`, err.stack);
        });
      },
      error: (err: Error) => {
        // Keep the outer subscription alive; the saga observable errored.
        this.logger.error(`Saga observable errored: ${err.message}`, err.stack);
      },
    });
    this.subscriptions.push(sub);
  }
}
