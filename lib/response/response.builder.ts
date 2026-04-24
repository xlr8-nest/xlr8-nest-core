import { ErrorResponse, SuccessResponse } from '../types';
import { StatusCode } from '../core/constants';
import { ErrorDetails, ErrorType } from '../types/common/error.type';
import { DefaultErrorCode, SuccessResponseCode, getErrorDefault, getSuccessCode, getSuccessMessage } from './response.constants';
import { normalizeUnknownException } from './response.normalizer';
import {
  BuildErrorResponseOptions,
  BuildExceptionErrorResponseOptions,
  BuildSuccessResponseOptions,
  BuiltExceptionErrorResponse,
} from './response.types';
import { maybeAttachStatusCode } from './response.utils';

/**
 * Build a standard success payload from any controller or service result.
 *
 * @example
 * ```ts
 * return buildSuccessResponse(user);
 * ```
 */
export const buildSuccessResponse = <TData, TCode extends string = SuccessResponseCode>(
  data: TData,
  options: BuildSuccessResponseOptions<TCode> = {},
) : SuccessResponse<TData, TCode> => {
  const statusCode = options.statusCode ?? StatusCode.SUCCESS;
  const response: SuccessResponse<TData, TCode> = {
    success: true,
    code: (options.code ?? getSuccessCode(statusCode)) as TCode,
    message: options.message ?? getSuccessMessage(statusCode),
    data,
  };

  return maybeAttachStatusCode(response, statusCode, options.includeStatusCode);
};

/**
 * Build a standard error payload from an `ErrorType`
 * with optional field-level `errors`.
 *
 * @example
 * ```ts
 * return buildErrorResponse({
 *   statusCode: 404,
 *   error: { code: 'USER_NOT_FOUND', message: 'User not found' },
 * });
 * ```
 */
export const buildErrorResponse = <
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
>(
  options: BuildErrorResponseOptions<TErrors, TCode> = {},
): ErrorResponse<TErrors, TCode> => {
  const statusCode = options.statusCode ?? StatusCode.INTERNAL_SERVER_ERROR;
  const error = (options.error ?? getErrorDefault(statusCode)) as ErrorType<TCode>;
  const response: ErrorResponse<TErrors, TCode> = {
    success: false,
    code: error.code,
    message: error.message,
  };

  if (options.errors) {
    response.errors = options.errors;
  }

  return maybeAttachStatusCode(response, statusCode, options.includeStatusCode);
};

/**
 * Normalize an unknown exception and build the standard error payload
 * for use inside Nest exception filters.
 *
 * @example
 * ```ts
 * const { statusCode, body } = buildExceptionErrorResponse(exception, {
 *   fallbackError: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' },
 * });
 * ```
 */
export const buildExceptionErrorResponse = <
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
>(
  exception: unknown,
  options: BuildExceptionErrorResponseOptions<TErrors, TCode> = {},
): BuiltExceptionErrorResponse<TErrors, TCode> => {
  const normalized = normalizeUnknownException(exception, options);

  return {
    statusCode: normalized.statusCode,
    body: buildErrorResponse<TErrors, TCode>({
      statusCode: normalized.statusCode,
      error: normalized.error,
      errors: normalized.errors,
      includeStatusCode: options.includeStatusCode,
    }),
  };
};
