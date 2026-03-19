import { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { ZodObject, ZodRawShape } from 'zod';
import { validateInput } from '../../core/utils';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodObject<ZodRawShape>) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body' && metadata.type !== 'query') {
      return value;
    }

    const parsedValue = validateInput(value, this.schema);
    return parsedValue;
  }
}
