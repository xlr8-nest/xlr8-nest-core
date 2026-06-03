import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { normalizeUnknownException } from '../normalizers/exception.normalizer';
import type { NormalizeExceptionOptions } from '../types';

/**
 * Drop-in global exception filter that renders any thrown value (BaseError,
 * NestJS HttpException, or plain Error) into the library's standard envelope:
 *
 *   { success: false, code, message, errors? }
 *
 * Register once in the root module or `main.ts`:
 *
 *   // option A — globally via Nest's dependency injection
 *   @Module({
 *     providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
 *   })
 *
 *   // option B — manually in main.ts (no DI)
 *   app.useGlobalFilters(new GlobalExceptionFilter());
 *
 * Internal `Error.message` values are NOT forwarded to the client to prevent
 * information disclosure. Set `options.exposeInternalMessages = true` in a
 * non-production environment only.
 */
@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    @Optional()
    private readonly options: NormalizeExceptionOptions = {},
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{ status(code: number): { json(body: unknown): void } }>();

    // Log the raw exception so it is not silently swallowed.
    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));

    const normalized = normalizeUnknownException(exception, this.options);
    const statusCode = normalized.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(statusCode).json({
      success: false,
      code: normalized.error.code,
      message: normalized.error.message,
      ...(normalized.errors !== undefined ? { errors: normalized.errors } : {}),
    });
  }
}
