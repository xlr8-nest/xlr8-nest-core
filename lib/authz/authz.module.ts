import {
  DynamicModule,
  Module,
  ModuleMetadata,
  Provider,
  Type,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  AuthzGuardOptionsToken,
  PoliciesToken,
  PrincipalResolverToken,
  RequirementHandlerToken,
} from './constants/metadata';
import { AuthorizationGuard, AuthzGuardOptions } from './guards/authorization.guard';
import { PermissionsHandler } from './handlers/permissions.handler';
import { PolicyHandler } from './handlers/policy.handler';
import type { RequirementHandler } from './handlers/requirement-handler.interface';
import { ResourceHandler } from './handlers/resource.handler';
import { RolesHandler } from './handlers/roles.handler';
import type { PrincipalResolver } from './resolver/principal-resolver.interface';
import { RequestUserResolver } from './resolver/request-user.resolver';
import { AuthorizationService } from './services/authorization.service';
import { PolicyDefinition, PolicyRegistry } from './services/policy-registry';

const BUILTIN_HANDLERS: Array<Type<RequirementHandler>> = [
  RolesHandler,
  PermissionsHandler,
  PolicyHandler,
  ResourceHandler,
];

export interface AuthzModuleOptions {
  /**
   * Principal resolver implementation. Defaults to {@link RequestUserResolver}
   * (reads `request.user`).
   */
  resolver?: Type<PrincipalResolver>;

  /**
   * Additional custom {@link RequirementHandler} classes. Built-in handlers
   * (roles, permissions, policy, resource) are always registered.
   */
  handlers?: Array<Type<RequirementHandler>>;

  /** Named policies for policy-based authorization. */
  policies?: PolicyDefinition[];

  /**
   * Register {@link AuthorizationGuard} as a global APP_GUARD. When true, every
   * route is governed by the guard (use `@Public()` to opt out). Default: false.
   */
  registerGlobalGuard?: boolean;

  /**
   * When `true` (recommended for production), routes with no `@Require*`/`@Authorize`
   * decoration and no `@Public()` throw 403 when the global guard is active.
   * Defaults to `false` (fail-open: unannotated routes pass through).
   */
  defaultDeny?: boolean;

  /** Make the module global so the service/guard are injectable anywhere. Default: true. */
  global?: boolean;
}

export interface AuthzModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  resolver?: Type<PrincipalResolver>;
  handlers?: Array<Type<RequirementHandler>>;
  registerGlobalGuard?: boolean;
  defaultDeny?: boolean;
  global?: boolean;
  /** Async factory producing the named policies. */
  useFactory: (
    ...args: unknown[]
  ) => PolicyDefinition[] | Promise<PolicyDefinition[]>;
  inject?: Array<Type<unknown> | string | symbol>;
}

/**
 * Wires the authorization framework into a NestJS app.
 *
 *     @Module({
 *       imports: [
 *         AuthzModule.forRoot({
 *           policies: [{ name: 'CanEditArticle', requirements: [...] }],
 *           registerGlobalGuard: true,
 *         }),
 *       ],
 *     })
 *
 * Provides: the principal resolver, all requirement handlers (built-in + custom)
 * aggregated under RequirementHandlerToken, the PolicyRegistry, the
 * AuthorizationService (imperative checks), and the AuthorizationGuard.
 */
@Module({})
export class AuthzModule {
  static forRoot(options: AuthzModuleOptions = {}): DynamicModule {
    const resolverClass = options.resolver ?? RequestUserResolver;
    const handlerClasses = [...BUILTIN_HANDLERS, ...(options.handlers ?? [])];
    const guardOptions: AuthzGuardOptions = { defaultDeny: options.defaultDeny ?? false };

    const providers: Provider[] = [
      resolverClass,
      { provide: PrincipalResolverToken, useExisting: resolverClass },
      { provide: PoliciesToken, useValue: options.policies ?? [] },
      { provide: AuthzGuardOptionsToken, useValue: guardOptions },
      PolicyRegistry,
      ...handlerClasses,
      {
        provide: RequirementHandlerToken,
        useFactory: (...handlers: RequirementHandler[]) => handlers,
        inject: handlerClasses,
      },
      AuthorizationService,
      AuthorizationGuard,
      ...(options.registerGlobalGuard
        ? [{ provide: APP_GUARD, useExisting: AuthorizationGuard }]
        : []),
    ];

    return {
      module: AuthzModule,
      global: options.global ?? true,
      providers,
      exports: [
        AuthorizationService,
        AuthorizationGuard,
        PolicyRegistry,
        PrincipalResolverToken,
        RequirementHandlerToken,
      ],
    };
  }

  static registerAsync(options: AuthzModuleAsyncOptions): DynamicModule {
    const resolverClass = options.resolver ?? RequestUserResolver;
    const handlerClasses = [...BUILTIN_HANDLERS, ...(options.handlers ?? [])];
    const guardOptions: AuthzGuardOptions = { defaultDeny: options.defaultDeny ?? false };

    const providers: Provider[] = [
      resolverClass,
      { provide: PrincipalResolverToken, useExisting: resolverClass },
      {
        provide: PoliciesToken,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      { provide: AuthzGuardOptionsToken, useValue: guardOptions },
      PolicyRegistry,
      ...handlerClasses,
      {
        provide: RequirementHandlerToken,
        useFactory: (...handlers: RequirementHandler[]) => handlers,
        inject: handlerClasses,
      },
      AuthorizationService,
      AuthorizationGuard,
      ...(options.registerGlobalGuard
        ? [{ provide: APP_GUARD, useExisting: AuthorizationGuard }]
        : []),
    ];

    return {
      module: AuthzModule,
      global: options.global ?? true,
      imports: options.imports ?? [],
      providers,
      exports: [
        AuthorizationService,
        AuthorizationGuard,
        PolicyRegistry,
        PrincipalResolverToken,
        RequirementHandlerToken,
      ],
    };
  }
}
