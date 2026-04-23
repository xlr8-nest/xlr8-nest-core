import { ErrorResponse, SuccessResponse } from '../types';
import { StatusCode } from '../core/constants';
import { ErrorDetails } from '../types/common/error.type';
import { DefaultErrorCode, SuccessResponseCode, getErrorDefault, getSuccessCode, getSuccessMessage } from './response.constants';
import { normalizeUnknownException } from './response.normalizer';
import {
  BuildErrorResponseOptions,
  BuildExceptionErrorResponseOptions,
  BuildSuccessResponseOptions,
  BuiltExceptionErrorResponse,
} from './response.types';
import { maybeAttachStatusCode } from './response.utils';

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

export const buildErrorResponse = <
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
>(
  options: BuildErrorResponseOptions<TErrors, TCode> = {},
): ErrorResponse<TErrors, TCode> => {
  const statusCode = options.statusCode ?? StatusCode.INTERNAL_SERVER_ERROR;
  const errorDefault = getErrorDefault(statusCode);
  const response: ErrorResponse<TErrors, TCode> = {
    success: false,
    code: (options.code ?? errorDefault.code) as TCode,
    message: options.message ?? errorDefault.message,
  };

  if (options.errors) {
    response.errors = options.errors;
  }

  return maybeAttachStatusCode(response, statusCode, options.includeStatusCode);
};

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
      code: normalized.code,
      message: normalized.message,
      errors: normalized.errors,
      includeStatusCode: options.includeStatusCode,
    }),
  };
};
