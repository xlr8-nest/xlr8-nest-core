import { ErrorResponse } from '../types';
import { ErrorDetails, ErrorType } from '../types/common/error.type';
import { DefaultErrorCode, SuccessResponseCode } from './response.constants';

interface StatusCodeOption {
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
 * Options for building a standard error payload.
 * Use `error` to provide the stable code/message pair for the response.
 */
export interface BuildErrorResponseOptions<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> extends StatusCodeOption {
  error?: ErrorType<TCode>;
  statusCode?: number;
  errors?: TErrors;
}

/**
 * Options for normalizing an unknown exception into the standard error payload.
 */
export interface BuildExceptionErrorResponseOptions<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> extends StatusCodeOption {
  fallbackStatusCode?: number;
  fallbackError?: ErrorType<TCode>;
  fallbackErrors?: TErrors;
}

/**
 * Normalized result returned from `buildExceptionErrorResponse`.
 */
export interface BuiltExceptionErrorResponse<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> {
  statusCode: number;
  body: ErrorResponse<TErrors, TCode>;
}

export interface NormalizedException<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> {
  statusCode: number;
  error: ErrorType<TCode>;
  errors?: TErrors;
}
