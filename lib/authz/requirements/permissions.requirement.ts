import type { AuthorizationRequirement } from '../types/requirement.type';

export const PERMISSIONS_REQUIREMENT = 'permissions';

/** Match mode for a set of permissions. */
export type PermissionsMatchMode = 'any' | 'all';

/**
 * Permission-based requirement: the principal must hold the given
 * permission(s). Permissions support wildcards (`user:*`) — see
 * {@link permissionMatches}. `mode: 'all'` (default) requires every listed
 * permission; `'any'` grants with one match.
 */
export class PermissionsRequirement
  implements AuthorizationRequirement<typeof PERMISSIONS_REQUIREMENT>
{
  readonly type = PERMISSIONS_REQUIREMENT;

  constructor(
    public readonly permissions: string[],
    public readonly mode: PermissionsMatchMode = 'all',
  ) {}
}
