import { DynamicModule, Global, Module, OnModuleInit, Optional } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import type { Provider } from '@nestjs/common/interfaces/modules/provider.interface';
import type { ModuleMetadata } from '@nestjs/common/interfaces/modules/module-metadata.interface';
import { CommandBus } from './command-bus';
import { EventBus } from './event-bus';
import { EventModule, type EventModuleOptions } from './event.module';
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

    // NOTE: EventBus is intentionally NOT provided or exported here. It is
    // provided + exported by the imported EventModule, which is @Global, so a
    // single shared instance is available app-wide. Declaring it again in
    // CqrsModule would create a SECOND EventBus instance — the one returned by
    // app.get(EventBus) / injected elsewhere would then differ from the one
    // CqrsModule wires the CommandBus into, silently breaking saga → command
    // dispatch.

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
      // EventModule: import instead of EventEmitterModule directly so apps that
      // use both EventModule and CqrsModule only configure the emitter once.
      // DiscoveryModule: provides DiscoveryService used by CommandBus, QueryBus,
      // and EventBus for provider scanning — the official public API replaces the
      // former private container.getModules() approach.
      imports: [EventModule.forRoot(options), DiscoveryModule],
      providers,
      exports: exportedProviders,
    };
  }
}
