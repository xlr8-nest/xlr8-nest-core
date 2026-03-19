export class BaseError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BaseError';
    this.code = code;
  }
}