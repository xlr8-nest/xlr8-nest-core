import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseSchema, DetailErrorSchema } from '../schema';
import { CommonErrors } from '../../core/constants';
interface ApiErrorOptions {
  /** Custom error code to display in the response */
  code: string;
  /** Human-readable error message */
  message?: string;
  /** Whether to include errors array in the response schema (default: false) */
  includeErrors?: boolean;
}

/**
 * Decorator for documenting error responses with custom error codes
 * Use this decorator to document specific error responses for an endpoint
 *
 * @example
 * ```typescript
 * @Post()
 * @ApiCreate(UserOutput, { summary: 'Create user' })
 * @ApiError(400, { code: 'VALIDATION_ERROR', message: 'Invalid input data', includeErrors: true })
 * @ApiError(409, { code: 'USER_EMAIL_EXISTS', message: 'Email already registered' })
 * async createUser() {}
 * ```
 */
export const ApiError = (statusCode: number, options: ApiErrorOptions) => {
  const description =
    options.message || `Error response with code ${options.code}`;

  const properties: Record<string, any> = {
    success: { type: 'boolean', example: false },
    code: { type: 'string', example: options.code },
    message: { type: 'string', example: description },
  };

  // Only include errors array if explicitly requested
  if (options.includeErrors) {
    properties.errors = {
      type: 'object',
      name: 'field',
      additionalProperties: {
        $ref: getSchemaPath(DetailErrorSchema),
      },
    };
  }

  return applyDecorators(
    ApiExtraModels(ErrorResponseSchema),
    ApiResponse({
      status: statusCode,
      description,
      schema: {
        type: 'object',
        properties,
        required: ['success', 'code', 'message'],
      },
    })
  );
};

/**
 * Shorthand decorator for 400 Bad Request errors (includes errors array by default)
 */
export const ApiBadRequest = ({
  code = CommonErrors.BadRequestError.code,
  message = CommonErrors.BadRequestError.message,
  includeErrors,
}: ApiErrorOptions) => ApiError(400, { code, message, includeErrors });

/**
 * Shorthand decorator for 401 Unauthorized errors (no errors array)
 */
export const ApiUnauthorized = ({
  code = CommonErrors.UnauthorizedError.code,
  message = CommonErrors.UnauthorizedError.message,
}: ApiErrorOptions) => ApiError(401, { code, message });

/**
 * Shorthand decorator for 403 Forbidden errors (no errors array)
 */
export const ApiForbidden = ({
  code = CommonErrors.ForbiddenError.code,
  message = CommonErrors.ForbiddenError.message,
}: ApiErrorOptions) => ApiError(403, { code, message });

/**
 * Shorthand decorator for 404 Not Found errors (includes errors array by default)
 */
export const ApiNotFound = ({
  code = CommonErrors.NotFoundError.code,
  message = CommonErrors.NotFoundError.message,
  includeErrors,
}: ApiErrorOptions) => ApiError(404, { code, message, includeErrors });

/**
 * Shorthand decorator for 409 Conflict errors (includes errors array by default)
 */
export const ApiConflict = ({
  code = CommonErrors.ConflictError.code,
  message = CommonErrors.ConflictError.message,
  includeErrors,
}: ApiErrorOptions) => ApiError(409, { code, message, includeErrors });

/**
 * Shorthand decorator for 500 Internal Server Error (no errors array)
 */
export const ApiInternalError = ({
  code = CommonErrors.InternalServerError.code,
  message = CommonErrors.InternalServerError.message,
  includeErrors,
}: ApiErrorOptions) => ApiError(500, { code, message, includeErrors });
