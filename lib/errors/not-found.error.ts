import { BaseError } from "./base-error";

export class NotFoundError extends BaseError{
  public errors?: any;
  constructor(code = 'NOT_FOUND', message = 'Not Found', errors?: any) {
    super(code, message);
    this.errors = errors;
  }
}