import type { AuthorizationContext } from '../types/authorization-context.type';
import type { AuthorizationDecision } from '../types/decision.type';
import type { AuthorizationPrincipal } from '../types/principal.type';
import type { AuthorizationRequirement } from '../types/requirement.type';

export const RESOURCE_REQUIREMENT = 'resource';

/** Loads the target resource for a request (e.g. from route params / body). */
export type ResourceLoader<TResource = unknown> = (
  context: AuthorizationContext,
) => TResource | Promise<TResource>;

/** Decides access given the principal and the (loaded) resource. */
export type ResourceEvaluator<TResource = unknown> = (
  principal: AuthorizationPrincipal,
  resource: TResource,
  context: AuthorizationContext,
) =>
  | boolean
  | AuthorizationDecision
  | Promise<boolean | AuthorizationDecision>;

/**
 * Resource / property-based requirement. The handler obtains the resource
 * (from `context.resource` if pre-attached, else via `load`) and runs
 * `evaluate(principal, resource, context)`. Property-level checks are done
 * inside the evaluator by inspecting resource fields.
 */
export class ResourceRequirement<TResource = unknown>
  implements AuthorizationRequirement<typeof RESOURCE_REQUIREMENT>
{
  readonly type = RESOURCE_REQUIREMENT;

  constructor(
    public readonly evaluate: ResourceEvaluator<TResource>,
    public readonly load?: ResourceLoader<TResource>,
  ) {}
}
