import { StatusCode } from '../../core/constants';
import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseSchema } from '../schema';
import { PaginationMetaSchema } from '../schema/pagination-response.schema';


/**
 * Maps status codes to their corresponding success codes
 */
const STATUS_CODE_MAP: Record<number, string> = {
  [StatusCode.SUCCESS]: 'SUCCESS',
  [StatusCode.CREATED]: 'CREATED',
  [StatusCode.ACCEPTED]: 'ACCEPTED',
  [StatusCode.NO_CONTENT]: 'NO_CONTENT',
};

/**
 * Creates a wrapped success response schema for Swagger
 * Wraps the data type in the standard SuccessResponse format
 * Pass null for dataType to indicate data: null in the response
 */
export const ApiWrappedResponse = <T extends Type<unknown>>(
  statusCode: number,
  description: string,
  dataType: T | null,
  isArray = false,
) => {
  const code = STATUS_CODE_MAP[statusCode] || 'SUCCESS';

  // Handle null dataType
  if (dataType === null) {
    return applyDecorators(
      ApiResponse({
        status: statusCode,
        description,
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            code: { type: 'string', example: code },
            message: { type: 'string', example: description },
            data: { type: 'object', nullable: true, example: null },
          },
          required: ['success', 'code', 'message', 'data'],
        },
      }),
    );
  }

  const dataSchema = isArray
    ? { type: 'array', items: { $ref: getSchemaPath(dataType) } }
    : { $ref: getSchemaPath(dataType) };

  return applyDecorators(
    ApiExtraModels(dataType),
    ApiResponse({
      status: statusCode,
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          code: { type: 'string', example: code },
          message: { type: 'string', example: description },
          data: dataSchema,
        },
        required: ['success', 'code', 'message', 'data'],
      },
    }),
  );
};

/**
 * Creates a wrapped paginated response schema for Swagger
 * Wraps the items array and meta in the standard SuccessResponse format
 */
export const ApiPaginatedResponse = <T extends Type<unknown>>(statusCode: number, description: string, itemType: T) => {
  const code = STATUS_CODE_MAP[statusCode] || 'SUCCESS';

  return applyDecorators(
    ApiExtraModels(itemType, PaginationMetaSchema),
    ApiResponse({
      status: statusCode,
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          code: { type: 'string', example: code },
          message: { type: 'string', example: description },
          data: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { $ref: getSchemaPath(itemType) },
              },
              meta: { $ref: getSchemaPath(PaginationMetaSchema) },
            },
            required: ['items', 'meta'],
          },
        },
        required: ['success', 'code', 'message', 'data'],
      },
    }),
  );
};

/**
 * Creates an error response schema for Swagger
 */
export const ApiErrorResponse = (statusCode: number, description: string, code: string) => {
  return applyDecorators(
    ApiExtraModels(ErrorResponseSchema),
    ApiResponse({
      status: statusCode,
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          code: { type: 'string', example: code },
          message: { type: 'string', example: description },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'FIELD_ERROR' },
                message: { type: 'string', example: 'Field validation failed' },
              },
            },
          },
        },
        required: ['success', 'code', 'message'],
      },
    }),
  );
};
