import { StatusCode } from '../../core/constants';
import { SuccessResponse } from '../../types';
import { BuildSuccessResponseOptions } from '../types';
import { SuccessResponseCode, getSuccessCode, getSuccessMessage } from '../response.constants';
import { maybeAttachStatusCode } from '../utils';

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
): SuccessResponse<TData, TCode> => {
  const statusCode = options.statusCode ?? StatusCode.SUCCESS;
  const response: SuccessResponse<TData, TCode> = {
    success: true,
    code: (options.code ?? getSuccessCode(statusCode)) as TCode,
    message: options.message ?? getSuccessMessage(statusCode),
    data,
  };

  return maybeAttachStatusCode(response, statusCode, options.includeStatusCode);
};
