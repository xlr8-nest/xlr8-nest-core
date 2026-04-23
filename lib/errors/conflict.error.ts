import { CommonErrors, StatusCode } from '../core/constants';
import { ErrorDetails } from '../types/common/error.type';
import { BaseError } from './base-error';

export class ConflictError<TErrors extends ErrorDetails = ErrorDetails, TCode extends string = string> extends BaseError<TErrors, TCode> {
  constructor(
    code: TCode = CommonErrors.ConflictError.code as TCode,
    message = CommonErrors.ConflictError.message,
    errors?: TErrors,
  ) {
    super(StatusCode.CONFLICT, code, message, errors);
  }
}
