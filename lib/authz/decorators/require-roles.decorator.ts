import { RolesMatchMode, RolesRequirement } from '../requirements/roles.requirement';
import { Authorize } from './authorize.decorator';

export interface RequireRolesOptions {
  /** 'any' (default) grants with one matching role; 'all' requires every role. */
  mode?: RolesMatchMode;
}

/**
 * Require the caller to hold one (or all) of the given roles.
 *
 *     @RequireRoles('admin')
 *     @RequireRoles('admin', 'manager')              // any of
 *     @RequireRoles('admin', 'auditor', { mode: 'all' })
 */
export const RequireRoles = (
  ...rolesOrOptions: [...string[]] | [...string[], RequireRolesOptions]
): MethodDecorator & ClassDecorator => {
  const last = rolesOrOptions[rolesOrOptions.length - 1];
  const hasOptions = typeof last === 'object' && last !== null;
  const options = (hasOptions ? last : {}) as RequireRolesOptions;
  const roles = (hasOptions ? rolesOrOptions.slice(0, -1) : rolesOrOptions) as string[];

  return Authorize(new RolesRequirement(roles, options.mode ?? 'any'));
};
