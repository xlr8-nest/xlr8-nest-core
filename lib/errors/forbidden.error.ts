import { ErrorType } from '../types/common/error.type';
import { CommonErrors, StatusCode } from '../core/constants';
import { BaseError } from './base-error';

/**
 * 403 error without field-level details.
 */
export class ForbiddenError<TCode extends string = string> extends BaseError<undefined, TCode> {
  constructor(error: ErrorType<TCode> = CommonErrors.ForbiddenError as ErrorType<TCode>) {
    super(StatusCode.FORBIDDEN, error);
  }
}
