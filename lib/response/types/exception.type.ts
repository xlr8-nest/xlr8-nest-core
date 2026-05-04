import { ErrorDetails, ErrorType } from '../../types/common/error.type';
import { DefaultErrorCode } from '../response.constants';

export interface NormalizedException<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> {
  statusCode: number;
  error: ErrorType<TCode>;
  errors?: TErrors;
}

export type ExceptionErrorResponseFactory<
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
> = (exception: unknown) => NormalizedException<TErrors, TCode> | null | undefined;
