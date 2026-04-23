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

type EventConstructor<TEvent extends DomainEvent> = new (...args: never[]) => TEvent;

interface CommandBusLike {
  execute(command: ICommand): Promise<unknown>;
}

interface ProviderWrapperLike {
  instance?: object;
}

interface ModuleProviderMap {
  providers: Map<unknown, ProviderWrapperLike>;
}

interface NestContainerLike {
  getModules(): Map<unknown, ModuleProviderMap>;
}

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
  private sagas: Array<ISaga<DomainEvent>> = [];
  private commandBus?: CommandBusLike;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly moduleRef: ModuleRef,
  ) { }

  async onModuleInit(): Promise<void> {
    await this.setupSagas();
  }

  /**
   * Set CommandBus (lazy injection)
   */
  setCommandBus(commandBus: CommandBusLike): void {
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
  }

  /**
   * Setup sagas - discover and register all sagas
   */
  private async setupSagas(): Promise<void> {
    const container = this.moduleRef['container'] as NestContainerLike;
    const providers = [...container.getModules().values()]
      .map((module) => module.providers)
      .reduce<Map<unknown, ProviderWrapperLike>>((acc, map) => {
        map.forEach((value, key) => acc.set(key, value));
        return acc;
      }, new Map<unknown, ProviderWrapperLike>());

    providers.forEach((wrapper) => {
      const { instance } = wrapper;
      if (!instance) {
        return;
      }

      const sagas = this.getSagas(instance);
      sagas.forEach((saga) => {
        this.registerSaga(saga.bind(instance) as ISaga<DomainEvent>);
        this.logger.log(`Registered saga: ${instance.constructor.name}.${saga.name}`);
      });
    });

    // Connect sagas to command bus
    if (this.commandBus && this.sagas.length > 0) {
      this.sagas.forEach((saga) => {
        const command$ = saga(this.subject$);
        command$.subscribe((command) => {
          void this.commandBus?.execute(command).catch((err: Error) => {
            this.logger.error(`Saga command execution failed: ${err.message}`, err.stack);
          });
        });
      });
    }
  }

  /**
   * Get all saga methods from an instance
   */
  private getSagas(instance: object): Array<ISaga<DomainEvent>> {
    try {
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown> | null;
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
            return metadata ? (property as ISaga<DomainEvent>) : null;
          } catch {
            // Skip properties that throw when accessed (e.g., HttpAdapterHost getters)
            return null;
          }
        })
        .filter((saga): saga is ISaga<DomainEvent> => saga !== null);
    } catch {
      // If we can't get prototype, return empty array
      return [];
    }
  }
}
