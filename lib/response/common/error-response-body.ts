import { ErrorResponse } from '../../types';
import { ErrorDetails } from '../../types/common/error.type';
import { DefaultErrorCode } from '../response.constants';
import { NormalizedException } from '../types';
import { maybeAttachStatusCode } from '../utils/response.util';

export const buildErrorBody = <
  TErrors extends ErrorDetails | undefined = ErrorDetails | undefined,
  TCode extends string = DefaultErrorCode,
>(
  normalized: NormalizedException<TErrors, TCode>,
  includeStatusCode?: boolean,
): ErrorResponse<TErrors, TCode> => {
  const response: ErrorResponse<TErrors, TCode> = {
    success: false,
    code: normalized.error.code,
    message: normalized.error.message,
  };

  if (normalized.errors) {
    response.errors = normalized.errors;
  }

  return maybeAttachStatusCode(response, normalized.statusCode, includeStatusCode);
};
