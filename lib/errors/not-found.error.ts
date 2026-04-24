import { CommonErrors, StatusCode } from '../core/constants';
import { ErrorDetails, ErrorType } from '../types/common/error.type';
import { BaseError } from './base-error';

/**
 * 404 error with optional field-level details.
 */
export class NotFoundError<TErrors extends ErrorDetails = ErrorDetails, TCode extends string = string> extends BaseError<TErrors, TCode> {
  constructor(
    error: ErrorType<TCode> = CommonErrors.NotFoundError as ErrorType<TCode>,
    errors?: TErrors,
  ) {
    super(StatusCode.NOT_FOUND, error, errors);
  }
}
