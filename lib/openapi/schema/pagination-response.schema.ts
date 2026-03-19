import { ApiProperty } from '@nestjs/swagger';

/**
 * Pagination meta schema for Swagger documentation
 */
export class PaginationMetaSchema {
  @ApiProperty({ description: 'Total number of items', example: 100 })
  total: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  perPage: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  currentPage: number;

  @ApiProperty({ description: 'Last page number', example: 10 })
  lastPage: number;
}
