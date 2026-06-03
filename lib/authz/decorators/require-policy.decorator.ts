import { PolicyRequirement } from '../requirements/policy.requirement';
import { Authorize } from './authorize.decorator';

/**
 * Require the caller to satisfy a named policy (registered via
 * `AuthzModule.forRoot({ policies })`). Multiple names compose as logical AND.
 *
 *     @RequirePolicy('CanEditArticle')
 *     @RequirePolicy('IsTenantMember', 'CanManageBilling')
 */
export const RequirePolicy = (
  ...policies: string[]
): MethodDecorator & ClassDecorator => {
  return Authorize(...policies.map((name) => new PolicyRequirement(name)));
};
