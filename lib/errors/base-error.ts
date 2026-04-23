import { ErrorDetails } from '../types/common/error.type';

export class BaseError<TErrors extends ErrorDetails | undefined = undefined, TCode extends string = string> extends Error {
  public readonly code: TCode;
  public readonly statusCode: number;
  public readonly errors?: TErrors;

  constructor(statusCode: number, code: TCode, message: string, errors?: TErrors) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.errors = errors;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
