import { ErrorDetails, ErrorType } from '../../types/common/error.type';
import { DefaultErrorCode, SuccessResponseCode } from '../response.constants';
import { ExceptionErrorResponseFactory } from './exception.type';

export interface StatusCodeOption {
  includeStatusCode?: boolean;
}

/**
 * Options for building a standard success payload.
 */
export interface BuildSuccessResponseOptions<TCode extends string = SuccessResponseCode> extends StatusCodeOption {
  code?: TCode;
  message?: string;
  statusCode?: number;
}

/**
 * Options for normalizing an unknown exception.
 */
export interface NormalizeExceptionOptions<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> {
  fallbackStatusCode?: number;
  fallbackError?: ErrorType<TCode>;
  fallbackErrors?: TErrors;
  customErrorFactory?: ExceptionErrorResponseFactory<TErrors, TCode>;
}

/**
 * Options for building a standard error payload from an exception.
 */
export interface BuildErrorResponseOptions<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> extends NormalizeExceptionOptions<TErrors, TCode>, StatusCodeOption {}
