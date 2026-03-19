/**
 * HTTP Status codes used across the library
 */
export enum StatusCode {
  SUCCESS = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  REDIRECT = 302,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
}

/**
 * Common error definitions with default codes and messages
 */
export const CommonErrors = {
  BadRequestError: {
    code: 'BAD_REQUEST',
    message: 'Bad request',
  },
  UnauthorizedError: {
    code: 'UNAUTHORIZED',
    message: 'Unauthorized',
  },
  ForbiddenError: {
    code: 'FORBIDDEN',
    message: 'Forbidden',
  },
  NotFoundError: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
  },
  ConflictError: {
    code: 'CONFLICT',
    message: 'Resource conflict',
  },
  InternalServerError: {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  },
} as const;

export type CommonErrorType = keyof typeof CommonErrors;
