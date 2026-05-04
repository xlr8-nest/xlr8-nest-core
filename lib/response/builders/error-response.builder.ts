import { ErrorResponse } from '../../types';
import { ErrorDetails } from '../../types/common/error.type';
import { buildErrorBody } from '../common';
import { normalizeUnknownException } from '../normalizers';
import { DefaultErrorCode } from '../response.constants';
import { BuildErrorResponseOptions } from '../types';

/**
 * Build a standard error payload. Pass an exception to derive the status,
 * code/message, and details from the exception when possible.
 *
 * @example
 * ```ts
 * return buildErrorResponse(new BadRequestError());
 * ```
 */
export const buildErrorResponse = <
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
>(
  exception: unknown,
  options: BuildErrorResponseOptions<TErrors, TCode> = {},
): ErrorResponse<TErrors, TCode> => {
  const normalized = normalizeUnknownException(exception, options);

  return buildErrorBody(normalized, options.includeStatusCode);
};
