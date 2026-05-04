import { DynamicModule, Global, Module, OnModuleInit, Optional } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { Provider } from '@nestjs/common/interfaces/modules/provider.interface';
import type { ModuleMetadata } from '@nestjs/common/interfaces/modules/module-metadata.interface';
import { CommandBus } from './command-bus';
import { EventBus } from './event-bus';
import type { EventModuleOptions } from './event.module';
import { QueryBus } from './query-bus';

export interface CqrsModuleOptions {
  events?: boolean;
  commands?: boolean;
  queries?: boolean;
}

/**
 * CQRS Module - Provides Command, Query, and Event buses
 *
 * This is a convenience module that combines CQRS pattern with DDD.
 * Use this instead of EventModule when you need full CQRS support.
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
    @Optional()
    private readonly eventBus?: EventBus,
    @Optional()
    private readonly commandBus?: CommandBus,
  ) {}

  onModuleInit(): void {
    if (this.eventBus && this.commandBus) {
      this.eventBus.setCommandBus(this.commandBus);
    }
  }

  /**
   * Initialize CQRS module with all buses
   */
  static forRoot(options?: CqrsModuleOptions & EventModuleOptions): DynamicModule {
    const cqrsOptions = {
      events: true,
      commands: true,
      queries: true,
      ...options,
    };

    const providers: Provider[] = [];
    const exportedProviders: NonNullable<ModuleMetadata['exports']> = [];

    if (cqrsOptions.events) {
      providers.push(EventBus);
      exportedProviders.push(EventBus);
    }

    if (cqrsOptions.commands) {
      providers.push(CommandBus);
      exportedProviders.push(CommandBus);
    }

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
        }),
      ],
      providers,
      exports: exportedProviders,
    };
  }
}
