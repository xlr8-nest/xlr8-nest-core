import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiWrappedResponse, ApiPaginatedResponse } from './api-wrapper.decorator';
import { StatusCode } from '../../core/constants';

interface ApiEndpointOptions {
  summary: string;
  description?: string;
  statusCode?: StatusCode;
  message?: string;
}

interface ApiRawOptions extends ApiEndpointOptions {
  /** HTTP status code (default: 200) */
  status?: number;
}

/**
 * Combined decorator for successful creation endpoints (201)
 * Combines HttpCreated + ApiOperation + ApiCreatedResponse with wrapped format
 * Pass null for dataType to indicate data: null in the response
 */
export const ApiCreate = <T extends Type<unknown>>(dataType: T | null, options: ApiEndpointOptions) => {
  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiWrappedResponse(StatusCode.CREATED, 'Resource created successfully', dataType),
  );
};

/**
 * Combined decorator for successful GET single resource endpoints (200)
 * Combines HttpOk + ApiOperation + ApiOkResponse with wrapped format
 * Pass null for dataType to indicate data: null in the response
 */
export const ApiGetOne = <T extends Type<unknown>>(dataType: T | null, options: ApiEndpointOptions) => {
  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiWrappedResponse(StatusCode.SUCCESS, 'Resource retrieved successfully', dataType),
  );
};

/**
 * Combined decorator for successful GET list endpoints (200)
 * Combines HttpOk + ApiOperation + ApiOkResponse with array wrapped format
 */
export const ApiGetMany = <T extends Type<unknown>>(dataType: T, options: ApiEndpointOptions) => {
  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiWrappedResponse(StatusCode.SUCCESS, 'Resources retrieved successfully', dataType, true),
  );
};

/**
 * Combined decorator for paginated list endpoints (200)
 * Combines HttpOk + ApiOperation + ApiPaginatedResponse with wrapped format
 */
export const ApiGetPaginated = <T extends Type<unknown>>(itemType: T, options: ApiEndpointOptions) => {
  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiPaginatedResponse(StatusCode.SUCCESS, 'Paginated resources retrieved successfully', itemType),
  );
};

/**
 * Combined decorator for successful update endpoints (202)
 * Combines HttpAccepted + ApiOperation + ApiAcceptedResponse with wrapped format
 * Pass null for dataType to indicate data: null in the response
 */
export const ApiUpdate = <T extends Type<unknown>>(dataType: T | null, options: ApiEndpointOptions) => {
  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiWrappedResponse(StatusCode.ACCEPTED, 'Resource updated successfully', dataType),
  );
};

/**
 * Combined decorator for successful delete endpoints (202)
 * Combines HttpAccepted + ApiOperation + ApiAcceptedResponse with wrapped format
 * Pass null for dataType to indicate data: null in the response
 */
export const ApiDelete = <T extends Type<unknown>>(dataType: T | null, options: ApiEndpointOptions) => {
  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiWrappedResponse(StatusCode.ACCEPTED, 'Resource deleted successfully', dataType),
  );
};

/**
 * Combined decorator for successful redirect endpoints (302)
 * Combines HttpRedirect + ApiOperation + ApiRedirectResponse with wrapped format
 * Pass null for dataType to indicate data: null in the response
 */
export const ApiRedirect = <T extends Type<unknown>>(dataType: T | null, options: ApiEndpointOptions) => {
  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiWrappedResponse(StatusCode.REDIRECT, 'Resource redirected successfully', dataType),
  );
};

/**
 * Combined decorator for successful action endpoints (202)
 * Combines HttpAccepted + ApiOperation + ApiAcceptedResponse with wrapped format
 * Pass null for dataType to indicate data: null in the response
 */
export const ApiAction = <T extends Type<unknown>>(dataType: T | null, options: ApiEndpointOptions) => {
  return applyDecorators(
    ApiOperation({ summary: options.summary, description: options.description }),
    ApiWrappedResponse(options.statusCode ?? StatusCode.ACCEPTED, options.message ?? 'Action performed successfully', dataType),
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
