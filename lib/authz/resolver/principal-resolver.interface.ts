import type { ExecutionContext } from '@nestjs/common';
import type { AuthorizationPrincipal } from '../types/principal.type';

/**
 * Resolves the {@link AuthorizationPrincipal} for the current request.
 *
 * Authorization is decoupled from authentication: implement this to source
 * roles/permissions from JWT claims (the default), a database lookup, or a
 * remote service. Return `null` when no authenticated subject is present —
 * the guard treats that as 401 Unauthorized.
 */
export interface PrincipalResolver {
  resolve(
    context: ExecutionContext,
  ): Promise<AuthorizationPrincipal | null> | AuthorizationPrincipal | null;
}
