import type { ErrorType } from '../../types/common/error.type';

/**
 * Named error constants for the authorization framework.
 *
 * Import this catalog at throw sites instead of inlining `code` and `message`
 * strings. This ensures every error code is defined in one place, appears in
 * documentation, and is greppable across the codebase.
 *
 * @example
 * import { AuthzErrors } from '@xlr8-nest/core/authz';
 *
 * throw new UnauthorizedError(AuthzErrors.Unauthenticated);
 * throw new ForbiddenError(AuthzErrors.AccessDenied);
 * throw new ForbiddenError({ ...AuthzErrors.AccessDenied, message: decision.reason });
 */
export const AuthzErrors = {
  /**
   * Guard: the route has no `@Require*` / `@Authorize` decorator and
   * `defaultDeny: true` is set in `AuthzModule.forRoot`. → HTTP 403.
   */
  NoPolicy: {
    code: 'AUTHZ_NO_POLICY',
    message: 'No authorization policy is declared for this route.',
  },

  /**
   * Guard / service: the `PrincipalResolver` returned `null` — the caller
   * is not authenticated. → HTTP 401.
   */
  Unauthenticated: {
    code: 'AUTHZ_UNAUTHENTICATED',
    message: 'Authentication is required to access this resource.',
  },

  /**
   * Guard / `AuthorizationService.authorize()`: the principal was resolved
   * but at least one requirement was denied. → HTTP 403.
   */
  AccessDenied: {
    code: 'AUTHZ_ACCESS_DENIED',
    message: 'You do not have permission to perform this action.',
  },

  /**
   * `AuthorizationService` constructor: two handlers were registered for the
   * same `requirementType`. Developer / startup error.
   */
  DuplicateHandler: {
    code: 'AUTHZ_DUPLICATE_HANDLER',
    message: 'A requirement handler is already registered for this requirement type.',
  },

  /**
   * `AuthorizationService.check()`: dispatching a requirement whose `type`
   * has no registered handler. Developer / runtime error.
   */
  UnknownRequirementType: {
    code: 'AUTHZ_UNKNOWN_REQUIREMENT_TYPE',
    message: 'No authorization handler is registered for this requirement type.',
  },

  /**
   * `PolicyHandler`: a `@RequirePolicy('name')` references a name that was
   * never registered via `AuthzModule.forRoot({ policies })`. Developer error.
   */
  UnknownPolicy: {
    code: 'AUTHZ_UNKNOWN_POLICY',
    message: 'The referenced authorization policy is not registered.',
  },

  /**
   * `PolicyRegistry.register()`: a policy with the same name was already
   * registered. Developer / startup error.
   */
  DuplicatePolicy: {
    code: 'AUTHZ_DUPLICATE_POLICY',
    message: 'An authorization policy with this name is already registered.',
  },

  /**
   * `PolicyRegistry.register()`: a policy was registered with neither
   * `requirements` nor an `evaluate` predicate. Developer / startup error.
   */
  EmptyPolicy: {
    code: 'AUTHZ_EMPTY_POLICY',
    message: 'An authorization policy must have at least one requirement or an evaluate predicate.',
  },
} as const satisfies Record<string, ErrorType>;
