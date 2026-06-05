import { Inject, Injectable, Optional } from '@nestjs/common';
import { ForbiddenError } from '../../errors/forbidden.error';
import { RequirementHandlerToken } from '../constants/metadata';
import { AuthzErrors } from '../errors/authz.errors';
import type { RequirementHandler } from '../handlers/requirement-handler.interface';
import type { AuthorizationContext } from '../types/authorization-context.type';
import type { AuthorizationDecision } from '../types/decision.type';
import type { AuthorizationPrincipal } from '../types/principal.type';
import type { AuthorizationRequirement } from '../types/requirement.type';

/**
 * The shared evaluation core. Resolves each requirement to its registered
 * handler and produces a decision. Used by both {@link AuthorizationGuard}
 * (declarative, on controllers) and directly by application code (imperative,
 * in command handlers / domain services).
 */
@Injectable()
export class AuthorizationService {
  private readonly handlersByType: Map<string, RequirementHandler>;

  constructor(
    @Optional()
    @Inject(RequirementHandlerToken)
    handlers: RequirementHandler[] = [],
  ) {
    this.handlersByType = new Map();
    for (const handler of handlers) {
      if (this.handlersByType.has(handler.requirementType)) {
        throw new Error(
          `[${AuthzErrors.DuplicateHandler.code}] ${AuthzErrors.DuplicateHandler.message} ` +
            `Requirement type: "${handler.requirementType}".`,
        );
      }
      this.handlersByType.set(handler.requirementType, handler);
    }
  }

  /** Evaluate a single requirement against the context. */
  async check(
    requirement: AuthorizationRequirement,
    context: AuthorizationContext,
  ): Promise<AuthorizationDecision> {
    const handler = this.handlersByType.get(requirement.type);
    if (!handler) {
      throw new Error(
        `[${AuthzErrors.UnknownRequirementType.code}] ${AuthzErrors.UnknownRequirementType.message} ` +
          `Requirement type: "${requirement.type}". Register a handler via AuthzModule.forRoot({ handlers: [...] }).`,
      );
    }

    const result = await handler.handle(requirement, context);
    const decision = normalizeDecision(result);
    if (!decision.granted && decision.failedRequirementType === undefined) {
      decision.failedRequirementType = requirement.type;
    }
    return decision;
  }

  /**
   * Evaluate all requirements (logical AND). Returns the first denial, or a
   * granted decision when every requirement passes. An empty set is granted.
   */
  async checkAll(
    requirements: AuthorizationRequirement[],
    context: AuthorizationContext,
  ): Promise<AuthorizationDecision> {
    for (const requirement of requirements) {
      const decision = await this.check(requirement, context);
      if (!decision.granted) {
        return decision;
      }
    }
    return { granted: true };
  }

  /**
   * Imperative boolean check for use inside handlers / domain services.
   *
   *     if (!(await authz.can(principal, [new RolesRequirement(['admin'])], { resource }))) { ... }
   */
  async can(
    principal: AuthorizationPrincipal,
    requirements: AuthorizationRequirement[],
    context: Omit<AuthorizationContext, 'principal'> = {},
  ): Promise<boolean> {
    const decision = await this.checkAll(requirements, { ...context, principal });
    return decision.granted;
  }

  /**
   * Imperative assertion. Throws {@link ForbiddenError} when any requirement
   * is not satisfied.
   */
  async authorize(
    principal: AuthorizationPrincipal,
    requirements: AuthorizationRequirement[],
    context: Omit<AuthorizationContext, 'principal'> = {},
  ): Promise<void> {
    const decision = await this.checkAll(requirements, { ...context, principal });
    if (!decision.granted) {
      throw new ForbiddenError({
        ...AuthzErrors.AccessDenied,
        message: decision.reason ?? AuthzErrors.AccessDenied.message,
      });
    }
  }
}

function normalizeDecision(
  result: boolean | AuthorizationDecision,
): AuthorizationDecision {
  return typeof result === 'boolean' ? { granted: result } : result;
}
