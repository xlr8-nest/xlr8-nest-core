/**
 * Reflect metadata keys used by the authorization decorators and guard.
 */
export const AUTHZ_REQUIREMENTS_METADATA = '__authz_requirements__';
export const AUTHZ_PUBLIC_METADATA = '__authz_public__';

/**
 * DI token for the PrincipalResolver implementation. The guard injects the
 * resolver through this token so apps can swap the default request.user
 * resolver for their own (JWT claims, DB lookup, remote service, ...).
 */
export const PrincipalResolverToken = Symbol('AUTHZ_PRINCIPAL_RESOLVER');

/**
 * DI token holding the aggregated array of registered RequirementHandlers.
 * New authorization strategies are added by registering another handler here —
 * the guard, service, decorators, and module stay untouched.
 */
export const RequirementHandlerToken = Symbol('AUTHZ_REQUIREMENT_HANDLERS');

/**
 * DI token holding the registered named policy definitions (policy-based authz).
 */
export const PoliciesToken = Symbol('AUTHZ_POLICIES');

/**
 * DI token for the guard-level configuration (defaultDeny, etc.).
 */
export const AuthzGuardOptionsToken = Symbol('AUTHZ_GUARD_OPTIONS');
