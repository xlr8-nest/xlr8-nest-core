export * from './response.builder';
export * from './response.normalizer';
export * from './response.types';
export * from './filters/global-exception.filter';
// Type guards — useful for consumers writing custom exception filters
export { isBaseErrorLike, isErrorDetails, getMessageFromUnknown } from './common/error.guards';
export type { UnknownRecord } from './common/object.util';
export type {
  ErrorType,
  DetailError,
  ErrorDetails,
  ResponseMetadata,
  SuccessResponse,
  ErrorResponse,
  Response,
  ApiSuccess,
  ApiFailure,
  ApiResult,
  ApiResponseBase,
  SuccessApiResponse,
  ErrorApiResponse,
  ApiResponse,
} from '../types';
