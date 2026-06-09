# Internals: Authorization (`lib/authz`)

How the authorization framework evaluates requirements, wires the DI container,
and exposes the extension surface.

---

## Table of Contents

- [File map](#file-map)
- [1. Requirement — the value object at the center](#1-requirement--the-value-object-at-the-center)
- [2. Decorators and metadata accumulation](#2-decorators-and-metadata-accumulation)
  - [`@Authorize(...requirements)`](#authorizeRequirements)
  - [Metadata merging in the guard](#metadata-merging-in-the-guard)
- [3. Guard evaluation pipeline](#3-guard-evaluation-pipeline)
- [4. Handler registry (`AuthorizationService`)](#4-handler-registry-authorizationservice)
- [5. Built-in handlers — implementation notes](#5-built-in-handlers--implementation-notes)
  - [`RolesHandler`](#roleshandler)
  - [`PermissionsHandler`](#permissionshandler)
  - [`PolicyHandler`](#policyhandler)
  - [`ResourceHandler`](#resourcehandler)
- [6. `PrincipalResolver` — how the default works](#6-principalresolver--how-the-default-works)
- [7. Module DI wiring (`AuthzModule.forRoot`)](#7-module-di-wiring-authzmoduleforroot)
- [8. `registerAsync` — asynchronous policy loading](#8-registerasync--asynchronous-policy-loading)
- [9. Adding the guard to specific routes only](#9-adding-the-guard-to-specific-routes-only)

---

## File map

```
lib/authz/
├── authz.module.ts                    # AuthzModule.forRoot() / registerAsync()
├── constants/
│   └── metadata.ts                    # Injection tokens + metadata key constants
├── guards/
│   └── authorization.guard.ts         # AuthorizationGuard (CanActivate)
├── services/
│   ├── authorization.service.ts       # AuthorizationService (imperative API)
│   └── policy-registry.ts             # PolicyRegistry + PolicyDefinition
├── handlers/
│   ├── requirement-handler.interface.ts  # RequirementHandler<T> interface
│   ├── roles.handler.ts               # Built-in: RolesHandler
│   ├── permissions.handler.ts         # Built-in: PermissionsHandler
│   ├── policy.handler.ts              # Built-in: PolicyHandler
│   └── resource.handler.ts            # Built-in: ResourceHandler
├── requirements/
│   ├── roles.requirement.ts           # RolesRequirement
│   ├── permissions.requirement.ts     # PermissionsRequirement
│   ├── policy.requirement.ts          # PolicyRequirement
│   └── resource.requirement.ts        # ResourceRequirement
├── decorators/
│   ├── authorize.decorator.ts         # @Authorize(...requirements) — primitive
│   ├── public.decorator.ts            # @Public() / @AllowAnonymous()
│   ├── require-roles.decorator.ts     # @RequireRoles()
│   ├── require-permissions.decorator.ts  # @RequirePermissions()
│   ├── require-policy.decorator.ts    # @RequirePolicy()
│   └── require-resource.decorator.ts  # @RequireResource() / @CheckOwnership()
├── resolver/
│   ├── principal-resolver.interface.ts  # PrincipalResolver interface
│   └── request-user.resolver.ts       # Default: reads request.user
├── types/
│   ├── authorization-context.type.ts  # AuthorizationContext
│   ├── decision.type.ts               # AuthorizationDecision
│   ├── principal.type.ts              # AuthorizationPrincipal
│   └── requirement.type.ts            # AuthorizationRequirement base
├── utils/
│   └── permission-match.util.ts       # Wildcard permission matching
└── errors/
    └── authz.errors.ts                # AuthzErrors catalog
```

---

## 1. Requirement — the value object at the center

Every authorization constraint is a `AuthorizationRequirement` value object:

```typescript
interface AuthorizationRequirement {
  readonly type: string;   // discriminant — matched to a handler
  // ... type-specific fields
}
```

The `type` field is the dispatch key. Built-in types:

| `type` constant | Requirement class | Handler class |
|---|---|---|
| `ROLES_REQUIREMENT` | `RolesRequirement` | `RolesHandler` |
| `PERMISSIONS_REQUIREMENT` | `PermissionsRequirement` | `PermissionsHandler` |
| `POLICY_REQUIREMENT` | `PolicyRequirement` | `PolicyHandler` |
| `RESOURCE_REQUIREMENT` | `ResourceRequirement<T>` | `ResourceHandler` |

Each requirement is constructed by a decorator and stored in Reflect metadata on the route handler.

---

## 2. Decorators and metadata accumulation

### `@Authorize(...requirements)`

The primitive decorator that all others delegate to:

```typescript
export const Authorize = (...requirements: AuthorizationRequirement[]): MethodDecorator & ClassDecorator => {
  return (target, key?, descriptor?) => {
    const existing: AuthorizationRequirement[] = Reflect.getMetadata(
      AUTHZ_REQUIREMENTS_METADATA, key ? descriptor!.value : target
    ) ?? [];
    Reflect.defineMetadata(
      AUTHZ_REQUIREMENTS_METADATA,
      [...existing, ...requirements],
      key ? descriptor!.value : target,
    );
  };
};
```

Requirements **accumulate** — calling `@RequireRoles('admin')` and `@RequirePermissions('user:read')`
on the same method stores both requirements on the handler. They are evaluated as AND (all must pass).

### `@RequireRoles('admin', 'staff')` example

```typescript
@RequireRoles('admin', 'staff')
// expands to:
@Authorize(new RolesRequirement(['admin', 'staff'], 'any'))
```

### Metadata merging in the guard

The guard reads metadata from both the method and the controller class:

```typescript
const requirements = this.reflector.getAllAndMerge<AuthorizationRequirement[]>(
  AUTHZ_REQUIREMENTS_METADATA,
  [context.getHandler(), context.getClass()],
);
```

`getAllAndMerge` concatenates arrays from both levels — method requirements plus class-level
requirements. All are evaluated in sequence (AND).

Class-level requirements act as defaults: `@RequireRoles('admin')` on a controller applies to
all methods unless overridden at the method level.

---

## 3. Guard evaluation pipeline

```
Request arrives at AuthorizationGuard.canActivate(context)
    │
    ├── 1. Check @Public() metadata
    │       reflector.getAllAndOverride(AUTHZ_PUBLIC_METADATA, [handler, class])
    │       if true → return true immediately (bypass all checks)
    │
    ├── 2. Collect requirements
    │       reflector.getAllAndMerge(AUTHZ_REQUIREMENTS_METADATA, [handler, class])
    │       if [] empty:
    │         if defaultDeny: true  → throw ForbiddenError(NoPolicy)
    │         else                  → return true (fail-open)
    │
    ├── 3. Resolve principal
    │       principalResolver.resolve(context)  → AuthorizationPrincipal | null
    │       if null → throw UnauthorizedError(Unauthenticated)
    │
    ├── 4. AuthorizationService.checkAll(requirements, { principal, request })
    │       for each requirement (short-circuit on first denial):
    │         handler = handlersByType.get(requirement.type)
    │         decision = handler.handle(requirement, context)
    │         if !decision.granted → return { granted: false, reason, failedRequirementType }
    │       return { granted: true }
    │
    └── 5. if !decision.granted → throw ForbiddenError(AccessDenied, reason)
            else                → return true
```

**`getAllAndOverride` vs `getAllAndMerge`:**
- `getAllAndOverride` is used for `@Public()` — the most specific (method) wins over the class.
  A `@Public()` on a method overrides `@RequireRoles` on the class.
- `getAllAndMerge` is used for requirements — all levels accumulate (AND semantics).

---

## 4. Handler registry (`AuthorizationService`)

The registry is built once at module startup inside the `AuthorizationService` constructor:

```typescript
constructor(handlers: RequirementHandler[]) {
  this.handlersByType = new Map();
  for (const handler of handlers) {
    if (this.handlersByType.has(handler.requirementType)) {
      throw new Error(`Duplicate handler for requirementType: "${handler.requirementType}"`);
    }
    this.handlersByType.set(handler.requirementType, handler);
  }
}
```

**Duplicate detection at startup:** registering two handlers for the same `requirementType`
throws immediately, before any request is served. Fail-fast.

**How are handlers injected?**
Via a multi-injection factory in `AuthzModule.forRoot()`:

```typescript
{
  provide: RequirementHandlerToken,
  useFactory: (...handlers: RequirementHandler[]) => handlers,
  inject: handlerClasses,   // [RolesHandler, PermissionsHandler, PolicyHandler, ResourceHandler, ...custom]
}
```

NestJS calls the factory with one handler instance per class in `inject`. The resulting array
is then injected into `AuthorizationService` as the `handlers` parameter.

---

## 5. Built-in handlers — implementation notes

### `RolesHandler`

```typescript
handle(requirement: RolesRequirement, context: AuthorizationContext): boolean {
  const owned = new Set(context.principal.roles);
  if (requirement.roles.length === 0) return true;
  return requirement.mode === 'all'
    ? requirement.roles.every(r => owned.has(r))
    : requirement.roles.some(r => owned.has(r));
}
```

Empty roles list → always grants. Mode `'any'` → at least one role must match. Mode `'all'`
→ every required role must match.

---

### `PermissionsHandler`

Uses `permissionMatches(required, owned[])`:

```typescript
function permissionMatches(required: string, ownedPermissions: string[]): boolean {
  for (const owned of ownedPermissions) {
    if (owned === required) return true;        // exact match
    if (owned.endsWith(':*')) {                  // wildcard: 'user:*' matches 'user:read'
      const prefix = owned.slice(0, -1);        // 'user:'
      if (required.startsWith(prefix) && required !== prefix.slice(0, -1)) {
        // 'user:read'.startsWith('user:') AND 'user:read' !== 'user'
        return true;
      }
    }
  }
  return false;
}
```

**The trailing-wildcard fix:** `billing:*` matches `billing:read` but NOT bare `billing`.
The condition `required !== prefix.slice(0, -1)` (i.e. `'billing:read' !== 'billing'`) prevents
an over-grant where a wildcard like `billing:*` incorrectly grants access to a resource named
exactly `billing` (no sub-resource).

---

### `PolicyHandler`

```typescript
handle(requirement: PolicyRequirement, context: AuthorizationContext): Promise<boolean | AuthorizationDecision> {
  const policy = this.policyRegistry.get(requirement.policyName);
  return policy.evaluate(context);
}
```

`PolicyHandler` depends on `PolicyRegistry`. `PolicyRegistry` in turn depends on
`AuthorizationService` (for policies that programmatically call `checkAll`). This creates a
potential circular dependency:

```
AuthorizationService → PolicyRegistry (via PolicyHandler)
PolicyRegistry → AuthorizationService (via evaluate callback)
```

**How is this resolved?**
`PolicyHandler` injects `AuthorizationService` via `ModuleRef.get(AuthorizationService, { strict: false })`
in a lazy getter, not in the constructor. The actual `AuthorizationService` instance is resolved
on the first `handle()` call, by which point all providers are fully initialized.

```typescript
// Simplified version of what PolicyHandler does:
private get authorizationService(): AuthorizationService {
  return this.moduleRef.get(AuthorizationService, { strict: false });
}
```

This is a deliberate circular-dependency escape hatch. The `{ strict: false }` flag allows
resolving providers from the global scope, not just the current module scope.

---

### `ResourceHandler`

```typescript
handle(requirement: ResourceRequirement<TResource>, context: AuthorizationContext) {
  const resource = requirement.load
    ? requirement.load(context)      // load if loader provided
    : context.resource as TResource; // else read from context

  return requirement.evaluate(context.principal, resource);
}
```

The `load` function is optional. If provided it receives the full `AuthorizationContext` (which
includes `request`) and can extract the resource from the request (e.g. `context.request.params.id`
→ load from DB). If omitted, `context.resource` must be pre-populated by the caller.

---

## 6. `PrincipalResolver` — how the default works

`RequestUserResolver` reads `request.user`:

```typescript
resolve(context: ExecutionContext): AuthorizationPrincipal | null {
  const request = context.switchToHttp().getRequest<Record<string, unknown>>();
  const user = request['user'];
  if (!user || typeof user !== 'object') return null;

  return {
    id: String((user as UserIdentity).id ?? ''),
    roles: normalizeStringArray((user as UserIdentity).roles),
    permissions: normalizeStringArray((user as UserIdentity).permissions),
    raw: user,
  };
}
```

`normalizeStringArray` handles the legacy case where `roles` is a single string:
```typescript
const normalizeStringArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return [v];   // legacy single-string shape
  return [];
};
```

`raw: user` preserves the entire original user object in case a custom handler needs fields
that are not on `AuthorizationPrincipal` (e.g. `tenantId`).

---

## 7. Module DI wiring (`AuthzModule.forRoot`)

```typescript
const providers = [
  resolverClass,                                         // e.g. RequestUserResolver
  { provide: PrincipalResolverToken, useExisting: resolverClass },
  { provide: PoliciesToken, useValue: options.policies ?? [] },
  { provide: AuthzGuardOptionsToken, useValue: { defaultDeny } },
  PolicyRegistry,
  ...handlerClasses,                                     // RolesHandler, PermissionsHandler, ...
  {
    provide: RequirementHandlerToken,
    useFactory: (...handlers) => handlers,
    inject: handlerClasses,                              // multi-inject pattern
  },
  AuthorizationService,
  AuthorizationGuard,
  ...(registerGlobalGuard ? [{ provide: APP_GUARD, useExisting: AuthorizationGuard }] : []),
];
```

**Key patterns used:**

| Pattern | Purpose |
|---|---|
| `useExisting` for resolver token | Avoids creating a second instance of the resolver |
| `useValue` for guard options | Injected as a plain object; no class instantiation needed |
| `useFactory` with `inject: handlerClasses` | Collects all handler instances into an array in a single DI call |
| `APP_GUARD` token | NestJS recognizes this; registers the guard globally for ALL routes |
| `global: true` (default) | Every module in the app can use authz tokens without importing `AuthzModule` |

---

## 8. `registerAsync` — asynchronous policy loading

Used when policies depend on a config service or database:

```typescript
AuthzModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    return config.get('policies');
  },
  registerGlobalGuard: true,
})
```

The `useFactory` provides the `PoliciesToken` asynchronously. Everything else (resolver, handlers,
guard options) is still synchronous. If you need an async resolver, you must implement a custom
`PrincipalResolver` that does the async work internally (e.g. database lookup on each request).

---

## 9. Adding the guard to specific routes only

By default `registerGlobalGuard: false`. This means `AuthorizationGuard` is registered as a
provider but not applied. Apply it selectively:

```typescript
// Option A: apply to a specific controller
@UseGuards(AuthorizationGuard)
@Controller('admin')
export class AdminController { ... }

// Option B: apply globally via the module
AuthzModule.forRoot({ registerGlobalGuard: true })

// Option C: inject and use imperatively
constructor(private readonly authz: AuthorizationService) {}
await this.authz.authorize(principal, [new RolesRequirement(['admin'])]);
```
