/**
 * The authenticated subject an authorization decision is made about.
 *
 * This is a normalized view derived from the app's authentication result
 * (e.g. `UserIdentity` on `request.user`) by a {@link PrincipalResolver}.
 * Keeping it separate from the transport-level identity lets authorization
 * stay agnostic of how authentication is implemented.
 */
export interface AuthorizationPrincipal {
  /** Stable unique id of the subject. */
  id: string;

  /** Role names assigned to the subject (RBAC). */
  roles: string[];

  /** Permission strings granted to the subject (permission-based). */
  permissions: string[];

  /**
   * Arbitrary attributes for attribute/resource-based decisions
   * (e.g. tenantId, plan, department). Optional and strategy-defined.
   */
  attributes?: Record<string, unknown>;

  /** The original identity object the principal was resolved from. */
  raw?: unknown;
}
