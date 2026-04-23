import { DynamicModule, Global, Module, OnModuleInit } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { Provider } from '@nestjs/common/interfaces/modules/provider.interface';
import type { ModuleMetadata } from '@nestjs/common/interfaces/modules/module-metadata.interface';
import { DomainEventBus } from './domain-event-bus';
import { CommandBus } from './command-bus';
import { QueryBus } from './query-bus';

export interface DddModuleOptions {
  wildcard?: boolean;
  delimiter?: string;
  newListener?: boolean;
  removeListener?: boolean;
  maxListeners?: number;
  verboseMemoryLeak?: boolean;
  ignoreErrors?: boolean;
}

export interface CqrsModuleOptions {
  events?: boolean;
  commands?: boolean;
  queries?: boolean;
}

/**
 * DDD Module - Wrapper cho EventEmitterModule
 * 
 * Cung cấp DomainEventBus và tự động setup EventEmitter infrastructure
 * 
 * @example
 * ```typescript
 * // app.module.ts
 * @Module({
 *   imports: [
 *     DddModule.forRoot({
 *       wildcard: false,
 *       delimiter: '.',
 *       maxListeners: 10
 *     }),
 *     UserModule,
 *     OrderModule
 *   ]
 * })
 * export class AppModule {}
 * 
 * // user.module.ts
 * @Module({
 *   providers: [UserEventHandlers]
 * })
 * export class UserModule {}
 * 
 * // user.event-handlers.ts
 * @Injectable()
 * export class UserEventHandlers {
 *   @EventHandler(UserCreatedEvent)
 *   async onUserCreated(event: UserCreatedEvent) {
 *     // Handle event
 *   }
 * }
 * ```
 */
@Global()
@Module({})
export class DddModule {
  /**
   * Khởi tạo DddModule với EventEmitter configuration
   * @param options EventEmitter options (optional)
   */
  static forRoot(options?: DddModuleOptions): DynamicModule {
    return {
      module: DddModule,
      imports: [
        EventEmitterModule.forRoot(options || {
          // Default configuration
          wildcard: false,
          delimiter: '.',
          newListener: false,
          removeListener: false,
          maxListeners: 10,
          verboseMemoryLeak: false,
          ignoreErrors: false,
        })
      ],
      providers: [DomainEventBus],
      exports: [DomainEventBus],
    };
  }
}

/**
 * CQRS Module - Provides Command, Query, and Event buses
 * 
 * This is a convenience module that combines CQRS pattern with DDD
 * Use this instead of DddModule when you need full CQRS support
 * 
 * @example
 * ```typescript
 * // app.module.ts
 * @Module({
 *   imports: [
 *     CqrsModule.forRoot(),
 *     UserModule,
 *   ]
 * })
 * export class AppModule {}
 * 
 * // user.module.ts - Feature module
 * @Module({
 *   providers: [
 *     // Command handlers
 *     CreateUserHandler,
 *     // Query handlers
 *     GetUserHandler,
 *     // Event handlers
 *     UserEventHandlers,
 *   ]
 * })
 * export class UserModule {}
 * ```
 */
@Global()
@Module({})
export class CqrsModule implements OnModuleInit {
  constructor(
    private readonly domainEventBus: DomainEventBus,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    // Connect EventBus with CommandBus for Saga support
    this.domainEventBus.setCommandBus(this.commandBus);
  }

  /**
   * Initialize CQRS module with all buses
   */
  static forRoot(options?: CqrsModuleOptions & DddModuleOptions): DynamicModule {
    const cqrsOptions = {
      events: true,
      commands: true,
      queries: true,
      ...options,
    };

    const providers: Provider[] = [];
    const exportedProviders: NonNullable<ModuleMetadata['exports']> = [];

    // Always include EventBus (DomainEventBus)
    if (cqrsOptions.events) {
      providers.push(DomainEventBus);
      exportedProviders.push(DomainEventBus);
    }

    // Include CommandBus
    if (cqrsOptions.commands) {
      providers.push(CommandBus);
      exportedProviders.push(CommandBus);
    }

    // Include QueryBus
    if (cqrsOptions.queries) {
      providers.push(QueryBus);
      exportedProviders.push(QueryBus);
    }

    return {
      module: CqrsModule,
      imports: [
        EventEmitterModule.forRoot({
          wildcard: false,
          delimiter: '.',
          maxListeners: 10,
          ...options,
        })
      ],
      providers,
      exports: exportedProviders,
    };
  }
}
