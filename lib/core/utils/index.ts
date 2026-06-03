import { BadRequestError } from '../../errors/bad-request.error';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Validates `value` against a Zod schema and returns the parsed result.
 *
 * On validation failure throws the library's own `BadRequestError` so the
 * error flows through `normalizeUnknownException` / `GlobalExceptionFilter`
 * consistently (no raw NestJS `BadRequestException` leaking through).
 *
 * All issues per path are collected; no issue is silently dropped.
 */
export function validateInput<T>(value: unknown, schema: ZodSchema<T>): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    const errors = formatZodErrors(result.error);
    throw new BadRequestError(
      { code: 'VALIDATION_ERROR', message: 'Validation failed' },
      errors as never,
    );
  }

  return result.data;
}

/**
 * Formats Zod errors into a field-keyed map. Multiple issues for the same
 * field path are joined (no silent last-write-wins). Array-index paths use
 * dot-notation (e.g. `items.0.name`).
 */
function formatZodErrors(
  error: ZodError,
): Record<string, { code: string; message: string }> {
  const groups: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!groups[path]) groups[path] = [];
    groups[path].push(issue.message);
  }

  const result: Record<string, { code: string; message: string }> = {};
  for (const [path, messages] of Object.entries(groups)) {
    result[path] = { code: 'invalid_field', message: messages.join('; ') };
  }
  return result;
}
