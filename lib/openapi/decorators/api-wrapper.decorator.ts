import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { StatusCode } from '../../core/constants';
import { DetailErrorSchema } from '../schema';
import { PaginationMetaSchema } from '../schema/pagination-response.schema';

type ApiSchemaObject = Record<string, unknown>;

export interface ApiSchemaDefinition {
  schema: ApiSchemaObject;
  extraModels?: Type<unknown>[];
}

export interface ApiWrappedResponseOptions {
  isArray?: boolean;
  paginated?: boolean;
  wrapper?: ApiSuccessWrapperFactory;
}

export interface ApiSuccessWrapperContext<T extends Type<unknown> | null = Type<unknown> | null> {
  statusCode: number;
  description: string;
  dataType: T;
  code: string;
  isArray: boolean;
  paginated: boolean;
  defaultSchema: ApiSchemaObject;
  defaultExtraModels: Type<unknown>[];
}

export type ApiSuccessWrapperFactory = <T extends Type<unknown> | null = Type<unknown> | null>(
  context: ApiSuccessWrapperContext<T>,
) => ApiSchemaDefinition;

export interface ApiErrorResponseOptions {
  includeErrors?: boolean;
  wrapper?: ApiErrorWrapperFactory;
}

export interface ApiErrorWrapperContext {
  statusCode: number;
  description: string;
  code: string;
  includeErrors: boolean;
  defaultSchema: ApiSchemaObject;
  defaultExtraModels: Type<unknown>[];
}

export type ApiErrorWrapperFactory = (context: ApiErrorWrapperContext) => ApiSchemaDefinition;

/**
 * Maps status codes to their corresponding success codes
 */
const STATUS_CODE_MAP: Record<number, string> = {
  [StatusCode.SUCCESS]: 'SUCCESS',
  [StatusCode.CREATED]: 'CREATED',
  [StatusCode.ACCEPTED]: 'ACCEPTED',
  [StatusCode.NO_CONTENT]: 'NO_CONTENT',
  [StatusCode.REDIRECT]: 'REDIRECT',
};

const buildSuccessDataSchema = <T extends Type<unknown>>(dataType: T, isArray: boolean): ApiSchemaObject => {
  return isArray
    ? {
        type: 'array',
        items: { $ref: getSchemaPath(dataType) },
      }
    : { $ref: getSchemaPath(dataType) };
};

const buildPaginatedDataSchema = <T extends Type<unknown>>(itemType: T): ApiSchemaObject => ({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { $ref: getSchemaPath(itemType) },
    },
    meta: { $ref: getSchemaPath(PaginationMetaSchema) },
  },
  required: ['items', 'meta'],
});

const dedupeExtraModels = (extraModels: Type<unknown>[] = []): Type<unknown>[] => {
  return Array.from(new Set(extraModels));
};

const applyResponseSchema = (statusCode: number, description: string, schemaDefinition: ApiSchemaDefinition) => {
  const decorators = [];
  const extraModels = dedupeExtraModels(schemaDefinition.extraModels);

  if (extraModels.length > 0) {
    decorators.push(ApiExtraModels(...extraModels));
  }

  decorators.push(
    ApiResponse({
      status: statusCode,
      description,
      schema: schemaDefinition.schema,
    }),
  );

  return applyDecorators(...decorators);
};

const assertWrappedResponseOptions = (
  dataType: Type<unknown> | null,
  { isArray = false, paginated = false }: ApiWrappedResponseOptions,
) => {
  if (paginated && dataType === null) {
    throw new Error('ApiWrappedResponse does not support paginated responses when dataType is null.');
  }

  if (paginated && isArray) {
    throw new Error('ApiWrappedResponse does not support using both paginated and isArray at the same time.');
  }

  if (dataType === null && (isArray || paginated)) {
    throw new Error('ApiWrappedResponse with a null dataType only supports non-array, non-paginated responses.');
  }
};

