import { BaseError } from "./base-error";

export class UnauthorizedError extends BaseError{
  constructor(code = 'UNAUTHORIZED', message = 'Unauthorized') {
    super(code, message);
  }
}