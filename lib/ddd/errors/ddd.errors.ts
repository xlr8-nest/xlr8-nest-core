import type { ErrorType } from '../../types/common/error.type';

/**
 * Named error constants for the DDD / CQRS message buses.
 *
 * These codes are used by `CommandBus` and `QueryBus` when a dispatched
 * message has no registered handler. They are exported from
 * `@xlr8-nest/core/ddd` so application code can pattern-match on them.
 *
 * @example
 * import { DddErrors } from '@xlr8-nest/core/ddd';
 *
 * try {
 *   await commandBus.execute(cmd);
 * } catch (err) {
 *   if (err instanceof NotFoundError && err.code === DddErrors.CommandHandlerNotFound.code) {
 *     // handle missing handler
 *   }
 * }
 */
export const DddErrors = {
  /**
   * `CommandBus.execute()`: no `@CommandHandler` is registered for the
   * dispatched command class. → `NotFoundError` (HTTP 404).
   */
  CommandHandlerNotFound: {
    code: 'DDD_COMMAND_HANDLER_NOT_FOUND',
    message: 'No handler is registered for this Command.',
  },

  /**
   * `QueryBus.execute()`: no `@QueryHandler` is registered for the
   * dispatched query class. → `NotFoundError` (HTTP 404).
   */
  QueryHandlerNotFound: {
    code: 'DDD_QUERY_HANDLER_NOT_FOUND',
    message: 'No handler is registered for this Query.',
  },
} as const satisfies Record<string, ErrorType>;
