import { CommonErrors, StatusCode } from '../core/constants';
import { ErrorDetails } from '../types/common/error.type';
import { BaseError } from './base-error';

export class NotFoundError<TErrors extends ErrorDetails = ErrorDetails, TCode extends string = string> extends BaseError<TErrors, TCode> {
  constructor(
    code: TCode = CommonErrors.NotFoundError.code as TCode,
    message = CommonErrors.NotFoundError.message,
    errors?: TErrors,
  ) {
    super(StatusCode.NOT_FOUND, code, message, errors);
  }
}
