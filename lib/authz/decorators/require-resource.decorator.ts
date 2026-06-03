import {
  ResourceEvaluator,
  ResourceLoader,
  ResourceRequirement,
} from '../requirements/resource.requirement';
import { Authorize } from './authorize.decorator';

/**
 * Resource / property-based authorization. Provide an evaluator that decides
 * access from the principal and the resource, and optionally a loader that
 * fetches the resource (otherwise it must be pre-attached to the context).
 *
 *     @RequireResource<Article>(
 *       (principal, article) => article.authorId === principal.id,
 *       (ctx) => articleRepo.findById((ctx.request as any).params.id),
 *     )
 */
export const RequireResource = <TResource = unknown>(
  evaluate: ResourceEvaluator<TResource>,
  load?: ResourceLoader<TResource>,
): MethodDecorator & ClassDecorator => {
  return Authorize(new ResourceRequirement<TResource>(evaluate, load));
};

export interface CheckOwnershipOptions<TResource = unknown> {
  /** Property on the resource holding the owner's id. Default: 'ownerId'. */
  ownerField?: string;
  /** Roles that bypass the ownership check (e.g. ['admin']). */
  bypassRoles?: string[];
  /** Optional loader; if omitted the resource must be pre-attached. */
  load?: ResourceLoader<TResource>;
}

/**
 * Ownership-based authorization sugar: grants when the principal's id equals
 * the resource's owner field, or the principal holds a bypass role.
 *
 *     @CheckOwnership({ ownerField: 'authorId', bypassRoles: ['admin'], load })
 */
export const CheckOwnership = <TResource = unknown>(
  options: CheckOwnershipOptions<TResource> = {},
): MethodDecorator & ClassDecorator => {
  const ownerField = options.ownerField ?? 'ownerId';
  const bypassRoles = options.bypassRoles ?? [];

  const evaluate: ResourceEvaluator<TResource> = (principal, resource) => {
    if (bypassRoles.some((role) => principal.roles.includes(role))) {
      return true;
    }
    if (resource === null || resource === undefined) {
      return false;
    }
    const ownerId = (resource as Record<string, unknown>)[ownerField];
    return ownerId !== undefined && String(ownerId) === principal.id;
  };

  return Authorize(new ResourceRequirement<TResource>(evaluate, options.load));
};
