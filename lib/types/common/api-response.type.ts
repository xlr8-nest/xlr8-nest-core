import { ErrorDetails } from './error.type';

export interface ResponseMetadata<TCode extends string = string> {
  success: boolean;
  code: TCode;
  message: string;
  /** HTTP status code, when included in the envelope. Use a concrete number. */
  statusCode?: number;
}

export interface SuccessResponse<T, TCode extends string = string> extends ResponseMetadata<TCode> {
  success: true;
  data: T;
}

export interface ErrorResponse<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = string,
> extends ResponseMetadata<TCode> {
  success: false;
  errors?: TErrors;
}

export type Response<
  TData,
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = string,
> = SuccessResponse<TData, TCode> | ErrorResponse<TErrors, TCode>;

export type ApiSuccess<TData, TCode extends string = string> = SuccessResponse<TData, TCode>;
export type ApiFailure<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = string,
> = ErrorResponse<TErrors, TCode>;
export type ApiResult<
  TData,
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = string,
> = Response<TData, TErrors, TCode>;

/** @deprecated Use {@link ResponseMetadata} instead. */
export type ApiResponseBase<TCode extends string = string> = ResponseMetadata<TCode>;
/** @deprecated Use {@link ApiSuccess} instead. */
export type SuccessApiResponse<T, TCode extends string = string> = SuccessResponse<T, TCode>;
/** @deprecated Use {@link ApiFailure} instead. */
export type ErrorApiResponse<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = string,
> = ErrorResponse<TErrors, TCode>;
/** @deprecated Use {@link ApiResult} instead. */
export type ApiResponse<
  TData,
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = string,
> = Response<TData, TErrors, TCode>;
