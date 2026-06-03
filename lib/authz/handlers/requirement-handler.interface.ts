import type { AuthorizationContext } from '../types/authorization-context.type';
import type { AuthorizationDecision } from '../types/decision.type';
import type { AuthorizationRequirement } from '../types/requirement.type';

/**
 * A strategy that evaluates one kind of {@link AuthorizationRequirement}.
 *
 * This is the framework's single extension point. To add a new authorization
 * strategy (ABAC, time-window, tenant-scoped, ...):
 *   1. define a requirement with a new `type`,
 *   2. implement a handler whose `requirementType` matches it,
 *   3. register it via `AuthzModule.forRoot({ handlers: [...] })`.
 * Nothing else in the framework changes.
 */
export interface RequirementHandler<
  TRequirement extends AuthorizationRequirement = AuthorizationRequirement,
> {
  /** The requirement `type` this handler is responsible for. */
  readonly requirementType: TRequirement['type'];

  /**
   * Evaluate the requirement. Return a boolean for the simple grant/deny case,
   * or an {@link AuthorizationDecision} to attach a reason.
   */
  handle(
    requirement: TRequirement,
    context: AuthorizationContext,
  ): Promise<boolean | AuthorizationDecision> | boolean | AuthorizationDecision;
}
