import { ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthorizationPrincipal } from '../types/principal.type';
import type { PrincipalResolver } from './principal-resolver.interface';

/**
 * Default {@link PrincipalResolver}. Reads the authenticated user from
 * `request.user` (as populated by an authentication guard / passport strategy)
 * and normalizes it into an {@link AuthorizationPrincipal}.
 *
 * Tolerant of the legacy `UserIdentity.roles: string` shape as well as the
 * current `roles: string[]` — both normalize to an array.
 */
@Injectable()
export class RequestUserResolver implements PrincipalResolver {
  resolve(context: ExecutionContext): AuthorizationPrincipal | null {
    const request = context.switchToHttp().getRequest<{ user?: RawUser } | undefined>();
    const user = request?.user;
    if (!user || user.id === undefined || user.id === null) {
      return null;
    }

    return {
      id: String(user.id),
      roles: toStringArray(user.roles),
      permissions: toStringArray(user.permissions),
      // Do NOT expose the whole user as `attributes` — it may contain secrets
      // (passwordHash, tokens, etc.). The `raw` field is the explicit escape
      // hatch; treat it as untrusted for authorization decisions.
      raw: user,
    };
  }
}

interface RawUser {
  id?: unknown;
  roles?: unknown;
  permissions?: unknown;
  [key: string]: unknown;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  return [];
}
