import { CommonErrors, StatusCode } from '../core/constants';
import { BaseError } from './base-error';

export class UnauthorizedError<TCode extends string = string> extends BaseError<undefined, TCode> {
  constructor(code: TCode = CommonErrors.UnauthorizedError.code as TCode, message = CommonErrors.UnauthorizedError.message) {
    super(StatusCode.UNAUTHORIZED, code, message);
  }
}
