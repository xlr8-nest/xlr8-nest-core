import type { AuthorizationRequirement } from '../types/requirement.type';

export const POLICY_REQUIREMENT = 'policy';

/**
 * Policy-based requirement: defers to a named policy registered in the
 * {@link PolicyRegistry}. Lets complex or reusable authorization logic live in
 * one place and be referenced declaratively by name.
 */
export class PolicyRequirement
  implements AuthorizationRequirement<typeof POLICY_REQUIREMENT>
{
  readonly type = POLICY_REQUIREMENT;

  constructor(public readonly policy: string) {}
}
