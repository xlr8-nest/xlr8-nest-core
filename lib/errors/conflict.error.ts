import { CommonErrors, StatusCode } from '../core/constants';
import { ErrorDetails, ErrorType } from '../types/common/error.type';
import { BaseError } from './base-error';

/**
 * 409 error with optional field-level details.
 */
export class ConflictError<TErrors extends ErrorDetails = ErrorDetails, TCode extends string = string> extends BaseError<TErrors, TCode> {
  constructor(
    error: ErrorType<TCode> = CommonErrors.ConflictError as ErrorType<TCode>,
    errors?: TErrors,
  ) {
    super(StatusCode.CONFLICT, error, errors);
  }
}
