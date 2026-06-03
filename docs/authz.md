# Authorization (`@xlr8-nest/core/authz`)

A declarative, extensible authorization framework for NestJS. One guard, one
service, and a small set of decorators cover **four authorization models** —
and any future model plugs in without touching the framework.

> **Authentication vs. Authorization.** This module does **authorization**
> (*is this known user allowed to do this?*). It does **not** authenticate
> (*who is this user?*). Keep your existing JWT/passport guard; this framework
> reads the already-authenticated user via a pluggable resolver.

---

## Table of contents

1. [Mental model](#1-mental-model)
2. [How a request flows](#2-how-a-request-flows)
3. [Setup](#3-setup)
4. [The four authorization models](#4-the-four-authorization-models)
   - [RBAC — roles](#41-rbac--roles)
   - [Permission-based](#42-permission-based)
   - [Policy-based](#43-policy-based)
   - [Resource / property-based](#44-resource--property-based)
5. [Combining requirements](#5-combining-requirements)
6. [Imperative checks (in services / handlers)](#6-imperative-checks-in-services--handlers)
7. [The principal & the resolver](#7-the-principal--the-resolver)
8. [Extending: add your own strategy](#8-extending-add-your-own-strategy)
9. [Global guard vs. per-route guard](#9-global-guard-vs-per-route-guard)
10. [Full API reference](#10-full-api-reference)
11. [Rules & gotchas](#11-rules--gotchas)
12. [Decision guide: which model do I use?](#12-decision-guide-which-model-do-i-use)

---

## 1. Mental model

Everything reduces to three concepts:

| Concept | What it is | Example |
| --- | --- | --- |
| **Requirement** | A declarative demand attached to a route (a plain object with a `type`). | "must have role `admin`" |
| **Handler** | A strategy that knows how to evaluate one requirement `type`. | `RolesHandler` evaluates `type: 'roles'` |
| **Principal** | The normalized authenticated subject the decision is about. | `{ id, roles, permissions, attributes }` |

A **decorator** attaches requirements to a route. The **guard** collects them,
resolves the principal, and asks the matching **handler** to decide. The
**service** holds the shared evaluation logic so you can also run the exact same
checks imperatively inside business code.

```
@RequireRoles('admin')   ──attaches──▶  RolesRequirement{ type:'roles', roles:['admin'] }
                                              │
AuthorizationGuard ──resolves principal──▶ PrincipalResolver
                   ──dispatches by type──▶ RolesHandler.handle(req, ctx) ──▶ granted? yes/no
```

**Why this shape?** RBAC, permissions, policies, and resource checks are just
different requirement *types* with different *handlers*. Adding a brand-new
model (ABAC, time-window, tenant-scoped, IP allow-list, ...) means writing one
requirement + one handler and registering it — the guard, decorators, service,
and module never change. This is the core extensibility guarantee.

---

## 2. How a request flows

```
HTTP request
   │
   ▼
AuthorizationGuard.canActivate(context)
   │
   ├─ 1. @Public()?  ───────────────▶ yes ─▶ ALLOW (skip everything)
   │
   ├─ 2. collect requirements from  method + class metadata (merged)
   │      no requirements? ─────────▶ ALLOW  (or 403 if defaultDeny:true)
   │
   ├─ 3. PrincipalResolver.resolve(context)
   │      null? ────────────────────▶ throw UnauthorizedError (401)
   │
   ├─ 4. AuthorizationService.checkAll(requirements, { principal, request })
   │      for each requirement (logical AND, short-circuits on first denial):
   │         find handler by requirement.type → handler.handle(req, ctx)
   │
   └─ 5. all granted? ──▶ ALLOW   |   any denied? ──▶ throw ForbiddenError (403)
```

Key behaviors:

- **No requirements on a route ⇒ allowed** (default). With `defaultDeny: true`,
  no requirements ⇒ `403`. Use `@Public()` to explicitly opt out of that guard.
- **No principal but requirements exist ⇒ `401 UnauthorizedError`.**
- **A requirement is not satisfied ⇒ `403 ForbiddenError`.**
- **Multiple requirements ⇒ logical AND**, evaluated in order, short-circuiting
  on the first denial.

---

## 3. Setup

```typescript
import { Module } from '@nestjs/common';
import { AuthzModule } from '@xlr8-nest/core/authz';

@Module({
  imports: [
    AuthzModule.forRoot({
      // optional — all fields have sensible defaults
      registerGlobalGuard: true, // apply AuthorizationGuard to every route
    }),
  ],
})
export class AppModule {}
```

`AuthzModule` is **global by default**, so `AuthorizationService` and
`AuthorizationGuard` are injectable anywhere once imported in the root module.

The default principal resolver reads `request.user` (populated by your auth
guard). If you want the guard everywhere, set `registerGlobalGuard: true` and
mark open routes with `@Public()`. Otherwise, apply it per-controller with
`@UseGuards(AuthorizationGuard)`.

> **Prerequisite:** something must populate `request.user` before this guard
> runs — typically your JWT auth guard. Authorization decorators assume an
> authenticated principal is resolvable.

---

## 4. The four authorization models

### 4.1 RBAC — roles

Grant by role membership.

```typescript
import { RequireRoles } from '@xlr8-nest/core/authz';

@Controller('admin')
export class AdminController {
  @Get('dashboard')
  @RequireRoles('admin')                       // must have 'admin'
  dashboard() {}

  @Post('reports')
  @RequireRoles('admin', 'manager')            // 'admin' OR 'manager' (mode: 'any', default)
  createReport() {}

  @Delete('purge')
  @RequireRoles('admin', 'owner', { mode: 'all' }) // must have BOTH
  purge() {}
}
```

- `mode: 'any'` (default) — grant if the principal has **at least one** role.
- `mode: 'all'` — grant only if the principal has **every** listed role.

### 4.2 Permission-based

Grant by fine-grained permission strings. Supports **wildcards** with `:`
segments.

```typescript
import { RequirePermissions } from '@xlr8-nest/core/authz';

@Controller('users')
export class UserController {
  @Post()
  @RequirePermissions('user:write')                       // single permission
  create() {}

  @Patch(':id')
  @RequirePermissions('user:read', 'user:write')          // ALL (mode: 'all', default)
  update() {}

  @Get('reports')
  @RequirePermissions('reports:view', 'reports:export', { mode: 'any' }) // ANY
  reports() {}
}
```

**Wildcard matching** (`permissionMatches`) — the *granted* permission may
contain wildcards; the *required* permission is concrete:

| Granted (on principal) | Required (on route) | Matches? |
| --- | --- | --- |
| `user:read` | `user:read` | ✅ exact |
| `*` | `anything:here` | ✅ global wildcard |
| `user:*` | `user:read` | ✅ trailing wildcard |
| `user:*` | `user:profile:write` | ✅ trailing wildcard (multi-segment) |
| `user:*:read` | `user:any:read` | ✅ interior wildcard (one segment) |
| `user:read` | `billing:read` | ❌ different root |

- `mode: 'all'` (default) — every required permission must match some granted one.
- `mode: 'any'` — at least one required permission must match.

### 4.3 Policy-based

Name a reusable authorization rule once, reference it by name. A **policy** is a
set of requirements (logical AND), a custom predicate, or both.

**Register policies** at module setup:

```typescript
import { AuthzModule, RolesRequirement, PermissionsRequirement } from '@xlr8-nest/core/authz';

AuthzModule.forRoot({
  policies: [
    // Composition of requirements
    {
      name: 'CanManageBilling',
      requirements: [
        new RolesRequirement(['admin', 'billing-manager']),       // any of
        new PermissionsRequirement(['billing:write']),
      ],
    },
    // Custom predicate — full access to principal, request, resource
    {
      name: 'IsBusinessHours',
      evaluate: () => {
        const hour = new Date().getUTCHours();
        return hour >= 8 && hour < 18;
      },
    },
    // Both: requirements run first (AND), then the predicate
    {
      name: 'CanCloseTicket',
      requirements: [new PermissionsRequirement(['ticket:close'])],
      evaluate: (ctx) => (ctx.principal.attributes?.department === 'support'),
    },
  ],
});
```

**Use** them declaratively:

```typescript
import { RequirePolicy } from '@xlr8-nest/core/authz';

@Post('invoices/:id/charge')
@RequirePolicy('CanManageBilling')                 // single policy
charge() {}

@Post('tickets/:id/close')
@RequirePolicy('CanCloseTicket', 'IsBusinessHours') // multiple — AND
close() {}
```

A policy's `evaluate` predicate receives the full `AuthorizationContext`
(`principal`, `request`, `resource`) and returns `boolean` or an
`AuthorizationDecision`.

### 4.4 Resource / property-based

Decide based on the **target resource** (e.g. ownership) or its **properties**.

**Ownership sugar** — `@CheckOwnership`:

```typescript
import { CheckOwnership } from '@xlr8-nest/core/authz';

@Patch('articles/:id')
@CheckOwnership({
  ownerField: 'authorId',          // resource[ownerField] === principal.id  (default: 'ownerId')
  bypassRoles: ['admin'],          // these roles skip the ownership check
  load: async (ctx) => articleRepo.findById((ctx.request as Request).params.id),
})
update() {}
```

**Generic resource rule** — `@RequireResource(evaluate, load?)`:

```typescript
import { RequireResource } from '@xlr8-nest/core/authz';

@Get('documents/:id')
@RequireResource<Document>(
  // evaluate(principal, resource, context) → boolean | AuthorizationDecision
  (principal, doc) =>
    doc.ownerId === principal.id ||
    doc.sharedWith.includes(principal.id) ||
    principal.roles.includes('admin'),
  // load(context) → resource  (optional if the resource is pre-attached to ctx)
  (ctx) => documentRepo.findById((ctx.request as Request).params.id),
)
read() {}
```

- If `load` is provided, the handler calls it and passes the result to
  `evaluate`. If omitted, the handler uses `context.resource` (attach it
  upstream, e.g. in an interceptor).
- **Property-based** checks are just field inspections inside `evaluate`
  (`doc.visibility === 'public'`, `resource.status !== 'locked'`, ...).

---

## 5. Combining requirements

Stacking decorators (or listing class-level + method-level ones) combines them
with **logical AND**. Order is class requirements first, then method, evaluated
top-to-bottom, short-circuiting on the first failure.

```typescript
@Controller('billing')
@RequireRoles('employee')               // class-level: applies to every route
export class BillingController {
  @Post('refunds')
  @RequirePermissions('billing:refund') // method-level: AND with the class role
  @RequirePolicy('IsBusinessHours')     // AND again
  refund() {}                           // needs: role 'employee' AND perm 'billing:refund' AND business hours
}
```

For a **single explicit OR across mixed requirement types**, wrap them in a
policy with a custom `evaluate`, or use the generic `@Authorize(...)` with a
custom requirement (see [extending](#8-extending-add-your-own-strategy)).

The low-level `@Authorize(...requirements)` decorator attaches any requirement
objects directly — every `@Require*` decorator is sugar over it:

```typescript
import { Authorize, RolesRequirement, PermissionsRequirement } from '@xlr8-nest/core/authz';

@Authorize(
  new RolesRequirement(['admin']),
  new PermissionsRequirement(['user:write']),
)
@Post()
create() {}
```

---

## 6. Imperative checks (in services / handlers)

Authorization often belongs *inside* business logic (command handlers, domain
services), not only at the controller edge. `AuthorizationService` runs the
exact same requirement/handler evaluation as the guard.

```typescript
import { Injectable } from '@nestjs/common';
import {
  AuthorizationService,
  RolesRequirement,
  ResourceRequirement,
  type AuthorizationPrincipal,
} from '@xlr8-nest/core/authz';

@Injectable()
export class ArticleService {
  constructor(private readonly authz: AuthorizationService) {}

  async publish(principal: AuthorizationPrincipal, article: Article) {
    // Throws ForbiddenError if not satisfied
    await this.authz.authorize(
      principal,
      [
        new RolesRequirement(['editor', 'admin']),                  // any of
        new ResourceRequirement<Article>(
          (p, a) => a.authorId === p.id || p.roles.includes('admin'),
        ),
      ],
      { resource: article }, // pre-attach the resource (no loader needed)
    );

    article.status = 'published';
    // ...
  }

  async canArchive(principal: AuthorizationPrincipal): Promise<boolean> {
    // Boolean variant — no throw
    return this.authz.can(principal, [new RolesRequirement(['admin'])]);
  }
}
```

Three entry points:

| Method | Returns | Use when |
| --- | --- | --- |
| `authorize(principal, reqs, ctx?)` | `Promise<void>` (throws `ForbiddenError`) | enforce-or-fail |
| `can(principal, reqs, ctx?)` | `Promise<boolean>` | branch on the result |
| `checkAll(reqs, ctx)` / `check(req, ctx)` | `Promise<AuthorizationDecision>` | need the reason / build your own flow |

The third argument is an `AuthorizationContext` minus `principal` —
`{ request?, resource? }`. Attach the resource for resource-based requirements.

---

## 7. The principal & the resolver

The **principal** is the normalized subject every decision is made about:

```typescript
interface AuthorizationPrincipal {
  id: string;
  roles: string[];
  permissions: string[];
  attributes?: Record<string, unknown>; // anything extra (tenantId, plan, dept…)
  raw?: unknown;                         // the original identity object
}
```

A **`PrincipalResolver`** turns the request into a principal:

```typescript
interface PrincipalResolver {
  resolve(context: ExecutionContext):
    | Promise<AuthorizationPrincipal | null>
    | AuthorizationPrincipal | null;
}
```

The default **`RequestUserResolver`** reads `request.user` and normalizes it. It
tolerates both `roles: string` (legacy `UserIdentity`) and `roles: string[]`,
and places the original user object only in `raw` (not copied into `attributes`
— use a custom resolver to populate `attributes` with specific fields). Returning
`null` ⇒ the guard throws `401`.

**Custom resolver** — source roles/permissions from a DB lookup, a cache, or a
remote service instead of trusting the token:

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthzModule, type PrincipalResolver, type AuthorizationPrincipal } from '@xlr8-nest/core/authz';

@Injectable()
export class DbPrincipalResolver implements PrincipalResolver {
  constructor(private readonly membership: MembershipService) {}

  async resolve(context: ExecutionContext): Promise<AuthorizationPrincipal | null> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    if (!userId) return null;

    const { roles, permissions, tenantId } = await this.membership.loadFor(userId);
    return { id: userId, roles, permissions, attributes: { tenantId }, raw: req.user };
  }
}

// register it
AuthzModule.forRoot({ resolver: DbPrincipalResolver });
```

> This is where future **scoped (multi-tenant) authorization** plugs in: resolve
> roles/permissions for the active tenant/scope, and the rest of the framework
> works unchanged.

---

## 8. Extending: add your own strategy

The whole point of the design: a new authorization model = **one requirement +
one handler + register it**. No framework files change.

**Example — a time-window strategy:**

```typescript
import { Injectable } from '@nestjs/common';
import {
  Authorize,
  AuthzModule,
  type AuthorizationRequirement,
  type AuthorizationContext,
  type RequirementHandler,
} from '@xlr8-nest/core/authz';

// 1. Define the requirement (unique `type`)
export class TimeWindowRequirement implements AuthorizationRequirement<'time-window'> {
  readonly type = 'time-window';
  constructor(public readonly startHourUtc: number, public readonly endHourUtc: number) {}
}

// 2. Implement the handler (matches by `requirementType`)
@Injectable()
export class TimeWindowHandler implements RequirementHandler<TimeWindowRequirement> {
  readonly requirementType = 'time-window';

  handle(req: TimeWindowRequirement, _ctx: AuthorizationContext): boolean {
    const hour = new Date().getUTCHours();
    return hour >= req.startHourUtc && hour < req.endHourUtc;
  }
}

// 3. Register the handler
AuthzModule.forRoot({ handlers: [TimeWindowHandler] });

// 4. (optional) a friendly decorator
export const DuringBusinessHours = () =>
  Authorize(new TimeWindowRequirement(8, 18));

// 5. Use it — composes with everything else
@Post('payouts')
@RequireRoles('finance')
@DuringBusinessHours()
runPayouts() {}
```

A handler may return `boolean` or an `AuthorizationDecision` (`{ granted,
reason?, failedRequirementType? }`) to attach a diagnostic reason. Handlers can
inject any provider (repositories, config, other services) via the constructor.

---

## 9. Global guard vs. per-route guard

**Global** — gate the whole app, opt out per route:

```typescript
AuthzModule.forRoot({ registerGlobalGuard: true });

@Get('health')
@Public()                  // bypass the guard entirely
health() {}

@Get('me')
@RequireRoles('user')      // gated
me() {}

@Get('public-list')
list() {}                  // NO requirements ⇒ allowed (guard only enforces declared requirements)
```

**Per-controller / per-route** — opt in explicitly:

```typescript
import { UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '@xlr8-nest/core/authz';

@UseGuards(AuthorizationGuard)
@Controller('admin')
export class AdminController {
  @Get() @RequireRoles('admin') index() {}
}
```

> Even with the global guard, routes **without** any `@Require*`/`@Authorize`
> decorator are allowed — this guard governs *authorization*, not
> *authentication*. Gate unauthenticated access with your auth guard.

---

## 10. Full API reference

All exports come from `@xlr8-nest/core/authz`.

### Module

| Export | Signature | Notes |
| --- | --- | --- |
| `AuthzModule.forRoot(options?)` | `(AuthzModuleOptions) => DynamicModule` | wires resolver, handlers, policies, service, guard |
| `AuthzModule.registerAsync(options)` | `(AuthzModuleAsyncOptions) => DynamicModule` | async `policies` via `useFactory`/`inject` |

`AuthzModuleOptions`:

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `resolver` | `Type<PrincipalResolver>` | `RequestUserResolver` | how the principal is resolved |
| `handlers` | `Type<RequirementHandler>[]` | `[]` | extra custom handlers (built-ins always added) |
| `policies` | `PolicyDefinition[]` | `[]` | named policies |
| `registerGlobalGuard` | `boolean` | `false` | register `AuthorizationGuard` as `APP_GUARD` |
| `defaultDeny` | `boolean` | `false` | when `true`, routes with no requirements throw `403` instead of being allowed |
| `global` | `boolean` | `true` | make the module global |

`AuthzModuleAsyncOptions` adds `imports`, `useFactory: (...args) => PolicyDefinition[] | Promise<…>`, and `inject`; keeps `resolver`, `handlers`, `registerGlobalGuard`, `global`.

### Decorators

| Decorator | Signature | Produces |
| --- | --- | --- |
| `@RequireRoles(...roles, options?)` | `(...string[], { mode?: 'any'\|'all' }?)` | `RolesRequirement` |
| `@RequirePermissions(...perms, options?)` | `(...string[], { mode?: 'any'\|'all' }?)` | `PermissionsRequirement` |
| `@RequirePolicy(...names)` | `(...string[])` | one `PolicyRequirement` per name |
| `@RequireResource(evaluate, load?)` | see [4.4](#44-resource--property-based) | `ResourceRequirement` |
| `@CheckOwnership(options?)` | `({ ownerField?, bypassRoles?, load? })` | `ResourceRequirement` |
| `@Authorize(...requirements)` | `(...AuthorizationRequirement[])` | attaches raw requirements (merges) |
| `@Public()` / `@AllowAnonymous()` | `()` | marks route to bypass the guard |

All decorators work at **method and class** level and **merge** when stacked.

### Requirements (classes)

| Class | Constructor | `type` |
| --- | --- | --- |
| `RolesRequirement` | `(roles: string[], mode?: 'any'\|'all' = 'any')` | `'roles'` |
| `PermissionsRequirement` | `(permissions: string[], mode?: 'any'\|'all' = 'all')` | `'permissions'` |
| `PolicyRequirement` | `(policy: string)` | `'policy'` |
| `ResourceRequirement<T>` | `(evaluate: ResourceEvaluator<T>, load?: ResourceLoader<T>)` | `'resource'` |

### Handlers

| Class | Handles `type` | Notes |
| --- | --- | --- |
| `RolesHandler` | `'roles'` | matches against `principal.roles` |
| `PermissionsHandler` | `'permissions'` | wildcard-aware (`permissionMatches`) |
| `PolicyHandler` | `'policy'` | looks up `PolicyRegistry`; resolves `AuthorizationService` lazily |
| `ResourceHandler` | `'resource'` | loads resource (if `load`), runs `evaluate` |

### Services

| Class / method | Signature | Returns |
| --- | --- | --- |
| `AuthorizationService.check(req, ctx)` | `(AuthorizationRequirement, AuthorizationContext)` | `Promise<AuthorizationDecision>` |
| `AuthorizationService.checkAll(reqs, ctx)` | `(AuthorizationRequirement[], AuthorizationContext)` | `Promise<AuthorizationDecision>` (AND) |
| `AuthorizationService.can(principal, reqs, ctx?)` | — | `Promise<boolean>` |
| `AuthorizationService.authorize(principal, reqs, ctx?)` | — | `Promise<void>` (throws `ForbiddenError`) |
| `PolicyRegistry.register(def)` / `.get(name)` / `.has(name)` | — | manage named policies |

### Resolver

| Export | Notes |
| --- | --- |
| `PrincipalResolver` (interface) | `resolve(ExecutionContext) => AuthorizationPrincipal \| null \| Promise<…>` |
| `RequestUserResolver` | default; reads & normalizes `request.user` |

### Guard

| Export | Notes |
| --- | --- |
| `AuthorizationGuard` | the single `CanActivate`; inject it with `@UseGuards()` or register globally |

### Types

`AuthorizationPrincipal`, `AuthorizationRequirement<TType>`,
`AuthorizationContext`, `AuthorizationDecision`, `RequirementHandler<T>`,
`PolicyDefinition`, `PolicyEvaluator`, `ResourceLoader<T>`,
`ResourceEvaluator<T>`, `RolesMatchMode`, `PermissionsMatchMode`.

### Utilities

| Function | Signature | Purpose |
| --- | --- | --- |
| `permissionMatches(granted, required)` | `(string, string) => boolean` | single wildcard-aware match |
| `hasPermission(granted[], required)` | `(string[], string) => boolean` | any granted matches required |
| `hasAllPermissions(granted[], required[])` | `(string[], string[]) => boolean` | every required matched |
| `hasAnyPermission(granted[], required[])` | `(string[], string[]) => boolean` | any required matched |

### Tokens & metadata keys

| Symbol / key | Purpose |
| --- | --- |
| `PrincipalResolverToken` | DI token for the resolver |
| `RequirementHandlerToken` | DI token holding the aggregated handler array |
| `PoliciesToken` | DI token holding registered `PolicyDefinition[]` |
| `AuthzGuardOptionsToken` | DI token for `AuthzGuardOptions` (`defaultDeny` etc.) |
| `AUTHZ_REQUIREMENTS_METADATA` | reflect key for requirements on a route/class |
| `AUTHZ_PUBLIC_METADATA` | reflect key for `@Public()` |

---

## 11. Rules & gotchas

- **This guard does not authenticate.** By default, a route with no authorization
  requirements is allowed through. Set `defaultDeny: true` in `AuthzModule.forRoot`
  for fail-closed behaviour — every unannotated route then throws `403` until you
  add `@Public()` or a requirement. Pair with your JWT/auth guard and ensure auth
  runs first.
- **`UserIdentity.roles` is now `string[]`** (was `string`). The default
  resolver still accepts a single string and normalizes it, but update your
  identity shape going forward.
- **Multiple requirements are AND.** For OR across different types, use a policy
  with a custom `evaluate`, or a custom requirement/handler.
- **`@RequirePermissions` defaults to `mode: 'all'`; `@RequireRoles` defaults to
  `mode: 'any'`.** This matches the common intent (any sufficient role; all
  required permissions). Override with the `{ mode }` option.
- **Resource requirements need the resource.** Provide a `load` function, or
  pre-attach `context.resource` (imperative path / interceptor). Without either,
  `resource` is `undefined` and your evaluator must handle that.
- **Unknown requirement type throws.** If a requirement's `type` has no
  registered handler, evaluation throws a descriptive `Error` — register the
  handler via `AuthzModule.forRoot({ handlers })`.
- **Unknown policy throws.** `@RequirePolicy('X')` where `X` isn't registered
  throws at evaluation time.
- **Wildcards apply to the *granted* permission**, not the required one. Put `*`
  in what the principal holds (`user:*`), check against a concrete permission
  (`user:read`).
- **The authz decorators do not add OpenAPI docs.** Add `@ApiForbidden()` /
  `@ApiUnauthorized()` from `@xlr8-nest/core/openapi` yourself when you want the
  403/401 documented. (Kept decoupled so authz has no `@nestjs/swagger`
  dependency.)

---

## 12. Decision guide: which model do I use?

| Situation | Use |
| --- | --- |
| Coarse access by job function (`admin`, `manager`) | **RBAC** — `@RequireRoles` |
| Fine-grained actions (`invoice:export`, `user:write`) | **Permissions** — `@RequirePermissions` |
| The same non-trivial rule reused across many routes | **Policy** — `@RequirePolicy` + register it |
| Rule depends on the specific record (ownership, sharing, status) | **Resource** — `@CheckOwnership` / `@RequireResource` |
| Rule depends on a field of the record | **Resource** — inspect fields inside `evaluate` |
| A brand-new dimension (time, IP, tenant scope, risk score) | **Custom** — requirement + handler ([§8](#8-extending-add-your-own-strategy)) |
| The check belongs inside business logic, not the controller | **Imperative** — `AuthorizationService` ([§6](#6-imperative-checks-in-services--handlers)) |

> Tip: start with roles, reach for permissions when roles get too coarse, wrap
> recurring combinations in a policy, and drop to resource/custom only when the
> decision needs the record or a new dimension.
