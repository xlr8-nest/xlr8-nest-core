import { BaseError } from "./base-error";

export class ConflictError extends BaseError{
  public errors?: any;
  constructor(code = 'CONFLICT', message = 'Conflict', errors?: any) {
    super(code, message);
    this.errors = errors;
  }
}