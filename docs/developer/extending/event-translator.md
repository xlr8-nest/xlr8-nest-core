# Extending: Custom `IDomainEventTranslator`

Map your domain events to integration events. One translator class per bounded context
(or per domain area) is the recommended granularity.

---

## Table of Contents

- [The interface](#the-interface)
- [Step-by-step: translating user domain events](#step-by-step-translating-user-domain-events)
  - [1. Define integration events](#1-define-integration-events)
  - [2. Define the translator](#2-define-the-translator)
  - [3. Register with `MessagingModule`](#3-register-with-messagingmodule)
- [Multi-context translator](#multi-context-translator)
- [Producing multiple integration events from one domain event](#producing-multiple-integration-events-from-one-domain-event)
- [Filtering: domain events that stay internal](#filtering-domain-events-that-stay-internal)
- [Using `@Event('stable.name')` for event name stability](#using-eventstablename-for-event-name-stability)
- [Testing a translator](#testing-a-translator)

---

## The interface

```typescript
interface IDomainEventTranslator {
  supports(eventName: string): boolean;
  translate(event: DomainEvent): IntegrationEvent[];
}
```

| Method | Contract |
|---|---|
| `supports(eventName)` | Cheap predicate — return `true` if this translator handles events with this name |
| `translate(event)` | Produce zero or more `IntegrationEvent` instances for the given domain event |

Returning an empty array from `translate()` is valid and common — not every domain event needs
to cross the service boundary.

---

## Step-by-step: translating user domain events

### 1. Define integration events

```typescript
// src/users/integration-events/user-registered.event.ts
import { IntegrationEvent } from '@xlr8-nest/core/messaging';

export class UserRegisteredIntegrationEvent extends IntegrationEvent {
  readonly eventName = 'user.registered';
  readonly aggregateType = 'user';

  constructor(
    public readonly aggregateId: string,
    public readonly email: string,
    public readonly plan: string,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}
```

```typescript
// src/users/integration-events/user-deleted.event.ts
import { IntegrationEvent } from '@xlr8-nest/core/messaging';

export class UserDeletedIntegrationEvent extends IntegrationEvent {
  readonly eventName = 'user.deleted';
  readonly aggregateType = 'user';

  constructor(
    public readonly aggregateId: string,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}
```

### 2. Define the translator

```typescript
// src/users/user-event.translator.ts
import { Injectable } from '@nestjs/common';
import type { DomainEvent, IDomainEventTranslator, IntegrationEvent } from '@xlr8-nest/core/messaging';
import { UserCreatedEvent } from './events/user-created.event';
import { UserDeletedEvent } from './events/user-deleted.event';
import { UserRegisteredIntegrationEvent } from './integration-events/user-registered.event';
import { UserDeletedIntegrationEvent } from './integration-events/user-deleted.event';

@Injectable()
export class UserEventTranslator implements IDomainEventTranslator {
  // The event names this translator handles
  private readonly handledNames = new Set([
    UserCreatedEvent.name,   // or use getEventName(UserCreatedEvent) if @Event('...') is used
    UserDeletedEvent.name,
  ]);

  supports(eventName: string): boolean {
    return this.handledNames.has(eventName);
  }

  translate(event: DomainEvent): IntegrationEvent[] {
    if (event instanceof UserCreatedEvent) {
      return [
        new UserRegisteredIntegrationEvent(
          event.userId,
          event.email,
          event.plan,
          event.occurredOn,   // preserve the domain event timestamp
        ),
      ];
    }

    if (event instanceof UserDeletedEvent) {
      return [
        new UserDeletedIntegrationEvent(event.userId, event.occurredOn),
      ];
    }

    return [];   // event name matched but no concrete class matched (should not happen)
  }
}
```

### 3. Register with `MessagingModule`

```typescript
// src/app.module.ts
MessagingModule.forRoot({
  translators: [UserEventTranslator],
  messagePublisher: KafkaMessagePublisher,
})
```

---

## Multi-context translator

When one service handles multiple bounded contexts, create one translator per context:

```typescript
MessagingModule.forRoot({
  translators: [
    UserEventTranslator,      // handles 'UserCreated', 'UserDeleted'
    OrderEventTranslator,     // handles 'OrderPlaced', 'OrderShipped', 'OrderCancelled'
    PaymentEventTranslator,   // handles 'PaymentReceived', 'PaymentFailed'
  ],
  messagePublisher: KafkaMessagePublisher,
})
```

**First-match dispatch:** the translator registry calls `supports()` on each translator in order.
The first to return `true` handles the event. Ensure event name prefixes don't overlap across
translators (e.g. `order.placed` and `order.item.added` — if `OrderEventTranslator.supports('order.*')`
is too broad, it would intercept `order.item.added` before the intended translator).

---

## Producing multiple integration events from one domain event

A domain event may need to notify multiple downstream services:

```typescript
translate(event: DomainEvent): IntegrationEvent[] {
  if (event instanceof OrderShippedEvent) {
    return [
      new OrderShippedForNotification(event.orderId, event.customerId),  // → notification service
      new OrderShippedForAnalytics(event.orderId, event.shippedAt),      // → analytics pipeline
    ];
  }
  return [];
}
```

All returned integration events are saved to the outbox in the same batch. They are independent
records — each has its own retry counter and status.

---

## Filtering: domain events that stay internal

```typescript
translate(event: DomainEvent): IntegrationEvent[] {
  if (event instanceof UserLoginEvent) {
    // Internal metrics event — does not cross service boundary
    return [];
  }
  if (event instanceof UserCreatedEvent) {
    return [new UserRegisteredIntegrationEvent(...)];
  }
  return [];
}
```

Returning `[]` means the domain event is silently dropped from the outbox — it does not produce
any outbox row.

---

## Using `@Event('stable.name')` for event name stability

If your domain events use `@Event('user.created')` to set an explicit event name, reference
that name in `supports()`:

```typescript
import { getEventName } from '@xlr8-nest/core/ddd';
import { UserCreatedEvent } from './events/user-created.event';

// In the translator:
supports(eventName: string): boolean {
  return eventName === getEventName(UserCreatedEvent);   // 'user.created'
}
```

Using class names directly (`UserCreatedEvent.name === 'UserCreatedEvent'`) is fragile under
minification. Use `getEventName()` for stability.

---

## Testing a translator

```typescript
import { UserEventTranslator } from './user-event.translator';
import { UserCreatedEvent } from './events/user-created.event';
import { UserRegisteredIntegrationEvent } from './integration-events/user-registered.event';

describe('UserEventTranslator', () => {
  const translator = new UserEventTranslator();

  it('supports UserCreatedEvent', () => {
    expect(translator.supports('UserCreatedEvent')).toBe(true);
    expect(translator.supports('OrderPlaced')).toBe(false);
  });

  it('translates UserCreatedEvent to UserRegisteredIntegrationEvent', () => {
    const event = new UserCreatedEvent('user-1', 'alice@example.com', 'pro');
    const result = translator.translate(event);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(UserRegisteredIntegrationEvent);
    expect((result[0] as UserRegisteredIntegrationEvent).aggregateId).toBe('user-1');
    expect((result[0] as UserRegisteredIntegrationEvent).email).toBe('alice@example.com');
  });
});
```

`IDomainEventTranslator` implementations are pure classes with no DI dependencies (in most cases),
making them trivially unit-testable.
