/**
 * User identity interface for authentication contexts
 * Can be extended to include OAuth2 User interface if needed
 */
export interface UserIdentity {
  id: string;

  username: string;

  /**
   * Role names assigned to the user.
   *
   * BREAKING (v3): widened from `string` to `string[]` to support RBAC via the
   * `@xlr8-nest/core/authz` framework. The default `RequestUserResolver`
   * tolerates the legacy single-string shape and normalizes it to an array.
   */
  roles: string[];

  permissions: string[];
}
