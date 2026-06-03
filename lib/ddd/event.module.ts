import { DynamicModule, Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBus } from './event-bus';

export interface EventModuleOptions {
  wildcard?: boolean;
  delimiter?: string;
  newListener?: boolean;
  removeListener?: boolean;
  maxListeners?: number;
  verboseMemoryLeak?: boolean;
  ignoreErrors?: boolean;
}

/**
 * Event Module - Wrapper for EventEmitterModule
 *
 * Sets up EventEmitter infrastructure for domain event handlers.
 *
 * @example
 * ```typescript
 * // app.module.ts
 * @Module({
 *   imports: [
 *     EventModule.forRoot({
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
export class EventModule {
  /**
   * Initialize the event module with EventEmitter configuration
   * @param options EventEmitter options (optional)
   */
  static forRoot(options?: EventModuleOptions): DynamicModule {
    return {
      module: EventModule,
      imports: [
        // DiscoveryModule provides DiscoveryService, which EventBus uses to scan
        // for @Saga()-decorated providers. It must be imported here because this
        // module is what instantiates EventBus.
        DiscoveryModule,
        EventEmitterModule.forRoot(
          options || {
            // Default configuration
            wildcard: false,
            delimiter: '.',
            newListener: false,
            removeListener: false,
            maxListeners: 10,
            verboseMemoryLeak: false,
            ignoreErrors: false,
          },
        ),
      ],
      providers: [EventBus],
      exports: [EventBus],
    };
  }
}
