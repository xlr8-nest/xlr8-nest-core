import { Type } from '@nestjs/common';
import { COMMAND_HANDLER_METADATA } from './command-bus';
import { QUERY_HANDLER_METADATA } from './query-bus';

/**
 * Decorator to mark a class as a command handler
 * @param command The command class this handler handles
 */
export const CommandHandler = (command: Type): ClassDecorator => {
  return (target: object) => {
    Reflect.defineMetadata(COMMAND_HANDLER_METADATA, command, target);
  };
};

/**
 * Decorator to mark a class as a query handler
 * @param query The query class this handler handles
 */
export const QueryHandler = (query: Type): ClassDecorator => {
  return (target: object) => {
    Reflect.defineMetadata(QUERY_HANDLER_METADATA, query, target);
  };
};

import { SAGA_METADATA } from './domain-event-bus';

/**
 * Decorator to mark a method as a saga
 * Sagas are reactive workflows that listen to events and dispatch commands
 * 
 * @example
 * ```typescript
 * @Injectable()
 * export class UserSagas {
 *   @Saga()
 *   userCreated = (events$: Observable<DomainEvent>): Observable<ICommand> => {
 *     return events$.pipe(
 *       filter(event => event instanceof UserCreatedEvent),
 *       map(event => new SendWelcomeEmailCommand(event.userId))
 *     );
 *   }
 * }
 * ```
 */
export const Saga = (): PropertyDecorator => {
  return (target: object, propertyKey: string | symbol) => {
    Reflect.defineMetadata(SAGA_METADATA, true, target, propertyKey);
  };
};
