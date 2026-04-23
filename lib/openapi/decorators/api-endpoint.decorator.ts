import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiSuccessWrapperFactory, ApiWrappedResponse } from './api-wrapper.decorator';
import { StatusCode } from '../../core/constants';

export type ApiHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ApiMethodOptions {
  summary: string;
  description?: string;
  status?: number;
  message?: string;
  isArray?: boolean;
  paginated?: boolean;
  wrapper?: ApiSuccessWrapperFactory;
}

export interface ApiRawOptions {
  summary: string;
  description?: string;
  /** HTTP status code (default: 200) */
  status?: number;
}

const getDefaultStatusForMethod = (method: string): number => {
  return method.toUpperCase() === 'POST' ? StatusCode.CREATED : StatusCode.SUCCESS;
};

const getDefaultMessageForMethod = (method: string, options: ApiMethodOptions): string => {
  if (options.message) {
    return options.message;
  }

  switch (method.toUpperCase()) {
    case 'POST':
      return 'Resource created successfully';
    case 'GET':
      if (options.paginated) {
        return 'Paginated resources retrieved successfully';
      }

      return options.isArray ? 'Resources retrieved successfully' : 'Resource retrieved successfully';
    case 'PATCH':
    case 'PUT':
      return 'Resource updated successfully';
    case 'DELETE':
      return 'Resource deleted successfully';
    default:
      return 'Action performed successfully';
  }
};

/**
 * Combined decorator for documenting successful HTTP method responses.
 */
export const ApiMethod = <T extends Type<unknown> | null>(method: ApiHttpMethod | string, dataType: T, options: ApiMethodOptions) => {
  const status = options.status ?? getDefaultStatusForMethod(method);
  const message = getDefaultMessageForMethod(method, options);

  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiWrappedResponse(status, message, dataType, {
      isArray: options.isArray,
      paginated: options.paginated,
      wrapper: options.wrapper,
    }),
  );
};

export const ApiPost = <T extends Type<unknown> | null>(dataType: T, options: ApiMethodOptions) => {
  return ApiMethod('POST', dataType, options);
};

export const ApiGet = <T extends Type<unknown> | null>(dataType: T, options: ApiMethodOptions) => {
  return ApiMethod('GET', dataType, options);
};

export const ApiPatch = <T extends Type<unknown> | null>(dataType: T, options: ApiMethodOptions) => {
  return ApiMethod('PATCH', dataType, options);
};

export const ApiPut = <T extends Type<unknown> | null>(dataType: T, options: ApiMethodOptions) => {
  return ApiMethod('PUT', dataType, options);
};

export const ApiDelete = <T extends Type<unknown> | null>(dataType: T, options: ApiMethodOptions) => {
  return ApiMethod('DELETE', dataType, options);
};

/**
 * Combined decorator for successful redirect endpoints (302)
 * Combines HttpRedirect + ApiOperation + ApiRedirectResponse with wrapped format
 * Pass null for dataType to indicate data: null in the response
 */
export const ApiRedirect = <T extends Type<unknown> | null>(dataType: T, options: ApiMethodOptions) => {
  const status = options.status ?? StatusCode.REDIRECT;
  const message = options.message ?? 'Resource redirected successfully';

  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiWrappedResponse(status, message, dataType, {
      wrapper: options.wrapper,
    }),
  );
};

/**
 * Combined decorator for raw response endpoints (no wrapper)
 * Combines RawResponse + HttpOk + ApiOperation + ApiResponse with direct schema
 * Use this for endpoints that need to return data without the standard format
 *
 * @example
 * ```typescript
 * @Get('health')
 * @ApiRaw(HealthOutput, { summary: 'Health check' })
 * healthCheck(): HealthOutput { ... }
 *
 * // For array response
 * @Get('items')
 * @ApiRawArray(ItemOutput, { summary: 'Get raw items' })
 * getItems(): ItemOutput[] { ... }
 * ```
 */
export const ApiRaw = <T extends Type<unknown>>(dataType: T, options: ApiRawOptions) => {
  const status = options.status ?? StatusCode.SUCCESS;

  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiExtraModels(dataType),
    ApiResponse({
      status,
      description: options.description || options.summary,
      schema: { $ref: getSchemaPath(dataType) },
    }),
  );
};

/**
 * Combined decorator for raw array response endpoints (no wrapper)
 * Returns an array directly without the standard format
 */
export const ApiRawArray = <T extends Type<unknown>>(dataType: T, options: ApiRawOptions) => {
  const status = options.status ?? StatusCode.SUCCESS;

  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiExtraModels(dataType),
    ApiResponse({
      status,
      description: options.description || options.summary,
      schema: {
        type: 'array',
        items: { $ref: getSchemaPath(dataType) },
      },
    }),
  );
};
