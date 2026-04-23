import { HttpException } from '@nestjs/common';
import { StatusCode } from '../core/constants';
import { BaseError } from '../errors';
import { ErrorDetails } from '../types/common/error.type';
import { getErrorDefault, DefaultErrorCode } from './response.constants';
import { getErrorsFromUnknown, getMessageFromUnknown, isBaseErrorLike, isResponseBodyRecord } from './response.guards';
import { BuildExceptionErrorResponseOptions, NormalizedException } from './response.types';

const normalizeHttpException = <
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
>(
  exception: HttpException,
  options: BuildExceptionErrorResponseOptions<TErrors, TCode>,
): NormalizedException<TErrors, TCode> => {
  const statusCode = exception.getStatus();
  const errorDefault = getErrorDefault(statusCode);
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return {
      statusCode,
      code: options.fallbackCode ?? (errorDefault.code as TCode),
      message: response,
      errors: options.fallbackErrors,
    };
  }

  if (isResponseBodyRecord(response)) {
    return {
      statusCode: typeof response.statusCode === 'number' ? response.statusCode : statusCode,
      code: (typeof response.code === 'string' ? response.code : options.fallbackCode ?? errorDefault.code) as TCode,
      message: getMessageFromUnknown(response.message ?? response.error, options.fallbackMessage ?? errorDefault.message),
      errors: getErrorsFromUnknown<TErrors>(response.errors) ?? options.fallbackErrors,
    };
  }

  return {
    statusCode,
    code: options.fallbackCode ?? (errorDefault.code as TCode),
    message: options.fallbackMessage ?? errorDefault.message,
    errors: options.fallbackErrors,
  };
};

export const normalizeUnknownException = <
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
>(
  exception: unknown,
  options: BuildExceptionErrorResponseOptions<TErrors, TCode>,
): NormalizedException<TErrors, TCode> => {
  const fallbackStatusCode = options.fallbackStatusCode ?? StatusCode.INTERNAL_SERVER_ERROR;
  const errorDefault = getErrorDefault(fallbackStatusCode);

  if (exception instanceof BaseError || isBaseErrorLike(exception)) {
    return {
      statusCode: exception.statusCode,
      code: exception.code as TCode,
      message: exception.message,
      errors: getErrorsFromUnknown<TErrors>(exception.errors) ?? options.fallbackErrors,
    };
  }

  if (exception instanceof HttpException) {
    return normalizeHttpException(exception, options);
  }

  if (exception instanceof Error) {
    return {
      statusCode: fallbackStatusCode,
      code: options.fallbackCode ?? (errorDefault.code as TCode),
      message: exception.message || options.fallbackMessage || errorDefault.message,
      errors: options.fallbackErrors,
    };
  }

  return {
    statusCode: fallbackStatusCode,
    code: options.fallbackCode ?? (errorDefault.code as TCode),
    message: options.fallbackMessage ?? errorDefault.message,
    errors: options.fallbackErrors,
  };
};
