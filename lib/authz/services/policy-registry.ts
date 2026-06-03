import { Inject, Injectable, Optional } from '@nestjs/common';
import { PoliciesToken } from '../constants/metadata';
import type { AuthorizationContext } from '../types/authorization-context.type';
import type { AuthorizationDecision } from '../types/decision.type';
import type { AuthorizationRequirement } from '../types/requirement.type';

/**
 * A custom predicate for a named policy. Receives the full context (principal,
 * request, resource) and returns a grant/deny.
 */
export type PolicyEvaluator = (
  context: AuthorizationContext,
) =>
  | boolean
  | AuthorizationDecision
  | Promise<boolean | AuthorizationDecision>;

/**
 * A named, reusable authorization policy. A policy is either:
 *  - a composition of requirements (evaluated as logical AND), and/or
 *  - a custom `evaluate` predicate.
 * If both are provided, requirements run first, then `evaluate`.
 */
export interface PolicyDefinition {
  name: string;
  requirements?: AuthorizationRequirement[];
  evaluate?: PolicyEvaluator;
}

/**
 * Holds named policies registered via `AuthzModule.forRoot({ policies })`.
 * Looked up by {@link PolicyHandler} when a `@RequirePolicy('name')` is hit.
 */
@Injectable()
export class PolicyRegistry {
  private readonly policies = new Map<string, PolicyDefinition>();

  constructor(
    @Optional()
    @Inject(PoliciesToken)
    policies: PolicyDefinition[] = [],
  ) {
    for (const policy of policies) {
      this.register(policy);
    }
  }

  register(policy: PolicyDefinition): void {
    if (this.policies.has(policy.name)) {
      throw new Error(`Authorization policy "${policy.name}" is already registered.`);
    }
    const hasRequirements = Array.isArray(policy.requirements) && policy.requirements.length > 0;
    const hasEvaluator = typeof policy.evaluate === 'function';
    if (!hasRequirements && !hasEvaluator) {
      throw new Error(
        `Authorization policy "${policy.name}" has neither requirements nor an evaluate predicate. ` +
          `A policy must have at least one.`,
      );
    }
    this.policies.set(policy.name, policy);
  }

  get(name: string): PolicyDefinition | undefined {
    return this.policies.get(name);
  }

  has(name: string): boolean {
    return this.policies.has(name);
  }
}
