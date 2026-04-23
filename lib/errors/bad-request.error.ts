import { CommonErrors, StatusCode } from '../core/constants';
import { ErrorDetails } from '../types/common/error.type';
import { BaseError } from './base-error';

export class BadRequestError<TErrors extends ErrorDetails = ErrorDetails, TCode extends string = string> extends BaseError<TErrors, TCode> {
  constructor(
    code: TCode = CommonErrors.BadRequestError.code as TCode,
    message = CommonErrors.BadRequestError.message,
    errors?: TErrors,
  ) {
    super(StatusCode.BAD_REQUEST, code, message, errors);
  }
}