const buildDefaultWrappedResponse = <T extends Type<unknown> | null>(
  statusCode: number,
  description: string,
  dataType: T,
  options: ApiWrappedResponseOptions,
): ApiSchemaDefinition => {
  const code = STATUS_CODE_MAP[statusCode] || 'SUCCESS';
  const isArray = options.isArray ?? false;
  const paginated = options.paginated ?? false;

  assertWrappedResponseOptions(dataType, { isArray, paginated });

  if (dataType === null) {
    return {
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
    };
  }

  const extraModels = paginated ? [dataType, PaginationMetaSchema] : [dataType];
  const dataSchema = paginated ? buildPaginatedDataSchema(dataType) : buildSuccessDataSchema(dataType, isArray);

  return {
    extraModels,
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
  };
};

const buildDefaultErrorResponse = (
  statusCode: number,
  description: string,
  code: string,
  includeErrors: boolean,
): ApiSchemaDefinition => {
  const properties: Record<string, ApiSchemaObject> = {
    success: { type: 'boolean', example: false },
    code: { type: 'string', example: code },
    message: { type: 'string', example: description },
  };

  const extraModels = includeErrors ? [DetailErrorSchema] : [];

  if (includeErrors) {
    properties.errors = {
      type: 'object',
      additionalProperties: {
        $ref: getSchemaPath(DetailErrorSchema),
      },
    };
  }

  return {
    extraModels,
    schema: {
      type: 'object',
      properties,
      required: ['success', 'code', 'message'],
    },
  };
};

/**
 * Creates a wrapped success response schema for Swagger
 * Wraps the data type in the standard SuccessResponse format
 * Pass null for dataType to indicate data: null in the response
 */
export const ApiWrappedResponse = <T extends Type<unknown> | null>(
  statusCode: number,
  description: string,
  dataType: T,
  options: ApiWrappedResponseOptions = {},
) => {
  const defaultDefinition = buildDefaultWrappedResponse(statusCode, description, dataType, options);
  const isArray = options.isArray ?? false;
  const paginated = options.paginated ?? false;
  const code = STATUS_CODE_MAP[statusCode] || 'SUCCESS';

  const definition = options.wrapper
    ? options.wrapper({
        statusCode,
        description,
        dataType,
        code,
        isArray,
        paginated,
        defaultSchema: defaultDefinition.schema,
        defaultExtraModels: defaultDefinition.extraModels ?? [],
      })
    : defaultDefinition;

  return applyResponseSchema(statusCode, description, {
    schema: definition.schema,
    extraModels: definition.extraModels ?? defaultDefinition.extraModels,
  });
};

/**
 * Creates a wrapped paginated response schema for Swagger
 * Wraps the items array and meta in the standard SuccessResponse format
 */
export const ApiPaginatedResponse = <T extends Type<unknown>>(
  statusCode: number,
  description: string,
  itemType: T,
  options: Omit<ApiWrappedResponseOptions, 'isArray' | 'paginated'> = {},
) => {
  return ApiWrappedResponse(statusCode, description, itemType, {
    ...options,
    paginated: true,
  });
};

/**
 * Creates an error response schema for Swagger
 */
export const ApiErrorResponse = (
  statusCode: number,
  description: string,
  code: string,
  options: ApiErrorResponseOptions = {},
) => {
  const includeErrors = options.includeErrors ?? false;
  const defaultDefinition = buildDefaultErrorResponse(statusCode, description, code, includeErrors);
  const definition = options.wrapper
    ? options.wrapper({
        statusCode,
        description,
        code,
        includeErrors,
        defaultSchema: defaultDefinition.schema,
        defaultExtraModels: defaultDefinition.extraModels ?? [],
      })
    : defaultDefinition;

  return applyResponseSchema(statusCode, description, {
    schema: definition.schema,
    extraModels: definition.extraModels ?? defaultDefinition.extraModels,
  });
};
