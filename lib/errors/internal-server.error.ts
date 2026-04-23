import { CommonErrors, StatusCode } from '../core/constants';
import { BaseError } from './base-error';

export class InternalServerError<TCode extends string = string> extends BaseError<undefined, TCode> {
  constructor(
    code: TCode = CommonErrors.InternalServerError.code as TCode,
    message = CommonErrors.InternalServerError.message,
  ) {
    super(StatusCode.INTERNAL_SERVER_ERROR, code, message);
  }
}
