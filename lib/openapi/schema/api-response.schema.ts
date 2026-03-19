import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Base API response schema for Swagger documentation
 */
export class ApiResponseSchema {
  @ApiProperty({ description: 'Indicates if the request was successful', example: true })
  success!: boolean;

  @ApiProperty({ description: 'Response status code', example: 'SUCCESS' })
  code!: string;

  @ApiProperty({ description: 'Human-readable response message', example: 'Request successful' })
  message!: string;
}

/**
 * Success response wrapper schema
 */
export class SuccessResponseSchema<T> extends ApiResponseSchema {
  @ApiProperty({ description: 'Response data payload' })
  data!: T;
}

/**
 * Formatted error item schema
 */
export class DetailErrorSchema {
  @ApiProperty({ description: 'Error code', example: 'ERROR_CODE' })
  code!: string;

  @ApiProperty({ description: 'Error message', example: 'Error message describing the issue' })
  message!: string;
}

/**
 * Error response schema for Swagger documentation
 */
export class ErrorResponseSchema extends ApiResponseSchema {
  @ApiPropertyOptional({
    description: 'Array of detailed error information',
    type: [DetailErrorSchema],
  })
  errors?: DetailErrorSchema[];
}
