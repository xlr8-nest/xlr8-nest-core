# Extending: Custom `PrincipalResolver`

Replace the default `request.user`-based resolver with any custom identity extraction strategy —
JWT claims parsing, API key lookup, service account detection, or multi-tenant identity mapping.

---

## Table of Contents

- [The interface](#the-interface)
- [Default resolver recap](#default-resolver-recap)
- [Example: JWT claims resolver (without Passport)](#example-jwt-claims-resolver-without-passport)
- [Example: API key resolver](#example-api-key-resolver)
- [Example: composite resolver (JWT + API key)](#example-composite-resolver-jwt--api-key)
- [Putting extra data on the principal for custom handlers](#putting-extra-data-on-the-principal-for-custom-handlers)
- [Testing a resolver](#testing-a-resolver)

---

## The interface

```typescript
interface PrincipalResolver {
  resolve(context: ExecutionContext): Promise<AuthorizationPrincipal | null> | AuthorizationPrincipal | null;
}
```

Return `null` when the request is unauthenticated — the guard throws `UnauthorizedError`.
Return an `AuthorizationPrincipal` when the identity is resolved.

```typescript
interface AuthorizationPrincipal {
  id: string;
  roles: string[];
  permissions: string[];
  attributes?: Record<string, unknown>;
  raw?: unknown;    // the original user/token object
}
```

---

## Default resolver recap

`RequestUserResolver` reads `request.user`, normalizes `roles` (handles both `string` and
`string[]`), and places the raw user object in `raw`. If `request.user` is absent or not
an object, it returns `null`.

---

## Example: JWT claims resolver (without Passport)

When you decode a JWT directly (no Passport), the claims may live at `request.jwtPayload`
or be decoded in middleware:

```typescript
// src/auth/jwt-claims.resolver.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import type { PrincipalResolver, AuthorizationPrincipal } from '@xlr8-nest/core/authz';
import { JwtService } from '@nestjs/jwt';

interface JwtClaims {
  sub: string;
  roles?: string[];
  permissions?: string[];
  tenantId?: string;
}

@Injectable()
export class JwtClaimsResolver implements PrincipalResolver {
  constructor(private readonly jwt: JwtService) {}

  async resolve(context: ExecutionContext): Promise<AuthorizationPrincipal | null> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const authHeader = request['headers']?.['authorization'] as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    let claims: JwtClaims;
    try {
      claims = await this.jwt.verifyAsync<JwtClaims>(token);
    } catch {
      return null;   // invalid or expired token → unauthenticated
    }

    return {
      id: claims.sub,
      roles: claims.roles ?? [],
      permissions: claims.permissions ?? [],
      attributes: { tenantId: claims.tenantId },
      raw: claims,
    };
  }
}
```

Register:

```typescript
AuthzModule.forRoot({
  resolver: JwtClaimsResolver,
  registerGlobalGuard: true,
})
```

---

## Example: API key resolver

For machine-to-machine calls that use an API key header:

```typescript
// src/auth/api-key.resolver.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import type { PrincipalResolver, AuthorizationPrincipal } from '@xlr8-nest/core/authz';
import { ApiKeyRepository } from './api-key.repository';

@Injectable()
export class ApiKeyResolver implements PrincipalResolver {
  constructor(private readonly apiKeys: ApiKeyRepository) {}

  async resolve(context: ExecutionContext): Promise<AuthorizationPrincipal | null> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const key = (request['headers']?.['x-api-key'] as string | undefined)?.trim();
    if (!key) return null;

    const record = await this.apiKeys.findByKey(key);
    if (!record || !record.active) return null;

    return {
      id: record.serviceId,
      roles: record.roles,
      permissions: record.permissions,
      raw: record,
    };
  }
}
```

---

## Example: composite resolver (JWT + API key)

Try JWT first, fall back to API key:

```typescript
@Injectable()
export class CompositeResolver implements PrincipalResolver {
  constructor(
    private readonly jwtResolver: JwtClaimsResolver,
    private readonly apiKeyResolver: ApiKeyResolver,
  ) {}

  async resolve(context: ExecutionContext): Promise<AuthorizationPrincipal | null> {
    return (
      (await this.jwtResolver.resolve(context)) ??
      (await this.apiKeyResolver.resolve(context))
    );
  }
}
```

Register `CompositeResolver` (and its dependencies) in the module that provides it, then
pass `CompositeResolver` to `AuthzModule`:

```typescript
AuthzModule.forRoot({
  resolver: CompositeResolver,
  registerGlobalGuard: true,
})
```

NestJS will inject `JwtClaimsResolver` and `ApiKeyResolver` into `CompositeResolver` as long as
they are provided in the same module or in a globally-scoped module.

---

## Putting extra data on the principal for custom handlers

The `raw` and `attributes` fields are the place to carry context that custom `RequirementHandler`
implementations need:

```typescript
// In your resolver:
return {
  id: claims.sub,
  roles: claims.roles ?? [],
  permissions: claims.permissions ?? [],
  attributes: {
    tenantId: claims.tenantId,
    orgId: claims.orgId,
    plan: claims.plan,
  },
  raw: claims,
};

// In a custom handler:
handle(req: MyRequirement, ctx: AuthorizationContext): boolean {
  const tenantId = ctx.principal.attributes?.['tenantId'] as string;
  return tenantId === req.expectedTenantId;
}
```

Using `attributes` keeps domain-specific fields out of the core `AuthorizationPrincipal` shape
while still making them accessible to handlers.

---

## Testing a resolver

```typescript
import { JwtClaimsResolver } from './jwt-claims.resolver';
import { ExecutionContext } from '@nestjs/common';

describe('JwtClaimsResolver', () => {
  const jwtService = { verifyAsync: jest.fn() };
  const resolver = new JwtClaimsResolver(jwtService as any);

  const makeContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as unknown as ExecutionContext);

  it('returns null when no Authorization header', async () => {
    const result = await resolver.resolve(makeContext({}));
    expect(result).toBeNull();
  });

  it('returns a principal on valid JWT', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      roles: ['admin'],
      permissions: ['user:read'],
    });
    const result = await resolver.resolve(
      makeContext({ authorization: 'Bearer valid.jwt.token' }),
    );
    expect(result?.id).toBe('user-1');
    expect(result?.roles).toEqual(['admin']);
  });

  it('returns null on invalid JWT', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
    const result = await resolver.resolve(
      makeContext({ authorization: 'Bearer bad.token' }),
    );
    expect(result).toBeNull();
  });
});
```
