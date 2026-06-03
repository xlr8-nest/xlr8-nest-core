import { Injectable } from '@nestjs/common';
import {
  RESOURCE_REQUIREMENT,
  ResourceRequirement,
} from '../requirements/resource.requirement';
import type { AuthorizationContext } from '../types/authorization-context.type';
import type { AuthorizationDecision } from '../types/decision.type';
import type { RequirementHandler } from './requirement-handler.interface';

/**
 * Evaluates {@link ResourceRequirement}: ensures the resource is available
 * (pre-attached on the context, or loaded via the requirement's loader) and
 * delegates the decision to the requirement's evaluator.
 */
@Injectable()
export class ResourceHandler implements RequirementHandler<ResourceRequirement> {
  readonly requirementType = RESOURCE_REQUIREMENT;

  async handle(
    requirement: ResourceRequirement,
    context: AuthorizationContext,
  ): Promise<boolean | AuthorizationDecision> {
    let resource = context.resource;
    if (resource === undefined && requirement.load) {
      resource = await requirement.load(context);
    }

    const enriched: AuthorizationContext = { ...context, resource };
    return requirement.evaluate(context.principal, resource, enriched);
  }
}
