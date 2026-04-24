import { ErrorType } from '../types/common/error.type';
import { CommonErrors, StatusCode } from '../core/constants';
import { BaseError } from './base-error';

/**
 * 500 error without field-level details.
 */
export class InternalServerError<TCode extends string = string> extends BaseError<undefined, TCode> {
  constructor(error: ErrorType<TCode> = CommonErrors.InternalServerError as ErrorType<TCode>) {
    super(StatusCode.INTERNAL_SERVER_ERROR, error);
  }
}
