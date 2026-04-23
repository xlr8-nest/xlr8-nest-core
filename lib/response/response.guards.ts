import { BaseError } from '../errors';
import { DetailError, ErrorDetails } from '../types/common/error.type';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null;
};

const isDetailError = (value: unknown): value is DetailError => {
  return isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string';
};

export const isErrorDetails = (value: unknown): value is ErrorDetails => {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isDetailError);
};

export const isBaseErrorLike = (value: unknown): value is BaseError<ErrorDetails | undefined, string> => {
  return (
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
