# Extending: Custom `RequirementHandler`

The authorization framework's headline extension point. Add a new authorization strategy —
ABAC, time-window, tenant-isolation, IP allow-list, rate-limit check, or anything else —
by implementing one interface and registering it.

---

## Table of Contents

- [The interface](#the-interface)
- [Step-by-step: time-window authorization](#step-by-step-time-window-authorization)
  - [1. Define the requirement](#1-define-the-requirement)
  - [2. Implement the handler](#2-implement-the-handler)
  - [3. Create a convenience decorator](#3-create-a-convenience-decorator)
  - [4. Register in `AuthzModule`](#4-register-in-authzmodule)
  - [5. Use the decorator](#5-use-the-decorator)
- [Step-by-step: tenant-isolation handler](#step-by-step-tenant-isolation-handler)
  - [1. Requirement](#1-requirement)
  - [2. Handler — reading tenant from `principal.raw`](#2-handler--reading-tenant-from-principalraw)
  - [3. Decorator](#3-decorator)
  - [4. Usage](#4-usage)
- [`AuthorizationDecision` — when to use reason vs. boolean](#authorizationdecision--when-to-use-reason-vs-boolean)
- [Testing your handler](#testing-your-handler)

---

## The interface

```typescript
interface RequirementHandler<TRequirement extends AuthorizationRequirement> {
  readonly requirementType: TRequirement['type'];
  handle(
    requirement: TRequirement,
    context: AuthorizationContext,
  ): Promise<boolean | AuthorizationDecision> | boolean | AuthorizationDecision;
}
```

- **`requirementType`**: a unique string discriminant. The `AuthorizationService` dispatches to
  this handler whenever a requirement with `type === requirementType` is evaluated.
- **`handle()`**: returns `true`/`false` (simple grant/deny) or an `AuthorizationDecision` (with
  an optional denial reason propagated to the `ForbiddenError`). May be synchronous or async.

---

## Step-by-step: time-window authorization

Goal: allow access only during a configured time window (e.g. `09:00–17:00` on weekdays).

### 1. Define the requirement

```typescript
// src/authz/requirements/time-window.requirement.ts
import type { AuthorizationRequirement } from '@xlr8-nest/core/authz';

export const TIME_WINDOW_REQUIREMENT = 'time_window' as const;

export class TimeWindowRequirement implements AuthorizationRequirement {
  readonly type = TIME_WINDOW_REQUIREMENT;

  constructor(
    public readonly startHour: number,   // 0-23 inclusive
    public readonly endHour: number,     // 0-23 inclusive
    public readonly timezone: string = 'UTC',
  ) {}
}
```

### 2. Implement the handler

```typescript
// src/authz/handlers/time-window.handler.ts
import { Injectable } from '@nestjs/common';
import type { AuthorizationContext, AuthorizationDecision } from '@xlr8-nest/core/authz';
import type { RequirementHandler } from '@xlr8-nest/core/authz';
import { TIME_WINDOW_REQUIREMENT, TimeWindowRequirement } from '../requirements/time-window.requirement';

@Injectable()
export class TimeWindowHandler implements RequirementHandler<TimeWindowRequirement> {
  readonly requirementType = TIME_WINDOW_REQUIREMENT;

  handle(
    requirement: TimeWindowRequirement,
    _context: AuthorizationContext,
  ): AuthorizationDecision {
    const now = new Date();
    // Use Intl.DateTimeFormat to get the hour in the target timezone
    const hour = Number(
      new Intl.DateTimeFormat('en', {
        hour: 'numeric',
        hour12: false,
        timeZone: requirement.timezone,
      }).format(now),
    );

    const granted = hour >= requirement.startHour && hour < requirement.endHour;
    if (granted) {
      return { granted: true };
    }
    return {
      granted: false,
      reason: `Access only allowed between ${requirement.startHour}:00 and ${requirement.endHour}:00 (${requirement.timezone})`,
      failedRequirementType: TIME_WINDOW_REQUIREMENT,
    };
  }
}
```

### 3. Create a convenience decorator

```typescript
// src/authz/decorators/require-time-window.decorator.ts
import { Authorize } from '@xlr8-nest/core/authz';
import { TimeWindowRequirement } from '../requirements/time-window.requirement';

export const RequireTimeWindow = (
  startHour: number,
  endHour: number,
  timezone = 'UTC',
): MethodDecorator & ClassDecorator =>
  Authorize(new TimeWindowRequirement(startHour, endHour, timezone));
```

### 4. Register in `AuthzModule`

```typescript
// src/app.module.ts
import { AuthzModule } from '@xlr8-nest/core/authz';
import { TimeWindowHandler } from './authz/handlers/time-window.handler';

@Module({
  imports: [
    AuthzModule.forRoot({
      handlers: [TimeWindowHandler],   // add alongside built-in handlers
      registerGlobalGuard: true,
    }),
  ],
})
export class AppModule {}
```

### 5. Use the decorator

```typescript
@Controller('reports')
export class ReportsController {
  @Get()
  @RequireRoles('analyst')
  @RequireTimeWindow(9, 17, 'Asia/Tokyo')   // must be analyst AND within business hours JST
  getReport() { ... }
}
```

Both requirements are evaluated as AND — the principal must be an `analyst` AND the request
must arrive within the time window.

---

## Step-by-step: tenant-isolation handler

Goal: principals may only access resources belonging to their `tenantId`.

### 1. Requirement

```typescript
export const TENANT_REQUIREMENT = 'tenant' as const;

export class TenantRequirement implements AuthorizationRequirement {
  readonly type = TENANT_REQUIREMENT;
  // No configuration needed — the tenant check is uniform
}
```

### 2. Handler — reading tenant from `principal.raw`

```typescript
@Injectable()
export class TenantHandler implements RequirementHandler<TenantRequirement> {
  readonly requirementType = TENANT_REQUIREMENT;

  handle(requirement: TenantRequirement, context: AuthorizationContext): AuthorizationDecision {
    const tenantId = (context.principal.raw as { tenantId?: string })?.tenantId;
    const resource = context.resource as { tenantId?: string } | null | undefined;

    if (!tenantId) {
      return { granted: false, reason: 'Principal has no tenantId' };
    }
    if (!resource) {
      // No resource loaded yet — allow (the resource handler will enforce later)
      return { granted: true };
    }
    if (resource.tenantId !== tenantId) {
      return { granted: false, reason: 'Resource belongs to a different tenant' };
    }
    return { granted: true };
  }
}
```

`context.principal.raw` contains the original `request.user` object set by the Passport strategy.
If your JWT includes `tenantId`, it will be available there.

### 3. Decorator

```typescript
export const RequireSameTenant = (): MethodDecorator & ClassDecorator =>
  Authorize(new TenantRequirement());
```

### 4. Usage

```typescript
@Controller('documents')
@RequireSameTenant()   // applies to all routes in this controller
export class DocumentsController {
  @Get(':id')
  @RequireResource<Document>(
    (principal, doc) => doc.tenantId === (principal.raw as AppUser).tenantId,
    async (ctx) => this.docs.findById(ctx.request['params']['id']),
  )
  findOne() { ... }
}
```

---

## `AuthorizationDecision` — when to use reason vs. boolean

| Return | When |
|---|---|
| `true` / `false` | Simple grant/deny with no explanation needed |
| `{ granted: true }` | Same as `true` but explicit |
| `{ granted: false, reason: '...' }` | Denial with a human-readable reason (propagated to `ForbiddenError.message`) |
| `{ granted: false, failedRequirementType: '...' }` | Explicitly identifies which requirement type denied (used in guard logging) |

---

## Testing your handler

`RequirementHandler.handle()` is a plain TypeScript method — unit-test it directly without
spinning up a NestJS application:

```typescript
import { TimeWindowHandler } from './time-window.handler';
import { TimeWindowRequirement } from '../requirements/time-window.requirement';

describe('TimeWindowHandler', () => {
  const handler = new TimeWindowHandler();

  it('grants during business hours', () => {
    // mock the current hour by mocking Intl.DateTimeFormat if needed
    const req = new TimeWindowRequirement(9, 17, 'UTC');
    const ctx = { principal: { id: '1', roles: [], permissions: [] } };
    // In a real test, you'd mock Date/Intl to control the current time
    const decision = handler.handle(req, ctx as any);
    expect(decision.granted).toBe(true);
  });
});
```
