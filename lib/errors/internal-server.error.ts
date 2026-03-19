import { BaseError } from "./base-error";

export class InternalServerError extends BaseError{
  constructor(code = 'INTERNAL_SERVER_ERROR', message = 'Internal Server Error') {
    super(code, message);
  }
}