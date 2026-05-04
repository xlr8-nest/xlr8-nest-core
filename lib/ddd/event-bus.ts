import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
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
import { getModuleProviders } from './utils/provider-discovery.util';
import { getSagas } from './utils/saga-discovery.util';

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
export class EventBus implements IEventBus, OnModuleInit {
  private readonly logger = new Logger(EventBus.name);
  private readonly subject$ = new Subject<DomainEvent>();
  private sagas: Array<ISaga<DomainEvent>> = [];
  private readonly connectedSagas = new Set<ISaga<DomainEvent>>();
  private commandBus?: CommandBusLike;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.setupSagas();
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
    return this.subject$
      .pipe(filter((event): event is T => event instanceof eventType))
      .subscribe((event) => {
        void Promise.resolve(handler(event));
      });
  }

  /**
   * Register a saga
   */
  registerSaga(saga: ISaga<DomainEvent>): void {
    this.sagas.push(saga);
    this.connectSagaToCommandBus(saga);
  }

  /**
   * Setup sagas - discover and register all sagas
   */
  private async setupSagas(): Promise<void> {
    const providers = getModuleProviders(this.moduleRef);

    providers.forEach((wrapper) => {
      const { instance } = wrapper;
      if (typeof instance !== 'object' || instance === null) {
        return;
      }

      const sagas = getSagas(instance);
      sagas.forEach((saga) => {
        this.registerSaga(saga.bind(instance) as ISaga<DomainEvent>);
        this.logger.log(`Registered saga: ${instance.constructor.name}.${saga.name}`);
      });
    });

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
    command$.subscribe((command) => {
      void this.commandBus?.execute(command).catch((err: Error) => {
        this.logger.error(`Saga command execution failed: ${err.message}`, err.stack);
      });
    });
  }
}
