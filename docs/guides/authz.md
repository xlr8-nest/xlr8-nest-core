# Authorization (`@xlr8-nest/core/authz`)

Declarative, extensible authorization for NestJS — RBAC, permissions, policies, and resource ownership in one guard with a clean extension point for custom strategies.

**When to use:** any NestJS app that needs route-level or domain-level access control after authentication. Pair with your existing JWT/Passport guard; this module reads the already-authenticated user and decides what they may do.

---

## Quick start

### 1. Register the module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { AuthzModule } from '@xlr8-nest/core/authz';

@Module({
  imports: [
    AuthzModule.forRoot({ registerGlobalGuard: true }),
  ],
})
export class AppModule {}
```

`registerGlobalGuard: true` applies `AuthorizationGuard` to every route. Opt individual routes out with `@Public()`.

### 2. Protect a route

```typescript
// src/articles/articles.controller.ts
import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import {
  RequireRoles,
  RequirePermissions,
  CheckOwnership,
  Public,
} from '@xlr8-nest/core/authz';

@Controller('articles')
export class ArticlesController {
  @Get()
  @Public()                              // no auth required
  findAll() { return []; }

  @Post()
  @RequireRoles('author', 'admin')       // any of these roles
  create(@Body() dto: CreateArticleDto) { }

  @Patch(':id')
  @CheckOwnership({
    ownerField: 'authorId',
    bypassRoles: ['admin'],
    load: async (ctx) => articleRepo.findById(ctx.request.params.id),
  })
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) { }
}
```

### 3. JwtAuthGuard must run first

`AuthorizationGuard` reads `request.user`. Your `JwtAuthGuard` must populate it before `AuthorizationGuard` evaluates. **Both guards must respect `@Public()`** — otherwise the JWT guard will reject anonymous requests to public routes before authorization even runs.

```typescript
// src/auth/jwt-auth.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AUTHZ_PUBLIC_METADATA } from '@xlr8-nest/core/authz';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check @Public() BEFORE calling super — prevents JWT rejection on open routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      AUTHZ_PUBLIC_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

Register `JwtAuthGuard` **before** `AuthorizationGuard` so `request.user` is set by the time authorization runs:

```typescript
// app.module.ts
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuthzModule } from '@xlr8-nest/core/authz';

@Module({
  imports: [
    AuthzModule.forRoot({ registerGlobalGuard: true }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },  // runs first — populates request.user
    // AuthorizationGuard is registered internally by registerGlobalGuard: true
  ],
})
export class AppModule {}
```

---

## Core model

Three concepts make up the framework:

| Concept | What it is | Example |
|---|---|---|
| **Requirement** | A plain object with a `type` string attached to a route via a decorator. | `{ type: 'roles', roles: ['admin'] }` |
| **Handler** | An `@Injectable()` class that knows how to evaluate one requirement `type`. | `RolesHandler` evaluates `type: 'roles'` |
| **Principal** | The normalized authenticated subject: `{ id, roles, permissions, attributes?, raw? }`. | Resolved from `request.user` by default |

The **extensibility guarantee**: adding a brand-new authorization strategy means writing one `AuthorizationRequirement` + one `RequirementHandler` and registering the handler. The guard, service, module, and all existing decorators are untouched.

### Request flow

```
HTTP request
  │
  ├─ @Public()?  ──────────────────▶ ALLOW
  │
  ├─ collect requirements from class + method metadata
  │   no requirements + defaultDeny:false ─▶ ALLOW
  │   no requirements + defaultDeny:true  ─▶ 403
  │
  ├─ PrincipalResolver.resolve(ctx) → null? ─▶ 401 UnauthorizedError
  │
  └─ for each requirement (AND, short-circuits):
       find handler by type → handler.handle(req, ctx)
       any denied? ─▶ 403 ForbiddenError
       all granted? ─▶ ALLOW
```

---

## The four decorators

### `@RequireRoles`

Grant if the principal holds at least one of the listed roles (`mode: 'any'`, default), or all of them (`mode: 'all'`).

