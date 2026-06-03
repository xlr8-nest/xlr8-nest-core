import { UsePipes } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

/**
 * Method/class decorator that validates `@Body()` and `@Query()` arguments
 * against the given Zod schema. Accepts any `ZodType` (not just `ZodObject`).
 *
 * @example
 * ```typescript
 * const CreateUserSchema = z.object({ email: z.string().email() });
 * type CreateUserInput = z.infer<typeof CreateUserSchema>;
 *
 * @Post()
 * @Validate(CreateUserSchema)
 * create(@Body() input: CreateUserInput) { ... }
 * ```
 */
export const Validate = <T>(schema: ZodType<T>) => {
  return UsePipes(new ZodValidationPipe<T>(schema));
};
