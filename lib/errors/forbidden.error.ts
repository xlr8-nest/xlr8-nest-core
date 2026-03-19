import { BaseError } from "./base-error";

export class ForbiddenError extends BaseError{
  constructor(code = 'FORBIDDEN', message = 'Forbidden') {
    super(code, message);
  }
}