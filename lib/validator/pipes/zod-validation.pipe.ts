import { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { validateInput } from '../../core/utils';

/**
 * NestJS pipe that validates `body` and `query` arguments against a Zod schema.
 * Accepts any `ZodType` (objects, arrays, unions, intersections, effects, etc.).
 *
 * Note: query-string values arrive as strings. Use `z.coerce.*` for numeric/boolean
 * query params (e.g. `z.coerce.number()`).
 */
export class ZodValidationPipe<T = unknown> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {
    if (typeof (schema as { safeParse?: unknown })?.safeParse !== 'function') {
      throw new Error(
        'ZodValidationPipe requires a valid Zod schema. ' +
          'Ensure zod is installed and the schema argument is a ZodType instance.',
      );
    }
  }

  transform(value: unknown, metadata: ArgumentMetadata): T {
    if (metadata.type !== 'body' && metadata.type !== 'query') {
      return value as T;
    }
    return validateInput<T>(value, this.schema);
  }
}
