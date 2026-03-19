/**
 * User identity interface for authentication contexts
 * Can be extended to include OAuth2 User interface if needed
 */
export interface UserIdentity {
  id: string;

  username: string;

  roles: string;

  permissions: string[];
}
