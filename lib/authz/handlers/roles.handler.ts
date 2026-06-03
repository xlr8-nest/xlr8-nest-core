import { Injectable } from '@nestjs/common';
import { ROLES_REQUIREMENT, RolesRequirement } from '../requirements/roles.requirement';
import type { AuthorizationContext } from '../types/authorization-context.type';
import type { RequirementHandler } from './requirement-handler.interface';

/** Evaluates {@link RolesRequirement} against the principal's roles (RBAC). */
@Injectable()
export class RolesHandler implements RequirementHandler<RolesRequirement> {
  readonly requirementType = ROLES_REQUIREMENT;

  handle(requirement: RolesRequirement, context: AuthorizationContext): boolean {
    const owned = new Set(context.principal.roles);
    if (requirement.roles.length === 0) {
      return true;
    }
    return requirement.mode === 'all'
      ? requirement.roles.every((role) => owned.has(role))
      : requirement.roles.some((role) => owned.has(role));
  }
}
