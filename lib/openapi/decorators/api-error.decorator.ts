import { CommonErrors } from '../../core/constants';
import type { ErrorType } from '../../types/common/error.type';
import { ApiErrorResponse, ApiErrorWrapperFactory } from './api-wrapper.decorator';

export interface ApiErrorOptions {
  /** Stable error definition to display in the response */
  error: ErrorType<string>;
  /** Whether to include field-level errors in the response schema (default: false) */
  includeErrors?: boolean;
  /** Optional wrapper factory to customize the error response envelope */
  wrapper?: ApiErrorWrapperFactory;
}

export type ApiErrorShortcutOptions = Omit<ApiErrorOptions, 'error'> & {
  error?: ErrorType<string>;
};

/**
 * Decorator for documenting error responses with custom error codes
 * Use this decorator to document specific error responses for an endpoint
 *
 * @example
 * ```typescript
 * @Post()
 * @ApiPost(UserOutput, { summary: 'Create user' })
 * @ApiError(400, {
 *   error: { code: 'VALIDATION_ERROR', message: 'Invalid input data' },
 *   includeErrors: true,
 * })
 * @ApiError(409, {
 *   error: { code: 'USER_EMAIL_EXISTS', message: 'Email already registered' },
 * })
 * async createUser() {}
 * ```
 */
export const ApiError = (statusCode: number, options: ApiErrorOptions) => {
  return ApiErrorResponse(statusCode, options.error, {
    includeErrors: options.includeErrors,
    wrapper: options.wrapper,
  });
};

/**
 * Shorthand decorator for 400 Bad Request errors
 */
export const ApiBadRequest = ({
  error = CommonErrors.BadRequestError,
  includeErrors,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(400, { error, includeErrors, wrapper });

/**
 * Shorthand decorator for 401 Unauthorized errors (no errors array)
 */
export const ApiUnauthorized = ({
  error = CommonErrors.UnauthorizedError,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(401, { error, wrapper });

/**
 * Shorthand decorator for 403 Forbidden errors (no errors array)
 */
export const ApiForbidden = ({
  error = CommonErrors.ForbiddenError,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(403, { error, wrapper });

/**
 * Shorthand decorator for 404 Not Found errors
 */
export const ApiNotFound = ({
  error = CommonErrors.NotFoundError,
  includeErrors,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(404, { error, includeErrors, wrapper });

/**
 * Shorthand decorator for 409 Conflict errors
 */
export const ApiConflict = ({
  error = CommonErrors.ConflictError,
  includeErrors,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(409, { error, includeErrors, wrapper });

/**
 * Shorthand decorator for 500 Internal Server Error (no errors array)
 */
export const ApiInternalError = ({
  error = CommonErrors.InternalServerError,
  includeErrors,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(500, { error, includeErrors, wrapper });
