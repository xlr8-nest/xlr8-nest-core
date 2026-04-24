import { ErrorDetails, ErrorType } from '../types/common/error.type';

/**
 * Base application error that keeps the HTTP status code,
 * a stable `ErrorType`, and optional field-level details together.
 */
export class BaseError<TErrors extends ErrorDetails | undefined = undefined, TCode extends string = string> extends Error {
  public readonly code: TCode;
  public readonly statusCode: number;
  public readonly errors?: TErrors;

  constructor(statusCode: number, error: ErrorType<TCode>, errors?: TErrors) {
    super(error.message);
    this.name = new.target.name;
    this.code = error.code;
    this.statusCode = statusCode;
    this.errors = errors;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
