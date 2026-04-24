import { CommonErrors, StatusCode } from '../core/constants';
import type { ErrorType } from '../types/common/error.type';

export const SUCCESS_CODE_MAP = {
  [StatusCode.SUCCESS]: 'SUCCESS',
  [StatusCode.CREATED]: 'CREATED',
  [StatusCode.ACCEPTED]: 'ACCEPTED',
  [StatusCode.NO_CONTENT]: 'NO_CONTENT',
  [StatusCode.REDIRECT]: 'REDIRECT',
} as const;

export const SUCCESS_MESSAGE_MAP = {
  [StatusCode.SUCCESS]: 'Request successful',
  [StatusCode.CREATED]: 'Resource created successfully',
  [StatusCode.ACCEPTED]: 'Request accepted successfully',
  [StatusCode.NO_CONTENT]: 'Request completed successfully',
  [StatusCode.REDIRECT]: 'Request redirected successfully',
} as const;

export const ERROR_DEFAULTS = {
  [StatusCode.BAD_REQUEST]: CommonErrors.BadRequestError,
  [StatusCode.UNAUTHORIZED]: CommonErrors.UnauthorizedError,
  [StatusCode.FORBIDDEN]: CommonErrors.ForbiddenError,
  [StatusCode.NOT_FOUND]: CommonErrors.NotFoundError,
  [StatusCode.CONFLICT]: CommonErrors.ConflictError,
  [StatusCode.INTERNAL_SERVER_ERROR]: CommonErrors.InternalServerError,
} as const;

type SuccessCodeMap = typeof SUCCESS_CODE_MAP;
type SuccessStatusCode = keyof SuccessCodeMap;
type ErrorDefaultsMap = typeof ERROR_DEFAULTS;
type KnownErrorStatusCode = keyof ErrorDefaultsMap;

export type SuccessResponseCode = SuccessCodeMap[SuccessStatusCode];
export type DefaultErrorCode = ErrorDefaultsMap[KnownErrorStatusCode]['code'];

export const getSuccessCode = (statusCode: number): SuccessResponseCode => {
  return SUCCESS_CODE_MAP[statusCode as SuccessStatusCode] ?? SUCCESS_CODE_MAP[StatusCode.SUCCESS];
};

export const getSuccessMessage = (statusCode: number): string => {
  return SUCCESS_MESSAGE_MAP[statusCode as SuccessStatusCode] ?? SUCCESS_MESSAGE_MAP[StatusCode.SUCCESS];
};

export const getErrorDefault = (statusCode: number): ErrorType<DefaultErrorCode> => {
  return ERROR_DEFAULTS[statusCode as KnownErrorStatusCode] ?? ERROR_DEFAULTS[StatusCode.INTERNAL_SERVER_ERROR];
};
