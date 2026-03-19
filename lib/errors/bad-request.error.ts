import { BaseError } from "./base-error";

export class BadRequestError extends BaseError{
  public errors?: any;
  constructor(code = 'BAD_REQUEST', message = 'Bad Request', errors?: any) {
    super(code, message);
    this.errors = errors;
  }
}