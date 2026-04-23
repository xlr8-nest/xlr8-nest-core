import { ErrorResponse } from '../types';
import { ErrorDetails } from '../types/common/error.type';
import { DefaultErrorCode, SuccessResponseCode } from './response.constants';

interface StatusCodeOption {
  includeStatusCode?: boolean;
}

export interface BuildSuccessResponseOptions<TCode extends string = SuccessResponseCode> extends StatusCodeOption {
  code?: TCode;
  message?: string;
  statusCode?: number;
}

export interface BuildErrorResponseOptions<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> extends StatusCodeOption {
  code?: TCode;
  message?: string;
  statusCode?: number;
  errors?: TErrors;
}

export interface BuildExceptionErrorResponseOptions<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> extends StatusCodeOption {
  fallbackStatusCode?: number;
  fallbackCode?: TCode;
  fallbackMessage?: string;
  fallbackErrors?: TErrors;
}

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
  code: TCode;
  message: string;
  errors?: TErrors;
}