```typescript
import { RequireRoles } from '@xlr8-nest/core/authz';

@Get('dashboard')
@RequireRoles('admin', 'manager')                   // any of these roles

@Delete('purge')
@RequireRoles('admin', 'superuser', { mode: 'all' }) // must hold both
```

### `@RequirePermissions`

Grant if the principal holds all listed permissions (`mode: 'all'`, default) or any of them (`mode: 'any'`). Permissions are wildcard-aware on the **granted** side.

```typescript
import { RequirePermissions } from '@xlr8-nest/core/authz';

@Post()
@RequirePermissions('user:write')                          // single; default mode: 'all'

@Get('reports')
@RequirePermissions('reports:view', 'reports:export', { mode: 'any' })
```

**Wildcard matching** — the wildcard is in what the *principal holds*, not what the route requires:

| Granted | Required | Match |
|---|---|---|
| `user:*` | `user:read` | yes — trailing wildcard |
| `*` | `anything:here` | yes — global wildcard |
| `user:*:read` | `user:profile:read` | yes — interior wildcard |
| `user:read` | `user:write` | no |

### `@RequirePolicy`

Reference a named policy registered in `AuthzModule.forRoot`. Policies are reusable, named combinations of requirements and/or a custom predicate.

```typescript
import { RequirePolicy } from '@xlr8-nest/core/authz';

@Post(':id/publish')
@RequirePolicy('CanPublishArticle')                // single policy

@Post(':id/close')
@RequirePolicy('CanCloseTicket', 'IsBusinessHours') // multiple — AND
```

### `@CheckOwnership` / `@RequireResource`

Resource-based checks that load the record and evaluate it against the principal.

**`@CheckOwnership`** — shorthand for the common ownership pattern:

```typescript
import { CheckOwnership } from '@xlr8-nest/core/authz';

@Patch('posts/:id')
@CheckOwnership({
  ownerField: 'authorId',           // resource[ownerField] === principal.id (default: 'ownerId')
  bypassRoles: ['admin'],           // skip the check for these roles
  load: async (ctx) => postRepo.findById(ctx.request.params.id),
})
update() {}
```

**`@RequireResource`** — generic; full control over the evaluation:

```typescript
import { RequireResource } from '@xlr8-nest/core/authz';

@Get('documents/:id')
@RequireResource<Document>(
  (principal, doc) =>
    doc.ownerId === principal.id ||
    doc.sharedWith.includes(principal.id) ||
    principal.roles.includes('admin'),
  (ctx) => documentRepo.findById(ctx.request.params.id),
)
read() {}
```

---

## Defining policies

Register policies in `AuthzModule.forRoot`. Each `PolicyDefinition` has a `name`, an optional `requirements` array (evaluated as logical AND), and an optional `evaluate` predicate. At least one of the two must be present.

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import {
  AuthzModule,
  RolesRequirement,
  PermissionsRequirement,
  type PolicyDefinition,
} from '@xlr8-nest/core/authz';

const policies: PolicyDefinition[] = [
  // requirement-based composition
  {
    name: 'CanManageBilling',
    requirements: [
      new RolesRequirement(['admin', 'billing-manager']),
      new PermissionsRequirement(['billing:write']),
    ],
  },
  // pure predicate — receives full AuthorizationContext
  {
    name: 'IsBusinessHours',
    evaluate: () => {
      const h = new Date().getUTCHours();
      return h >= 8 && h < 18;
    },
  },
  // both: requirements run first (AND), then the predicate
  {
    name: 'CanCloseTicket',
    requirements: [new PermissionsRequirement(['ticket:close'])],
    evaluate: (ctx) => ctx.principal.attributes?.department === 'support',
  },
];

