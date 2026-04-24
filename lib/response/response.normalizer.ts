import { HttpException } from '@nestjs/common';
import { StatusCode } from '../core/constants';
import { BaseError } from '../errors';
import { ErrorDetails, ErrorType } from '../types/common/error.type';
import { getErrorDefault, DefaultErrorCode } from './response.constants';
import { getErrorsFromUnknown, getMessageFromUnknown, isBaseErrorLike, isResponseBodyRecord } from './response.guards';
import { BuildExceptionErrorResponseOptions, NormalizedException } from './response.types';

const getFallbackError = <TCode extends string>(
  statusCode: number,
  options: BuildExceptionErrorResponseOptions<ErrorDetails | undefined, TCode>,
): ErrorType<TCode> => {
  return (options.fallbackError ?? getErrorDefault(statusCode)) as ErrorType<TCode>;
};

const normalizeHttpException = <
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
>(
  exception: HttpException,
  options: BuildExceptionErrorResponseOptions<TErrors, TCode>,
): NormalizedException<TErrors, TCode> => {
  const statusCode = exception.getStatus();
  const fallbackError = getFallbackError(statusCode, options);
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return {
      statusCode,
      error: {
        code: fallbackError.code,
        message: response,
      },
      errors: options.fallbackErrors,
    };
  }

  if (isResponseBodyRecord(response)) {
    return {
      statusCode: typeof response.statusCode === 'number' ? response.statusCode : statusCode,
      error: {
        code: (typeof response.code === 'string' ? response.code : fallbackError.code) as TCode,
        message: getMessageFromUnknown(response.message ?? response.error, fallbackError.message),
      },
      errors: getErrorsFromUnknown<TErrors>(response.errors) ?? options.fallbackErrors,
    };
  }

  return {
    statusCode,
    error: fallbackError,
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
  const fallbackError = getFallbackError(fallbackStatusCode, options);

  if (exception instanceof BaseError || isBaseErrorLike(exception)) {
    return {
      statusCode: exception.statusCode,
      error: {
        code: exception.code as TCode,
        message: exception.message,
      },
      errors: getErrorsFromUnknown<TErrors>(exception.errors) ?? options.fallbackErrors,
    };
  }

  if (exception instanceof HttpException) {
    return normalizeHttpException(exception, options);
  }

  if (exception instanceof Error) {
    return {
      statusCode: fallbackStatusCode,
      error: {
        code: fallbackError.code,
        message: exception.message || fallbackError.message,
      },
      errors: options.fallbackErrors,
    };
  }

  return {
    statusCode: fallbackStatusCode,
    error: fallbackError,
    errors: options.fallbackErrors,
  };
};
