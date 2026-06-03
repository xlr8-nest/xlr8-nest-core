import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { POLICY_REQUIREMENT, PolicyRequirement } from '../requirements/policy.requirement';
import { AuthorizationService } from '../services/authorization.service';
import { PolicyRegistry } from '../services/policy-registry';
import type { AuthorizationContext } from '../types/authorization-context.type';
import type { AuthorizationDecision } from '../types/decision.type';
import type { RequirementHandler } from './requirement-handler.interface';

/**
 * Evaluates {@link PolicyRequirement} by looking up a named policy and running
 * its requirements (logical AND) and/or its custom `evaluate` predicate.
 *
 * {@link AuthorizationService} is resolved lazily through {@link ModuleRef} to
 * avoid a constructor dependency cycle (the service aggregates all handlers,
 * including this one).
 */
@Injectable()
export class PolicyHandler implements RequirementHandler<PolicyRequirement> {
  readonly requirementType = POLICY_REQUIREMENT;

  constructor(
    private readonly registry: PolicyRegistry,
    private readonly moduleRef: ModuleRef,
  ) {}

  async handle(
    requirement: PolicyRequirement,
    context: AuthorizationContext,
  ): Promise<AuthorizationDecision> {
    const definition = this.registry.get(requirement.policy);
    if (!definition) {
      throw new Error(
        `Unknown authorization policy "${requirement.policy}". ` +
          `Register it via AuthzModule.forRoot({ policies: [...] }).`,
      );
    }

    if (definition.requirements && definition.requirements.length > 0) {
      const authorizationService = this.moduleRef.get(AuthorizationService, {
        strict: false,
      });
      const decision = await authorizationService.checkAll(
        definition.requirements,
        context,
      );
      if (!decision.granted) {
        return decision;
      }
    }

    if (definition.evaluate) {
      const result = await definition.evaluate(context);
      return typeof result === 'boolean' ? { granted: result } : result;
    }

    // A policy with neither requirements nor evaluate grants by default
    // only if it had requirements that all passed above; otherwise deny.
    return { granted: definition.requirements !== undefined };
  }
}