@Module({
  imports: [AuthzModule.forRoot({ policies, registerGlobalGuard: true })],
})
export class AppModule {}
```

Use `AuthzModule.registerAsync` when policies depend on async providers such as `ConfigService`:

```typescript
AuthzModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (cfg: ConfigService): Promise<PolicyDefinition[]> => [
    {
      name: 'FeatureFlagEnabled',
      evaluate: () => cfg.get<boolean>('FEATURE_NEW_BILLING', false),
    },
  ],
  registerGlobalGuard: true,
})
```

---

## Imperative checks

Use `AuthorizationService` inside command handlers or domain services when the authorization decision belongs in the business layer, not at the route edge.

```typescript
// src/articles/article.service.ts
import { Injectable } from '@nestjs/common';
import {
  AuthorizationService,
  RolesRequirement,
  ResourceRequirement,
  type AuthorizationPrincipal,
} from '@xlr8-nest/core/authz';
import { ForbiddenError } from '@xlr8-nest/core/errors';
import { ArticleErrors } from './errors/article.errors';

@Injectable()
export class ArticleService {
  constructor(private readonly authz: AuthorizationService) {}

  async publish(principal: AuthorizationPrincipal, article: Article): Promise<void> {
    // authorize() throws ForbiddenError on denial
    await this.authz.authorize(
      principal,
      [
        new RolesRequirement(['editor', 'admin']),
        new ResourceRequirement<Article>((p, a) => a.authorId === p.id),
      ],
      { resource: article },
    );
    article.publish();
  }

  async canDelete(principal: AuthorizationPrincipal): Promise<boolean> {
    // can() returns boolean, never throws
    return this.authz.can(principal, [new RolesRequirement(['admin'])]);
  }
}
```

| Method | Returns | Use when |
|---|---|---|
| `authorize(principal, reqs, ctx?)` | `Promise<void>` — throws `ForbiddenError` | enforce-or-fail |
| `can(principal, reqs, ctx?)` | `Promise<boolean>` | branch on the result |
| `checkAll(reqs, ctx)` | `Promise<AuthorizationDecision>` | need the decision reason |
| `check(req, ctx)` | `Promise<AuthorizationDecision>` | single requirement evaluation |

---

## `defaultDeny` in production

When `defaultDeny: false` (the default), any route without a `@Require*` decorator is allowed through. This is safe for incremental adoption.

When `defaultDeny: true`, any unannotated route throws `403 AUTHZ_NO_POLICY`. Every route must have an explicit `@Require*` decorator or `@Public()`. Enable this in production to catch accidentally unprotected routes at development time.

```typescript
AuthzModule.forRoot({
  registerGlobalGuard: true,
  defaultDeny: true,          // fail-closed: 403 on routes with no annotation
})
```

With `defaultDeny: true`, public routes still need `@Public()`:

```typescript
@Get('health')
@Public()                     // required — otherwise 403
health() { return 'ok'; }
```

---

## Custom strategy recipe

Add a brand-new authorization dimension without touching any framework code.

```typescript
// src/authz/ip-allowlist/ip-allowlist.requirement.ts
import type { AuthorizationRequirement } from '@xlr8-nest/core/authz';

export class IpAllowlistRequirement implements AuthorizationRequirement<'ip-allowlist'> {
  readonly type = 'ip-allowlist' as const;
  constructor(public readonly ranges: string[]) {}
}
```

```typescript
// src/authz/ip-allowlist/ip-allowlist.handler.ts
import { Injectable } from '@nestjs/common';
import { type RequirementHandler, type AuthorizationContext } from '@xlr8-nest/core/authz';
import { IpAllowlistRequirement } from './ip-allowlist.requirement';

@Injectable()
export class IpAllowlistHandler implements RequirementHandler<IpAllowlistRequirement> {
  readonly requirementType = 'ip-allowlist';

  handle(req: IpAllowlistRequirement, ctx: AuthorizationContext): boolean {
    const ip: string = (ctx.request as any).ip ?? '';
    return req.ranges.some((range) => isInRange(ip, range));   // your IP lib
  }
}
```

```typescript
// src/app.module.ts — register the handler
AuthzModule.forRoot({
  handlers: [IpAllowlistHandler],
  registerGlobalGuard: true,
})
```

```typescript
// src/authz/ip-allowlist/ip-allowlist.decorator.ts — friendly decorator (optional)
import { Authorize } from '@xlr8-nest/core/authz';
import { IpAllowlistRequirement } from './ip-allowlist.requirement';

