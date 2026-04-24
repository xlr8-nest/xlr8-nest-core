import { CommonErrors, StatusCode } from '../core/constants';
import { ErrorDetails, ErrorType } from '../types/common/error.type';
import { BaseError } from './base-error';

/**
 * 400 error with optional field-level details.
 */
export class BadRequestError<TErrors extends ErrorDetails = ErrorDetails, TCode extends string = string> extends BaseError<TErrors, TCode> {
  constructor(
    error: ErrorType<TCode> = CommonErrors.BadRequestError as ErrorType<TCode>,
    errors?: TErrors,
  ) {
    super(StatusCode.BAD_REQUEST, error, errors);
  }
}
