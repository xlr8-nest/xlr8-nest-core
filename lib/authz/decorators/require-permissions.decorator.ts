import {
  PermissionsMatchMode,
  PermissionsRequirement,
} from '../requirements/permissions.requirement';
import { Authorize } from './authorize.decorator';

export interface RequirePermissionsOptions {
  /** 'all' (default) requires every permission; 'any' grants with one match. */
  mode?: PermissionsMatchMode;
}

/**
 * Require the caller to hold the given permission(s). Supports wildcards
 * (`billing:*`).
 *
 *     @RequirePermissions('user:write')
 *     @RequirePermissions('user:read', 'user:write')                 // all of
 *     @RequirePermissions('reports:view', 'reports:export', { mode: 'any' })
 */
export const RequirePermissions = (
  ...permissionsOrOptions: [...string[]] | [...string[], RequirePermissionsOptions]
): MethodDecorator & ClassDecorator => {
  const last = permissionsOrOptions[permissionsOrOptions.length - 1];
  const hasOptions = typeof last === 'object' && last !== null;
  const options = (hasOptions ? last : {}) as RequirePermissionsOptions;
  const permissions = (
    hasOptions ? permissionsOrOptions.slice(0, -1) : permissionsOrOptions
  ) as string[];

  return Authorize(new PermissionsRequirement(permissions, options.mode ?? 'all'));
};