export const AllowIpRanges = (...ranges: string[]) =>
  Authorize(new IpAllowlistRequirement(ranges));
```

```typescript
// usage — composes with everything else
@Post('payouts')
@RequireRoles('finance')
@AllowIpRanges('10.0.0.0/8', '192.168.1.0/24')
runPayouts() {}
```

A handler may return `boolean` or an `AuthorizationDecision` (`{ granted, reason? }`) for richer diagnostics. Handlers can inject any NestJS provider via the constructor.

---

## AuthzErrors catalog

All framework-thrown errors use codes from `AuthzErrors`. Import it to match or rethrow them in your own code.

```typescript
import { AuthzErrors } from '@xlr8-nest/core/authz';
import { ForbiddenError, UnauthorizedError } from '@xlr8-nest/core/errors';
import type { ErrorType } from '@xlr8-nest/core/types';

// AuthzErrors shape (as const satisfies Record<string, ErrorType>):
// {
//   Unauthenticated:          { code: 'AUTHZ_UNAUTHENTICATED',         message: '...' }
//   AccessDenied:             { code: 'AUTHZ_ACCESS_DENIED',           message: '...' }
//   NoPolicy:                 { code: 'AUTHZ_NO_POLICY',               message: '...' }
//   UnknownRequirementType:   { code: 'AUTHZ_UNKNOWN_REQUIREMENT_TYPE',message: '...' }
//   UnknownPolicy:            { code: 'AUTHZ_UNKNOWN_POLICY',          message: '...' }
//   DuplicateHandler:         { code: 'AUTHZ_DUPLICATE_HANDLER',       message: '...' }
//   DuplicatePolicy:          { code: 'AUTHZ_DUPLICATE_POLICY',        message: '...' }
//   EmptyPolicy:              { code: 'AUTHZ_EMPTY_POLICY',            message: '...' }
// }
```

| Key | HTTP | Thrown when |
|---|---|---|
| `AuthzErrors.Unauthenticated` | 401 | Principal resolver returns `null` |
| `AuthzErrors.AccessDenied` | 403 | A requirement handler denies |
| `AuthzErrors.NoPolicy` | 403 | Route has no annotation and `defaultDeny: true` |
| `AuthzErrors.UnknownRequirementType` | — | No handler registered for a requirement's `type` |
| `AuthzErrors.UnknownPolicy` | — | `@RequirePolicy('X')` where `'X'` isn't registered |
| `AuthzErrors.DuplicateHandler` | — | Two handlers share the same `requirementType` |
| `AuthzErrors.DuplicatePolicy` | — | Two policies share the same `name` |
| `AuthzErrors.EmptyPolicy` | — | Policy has neither `requirements` nor `evaluate` |

Throw them in your own imperative checks the same way you would use a domain error catalog:

```typescript
import { ForbiddenError } from '@xlr8-nest/core/errors';
import { AuthzErrors } from '@xlr8-nest/core/authz';

throw new ForbiddenError(AuthzErrors.AccessDenied);
```

---

## Patterns & recipes

### Combining decorators (logical AND)

Stack decorators at the method level, or mix class-level with method-level. All requirements merge as logical AND.

```typescript
@Controller('billing')
@RequireRoles('employee')                    // every route needs this role
export class BillingController {
  @Post('refunds')
  @RequirePermissions('billing:refund')      // AND this permission
  @RequirePolicy('IsBusinessHours')          // AND this policy
  refund() {}
}
```

### `@Authorize` — low-level primitive

Every `@Require*` decorator is sugar over `@Authorize`. Use it to attach raw requirement objects directly:

```typescript
import { Authorize, RolesRequirement, PermissionsRequirement } from '@xlr8-nest/core/authz';

