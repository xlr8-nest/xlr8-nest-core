import { SetMetadata } from '@nestjs/common';
import { AUTHZ_PUBLIC_METADATA } from '../constants/metadata';

/**
 * Marks a route (or whole controller) as public — the {@link AuthorizationGuard}
 * skips principal resolution and all requirement checks. Useful when the guard
 * is registered globally (APP_GUARD) but a few endpoints must stay open.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHZ_PUBLIC_METADATA, true);

/** Alias for {@link Public}. */
export const AllowAnonymous = Public;
