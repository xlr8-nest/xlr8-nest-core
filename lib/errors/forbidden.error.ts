import { CommonErrors, StatusCode } from '../core/constants';
import { BaseError } from './base-error';

export class ForbiddenError<TCode extends string = string> extends BaseError<undefined, TCode> {
  constructor(code: TCode = CommonErrors.ForbiddenError.code as TCode, message = CommonErrors.ForbiddenError.message) {
    super(StatusCode.FORBIDDEN, code, message);
  }
}