@Authorize(
  new RolesRequirement(['admin']),
  new PermissionsRequirement(['billing:write']),
)
@Post('invoices')
createInvoice() {}
```

### Custom principal resolver

Override how `request.user` is mapped to `AuthorizationPrincipal` — useful for loading roles from a database or a multi-tenant context.

```typescript
// src/auth/db-principal.resolver.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { type PrincipalResolver, type AuthorizationPrincipal } from '@xlr8-nest/core/authz';

@Injectable()
export class DbPrincipalResolver implements PrincipalResolver {
  constructor(private readonly membership: MembershipService) {}

  async resolve(ctx: ExecutionContext): Promise<AuthorizationPrincipal | null> {
    const userId = ctx.switchToHttp().getRequest().user?.id;
    if (!userId) return null;
    const { roles, permissions, tenantId } = await this.membership.loadFor(userId);
    return { id: userId, roles, permissions, attributes: { tenantId } };
  }
}

// register it
AuthzModule.forRoot({ resolver: DbPrincipalResolver, registerGlobalGuard: true })
```

### Permission utilities for manual checks

Use the exported helpers when you need wildcard-aware matching outside the guard:

```typescript
import {
  permissionMatches,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
} from '@xlr8-nest/core/authz';

permissionMatches('user:*', 'user:read')                          // true
hasPermission(['user:*', 'billing:read'], 'user:write')           // true
hasAllPermissions(['user:*'], ['user:read', 'user:write'])         // true
hasAnyPermission(['reports:view'], ['admin:panel', 'reports:view'])// true
```

---

## Important rules / gotchas

**JwtAuthGuard must run before AuthorizationGuard.** Register it as an `APP_GUARD` provider that appears before `AuthorizationGuard` in the DI order. `AuthorizationGuard` calls `PrincipalResolver.resolve`, which reads `request.user` — if the JWT guard hasn't run yet, `request.user` is `undefined` and every protected route returns 401.

**Both guards must check `@Public()`.** If `JwtAuthGuard` is global and does not check `AUTHZ_PUBLIC_METADATA`, it will reject anonymous requests to `@Public()` routes with 401 before `AuthorizationGuard` even runs. Always add the reflector check shown in the Quick start above.

**`@Public()` skips the authorization guard entirely.** It does not skip authentication. The JWT guard still runs (unless it also checks `@Public()`). `@Public()` signals: "authorization requirements do not apply to this route."

**Wildcards apply to the granted permission, not the required one.** Write `user:*` in what the principal holds. The required permission on the route is always concrete (`user:read`). `permissionMatches('user:read', 'user:*')` returns `false`.

**`@RequirePermissions` defaults to `mode: 'all'`; `@RequireRoles` defaults to `mode: 'any'`.** This matches common intent — any sufficient role, all required permissions.

**Multiple requirements are always AND.** For OR across different requirement types, use a policy with a custom `evaluate` predicate, or write a custom requirement + handler.

**Unknown requirement type throws at evaluation time.** If a handler is not registered for a type, the guard throws (not a 403 — an unhandled error that bubbles to `GlobalExceptionFilter`). Register all custom handlers in `AuthzModule.forRoot({ handlers: [...] })`.

**Unknown policy name throws at evaluation time.** `@RequirePolicy('Foo')` where `'Foo'` was never registered causes an error. Register all policy names before they are referenced.

**`AuthzModule` is global by default.** `AuthorizationService` and `AuthorizationGuard` are injectable in any module in the application once `AuthzModule.forRoot` is imported in `AppModule`.

**The authz decorators do not add OpenAPI documentation.** Add `@ApiForbidden()` and `@ApiUnauthorized()` from `@xlr8-nest/core/openapi` yourself when you want 401/403 documented in Swagger. The authz module intentionally has no `@nestjs/swagger` dependency.

---

## See also

- [Response guide](./response.md) — `GlobalExceptionFilter`, `buildSuccessResponse`, domain error catalogs
- [Validator guide](./validator.md) — `@Validate` and `ZodValidationPipe` for request validation
- [Full API reference — /authz](../api-reference.md#5-authorization) — every exported type and token
