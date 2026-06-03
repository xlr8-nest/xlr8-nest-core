import type { AuthorizationRequirement } from '../types/requirement.type';

export const ROLES_REQUIREMENT = 'roles';

/** Match mode for a set of roles. */
export type RolesMatchMode = 'any' | 'all';

/**
 * RBAC requirement: the principal must hold the given role(s).
 * `mode: 'any'` (default) grants if the principal has at least one role;
 * `mode: 'all'` requires every listed role.
 */
export class RolesRequirement
  implements AuthorizationRequirement<typeof ROLES_REQUIREMENT>
{
  readonly type = ROLES_REQUIREMENT;

  constructor(
    public readonly roles: string[],
    public readonly mode: RolesMatchMode = 'any',
  ) {}
}
