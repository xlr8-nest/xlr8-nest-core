import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { DomainEvent } from './domain-event';
import { getEventName } from './domain-event.decorator';
import { Subject, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ICommand } from './command-bus';

export type DomainEventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => void | Promise<void>;

export interface IDomainEventBus {
  publish<TEvent extends DomainEvent>(event: TEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
}

export interface ISaga<TEvent extends DomainEvent = DomainEvent> {
  (events$: Subject<TEvent>): Subject<ICommand>;
}

export const SAGA_METADATA = '__saga__';

/**
 * Domain Event Bus - Adapter cho NestJS EventEmitter2
 * Sử dụng @EventHandler decorator để đánh dấu handlers, NestJS sẽ tự động đăng ký
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
 * // 4. Publish event
 * await eventBus.publish(new UserCreatedEvent('123'));
 * ```
 */
@Injectable()
export class DomainEventBus implements IDomainEventBus, OnModuleInit {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly subject$ = new Subject<DomainEvent>();
  private sagas: ISaga[] = [];
  private commandBus: any; // Lazy injection to avoid circular dependency

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly moduleRef: ModuleRef,
  ) { }

  async onModuleInit() {
    await this.setupSagas();
  }

  /**
   * Set CommandBus (lazy injection)
   */
  setCommandBus(commandBus: any) {
    this.commandBus = commandBus;
  }

  /**
   * Publish một domain event
   * Event name sẽ được lấy từ @Event decorator hoặc event.eventName
   * 
   * Handlers được đăng ký tự động thông qua @EventHandler decorator
   * Không cần gọi register() thủ công
   */
  async publish<TEvent extends DomainEvent>(event: TEvent): Promise<void> {
    const eventName = getEventName(event);

    // Publish to EventEmitter2 (for @EventHandler)
    await this.eventEmitter.emitAsync(eventName, event);

    // Publish to RxJS subject (for Sagas)
    this.subject$.next(event);
  }

  /**
   * Publish nhiều events tuần tự
   * Đảm bảo events được xử lý theo thứ tự
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
    eventType: new (...args: any[]) => T,
    handler: (event: T) => void,
  ): Subscription {
    return this.subject$
      .pipe(filter((event) => event instanceof eventType))
      .subscribe(handler as any);
  }

  /**
   * Register a saga
   */
  registerSaga(saga: ISaga) {
    this.sagas.push(saga);
  }

  /**
   * Setup sagas - discover and register all sagas
   */
  private async setupSagas() {
    const providers = [...this.moduleRef['container'].getModules().values()]
      .map((module) => module.providers)
      .reduce((acc, map) => {
        map.forEach((value: any, key) => acc.set(key, value));
        return acc;
      }, new Map());

    providers.forEach((wrapper: any) => {
      const { instance } = wrapper;
      if (!instance) {
        return;
      }

      const sagas = this.getSagas(instance);
      sagas.forEach((saga) => {
        this.registerSaga(saga.bind(instance));
        this.logger.log(`Registered saga: ${instance.constructor.name}.${saga.name}`);
      });
    });

    // Connect sagas to command bus
    if (this.commandBus && this.sagas.length > 0) {
      this.sagas.forEach((saga) => {
        const command$ = saga(this.subject$ as any);
        command$.subscribe((command) => {
          this.commandBus.execute(command).catch((err: Error) => {
            this.logger.error(`Saga command execution failed: ${err.message}`, err.stack);
          });
        });
      });
    }
  }

  /**
   * Get all saga methods from an instance
   */
  private getSagas(instance: any): Function[] {
    try {
      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) return [];

      const propertyNames = Object.getOwnPropertyNames(prototype);

      return propertyNames
        .map((name) => {
          try {
            const property = prototype[name];
            if (typeof property !== 'function') {
              return null;
            }
            const metadata = Reflect.getMetadata(SAGA_METADATA, instance, name);
            return metadata ? property : null;
          } catch {
            // Skip properties that throw when accessed (e.g., HttpAdapterHost getters)
            return null;
          }
        })
        .filter((saga) => saga !== null) as Function[];
    } catch {
      // If we can't get prototype, return empty array
      return [];
    }
  }
}
