import type { AuthorizationPrincipal } from './principal.type';

/**
 * The context handed to every {@link RequirementHandler} when evaluating a
 * requirement. Built by the guard for the HTTP path, or by the caller for
 * imperative checks via {@link AuthorizationService}.
 */
export interface AuthorizationContext {
  /** The subject the decision is made about. */
  principal: AuthorizationPrincipal;

  /**
   * The raw transport request (e.g. Express request) when available.
   * Present on the guard path; may be undefined for imperative checks.
   */
  request?: unknown;

  /**
   * The resource the decision concerns (resource/property-based authz).
   * May be pre-attached by the caller, or lazily loaded by a resource
   * requirement's loader.
   */
  resource?: unknown;
}
