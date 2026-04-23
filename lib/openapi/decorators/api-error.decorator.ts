import { CommonErrors } from '../../core/constants';
import { ApiErrorResponse, ApiErrorWrapperFactory } from './api-wrapper.decorator';

export interface ApiErrorOptions {
  /** Custom error code to display in the response */
  code: string;
  /** Human-readable error message */
  message?: string;
  /** Whether to include field-level errors in the response schema (default: false) */
  includeErrors?: boolean;
  /** Optional wrapper factory to customize the error response envelope */
  wrapper?: ApiErrorWrapperFactory;
}

export type ApiErrorShortcutOptions = Omit<ApiErrorOptions, 'code'> & {
  code?: string;
};

/**
 * Decorator for documenting error responses with custom error codes
 * Use this decorator to document specific error responses for an endpoint
 *
 * @example
 * ```typescript
 * @Post()
 * @ApiPost(UserOutput, { summary: 'Create user' })
 * @ApiError(400, { code: 'VALIDATION_ERROR', message: 'Invalid input data', includeErrors: true })
 * @ApiError(409, { code: 'USER_EMAIL_EXISTS', message: 'Email already registered' })
 * async createUser() {}
 * ```
 */
export const ApiError = (statusCode: number, options: ApiErrorOptions) => {
  const description = options.message || `Error response with code ${options.code}`;

  return ApiErrorResponse(statusCode, description, options.code, {
    includeErrors: options.includeErrors,
    wrapper: options.wrapper,
  });
};

/**
 * Shorthand decorator for 400 Bad Request errors
 */
export const ApiBadRequest = ({
  code = CommonErrors.BadRequestError.code,
  message = CommonErrors.BadRequestError.message,
  includeErrors,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(400, { code, message, includeErrors, wrapper });

/**
 * Shorthand decorator for 401 Unauthorized errors (no errors array)
 */
export const ApiUnauthorized = ({
  code = CommonErrors.UnauthorizedError.code,
  message = CommonErrors.UnauthorizedError.message,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(401, { code, message, wrapper });

/**
 * Shorthand decorator for 403 Forbidden errors (no errors array)
 */
export const ApiForbidden = ({
  code = CommonErrors.ForbiddenError.code,
  message = CommonErrors.ForbiddenError.message,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(403, { code, message, wrapper });

/**
 * Shorthand decorator for 404 Not Found errors
 */
export const ApiNotFound = ({
  code = CommonErrors.NotFoundError.code,
  message = CommonErrors.NotFoundError.message,
  includeErrors,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(404, { code, message, includeErrors, wrapper });

/**
 * Shorthand decorator for 409 Conflict errors
 */
export const ApiConflict = ({
  code = CommonErrors.ConflictError.code,
  message = CommonErrors.ConflictError.message,
  includeErrors,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(409, { code, message, includeErrors, wrapper });

/**
 * Shorthand decorator for 500 Internal Server Error (no errors array)
 */
export const ApiInternalError = ({
  code = CommonErrors.InternalServerError.code,
  message = CommonErrors.InternalServerError.message,
  includeErrors,
  wrapper,
}: ApiErrorShortcutOptions = {}) => ApiError(500, { code, message, includeErrors, wrapper });
