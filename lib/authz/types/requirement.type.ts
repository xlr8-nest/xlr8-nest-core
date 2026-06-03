/**
 * A declarative authorization demand attached to a route (or evaluated
 * imperatively). Each requirement carries a `type` discriminator that the
 * matching {@link RequirementHandler} keys on.
 *
 * Built-in requirement types: 'roles', 'permissions', 'policy', 'resource'.
 * Custom strategies define their own `type` literal — no changes to the guard
 * or module are needed, only a new handler.
 */
export interface AuthorizationRequirement<TType extends string = string> {
  readonly type: TType;
}
