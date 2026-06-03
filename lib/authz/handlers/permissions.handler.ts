import { Injectable } from '@nestjs/common';
import {
  PERMISSIONS_REQUIREMENT,
  PermissionsRequirement,
} from '../requirements/permissions.requirement';
import type { AuthorizationContext } from '../types/authorization-context.type';
import { hasAllPermissions, hasAnyPermission } from '../utils/permission-match.util';
import type { RequirementHandler } from './requirement-handler.interface';

/**
 * Evaluates {@link PermissionsRequirement} against the principal's permissions,
 * with wildcard-aware matching.
 */
@Injectable()
export class PermissionsHandler
  implements RequirementHandler<PermissionsRequirement>
{
  readonly requirementType = PERMISSIONS_REQUIREMENT;

  handle(
    requirement: PermissionsRequirement,
    context: AuthorizationContext,
  ): boolean {
    const owned = context.principal.permissions;
    if (requirement.permissions.length === 0) {
      return true;
    }
    return requirement.mode === 'any'
      ? hasAnyPermission(owned, requirement.permissions)
      : hasAllPermissions(owned, requirement.permissions);
  }
}
