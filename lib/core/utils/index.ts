import { BadRequestException } from '@nestjs/common';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Validates input against a Zod schema and returns the parsed value
 * Throws BadRequestException with validation errors if validation fails
 */
export function validateInput<T>(value: unknown, schema: ZodSchema<T>): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    const errors = formatZodErrors(result.error);
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors,
    });
  }

  return result.data;
}

/**
 * Formats Zod errors into a structured format
 */
function formatZodErrors(error: ZodError): Record<string, { code: string; message: string }> {
  const errors: Record<string, { code: string; message: string }> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.');
    errors[path || '_root'] = {
      code: issue.code,
      message: issue.message,
    };
  }

  return errors;
}
