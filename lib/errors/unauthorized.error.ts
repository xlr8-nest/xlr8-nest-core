import { ErrorType } from '../types/common/error.type';
import { CommonErrors, StatusCode } from '../core/constants';
import { BaseError } from './base-error';

/**
 * 401 error without field-level details.
 */
export class UnauthorizedError<TCode extends string = string> extends BaseError<undefined, TCode> {
  constructor(error: ErrorType<TCode> = CommonErrors.UnauthorizedError as ErrorType<TCode>) {
    super(StatusCode.UNAUTHORIZED, error);
  }
}
