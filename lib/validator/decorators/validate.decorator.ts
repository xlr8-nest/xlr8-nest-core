import { UsePipes } from '@nestjs/common';
import { ZodObject, ZodRawShape } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

export const Validate = (schema: ZodObject<ZodRawShape>) => {
  return UsePipes(new ZodValidationPipe(schema));
};
