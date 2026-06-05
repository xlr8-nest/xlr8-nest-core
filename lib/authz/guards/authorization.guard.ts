import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '../../errors/forbidden.error';
import { UnauthorizedError } from '../../errors/unauthorized.error';
import {
  AUTHZ_PUBLIC_METADATA,
  AUTHZ_REQUIREMENTS_METADATA,
  AuthzGuardOptionsToken,
  PrincipalResolverToken,
} from '../constants/metadata';
import { AuthzErrors } from '../errors/authz.errors';
import type { PrincipalResolver } from '../resolver/principal-resolver.interface';
import { AuthorizationService } from '../services/authorization.service';
import type { AuthorizationRequirement } from '../types/requirement.type';

export interface AuthzGuardOptions {
  /**
   * When true and registered as a global guard, routes with no
   * `@Require*`/`@Authorize` decoration and no `@Public()` are denied.
   * Defaults to false (fail-open: unannotated routes are allowed through).
   *
   * Set this to `true` in production to ensure every new endpoint must
   * explicitly declare its authorization policy.
   */
  defaultDeny?: boolean;
}

/**
 * Single guard for all authorization strategies. It:
 *   1. honors `@Public()` (bypass),
 *   2. collects requirements from the method and the controller class,
 *   3. when no requirements and `defaultDeny` is true — denies the request,
 *   4. resolves the principal via the configured {@link PrincipalResolver},
 *   5. delegates evaluation to {@link AuthorizationService},
 *   6. throws {@link UnauthorizedError} (no principal) or {@link ForbiddenError}.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(AuthorizationGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(PrincipalResolverToken)
    private readonly principalResolver: PrincipalResolver,
    private readonly authorizationService: AuthorizationService,
    @Optional()
    @Inject(AuthzGuardOptionsToken)
    private readonly guardOptions: AuthzGuardOptions = {},
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      AUTHZ_PUBLIC_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const requirements =
      this.reflector.getAllAndMerge<AuthorizationRequirement[]>(
        AUTHZ_REQUIREMENTS_METADATA,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (requirements.length === 0) {
      if (this.guardOptions.defaultDeny) {
        throw new ForbiddenError(AuthzErrors.NoPolicy);
      }
      return true;
    }

    const principal = await this.principalResolver.resolve(context);
    if (!principal) {
      throw new UnauthorizedError(AuthzErrors.Unauthenticated);
    }

    const request = context.switchToHttp().getRequest<unknown>();
    const decision = await this.authorizationService.checkAll(requirements, {
      principal,
      request,
    });

    if (!decision.granted) {
      this.logger.debug(
        `Authorization denied: type=${decision.failedRequirementType ?? 'unknown'} reason=${decision.reason ?? 'none'} principal=${principal.id}`,
      );
      throw new ForbiddenError({
        ...AuthzErrors.AccessDenied,
        message: decision.reason ?? AuthzErrors.AccessDenied.message,
      });
    }

    return true;
  }
}
