import { BaseError } from '../../errors';
import { DetailError, ErrorDetails } from '../../types/common/error.type';
import { isRecord, UnknownRecord } from './object.util';

const isDetailError = (value: unknown): value is DetailError => {
  return isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string';
};

export const isErrorDetails = (value: unknown): value is ErrorDetails => {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isDetailError);
};

/**
 * True when `value` is a library BaseError (has statusCode + code + message AND is
 * an Error instance). Requires `instanceof Error` so arbitrary POJOs with the same
 * shape are not misclassified, and NestJS HttpException subclasses (which also carry
 * statusCode) are not accidentally matched before the HttpException branch.
 */
export const isBaseErrorLike = (value: unknown): value is BaseError<ErrorDetails | undefined, string> => {
  return (
    value instanceof Error &&
    isRecord(value) &&
    typeof value.statusCode === 'number' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  );
};

export const isResponseBodyRecord = (value: unknown): value is UnknownRecord => {
  return isRecord(value);
};

export const getMessageFromUnknown = (value: unknown, fallback: string): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const messages = value.filter((item): item is string => typeof item === 'string');
    if (messages.length > 0) {
      return messages.join(', ');
    }
  }

  return fallback;
};

export const getErrorsFromUnknown = <TErrors extends ErrorDetails | undefined>(value: unknown): TErrors | undefined => {
  return isErrorDetails(value) ? (value as TErrors) : undefined;
};
