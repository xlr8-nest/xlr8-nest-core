import { randomUUID } from 'crypto';

/**
 * Cross-service contract published through the message bus.
 *
 * Differences from a DomainEvent:
 *  - Defines an external contract (other services consume it) — name + version are stable.
 *  - Carries a serializable payload, not value object instances.
 *  - Persisted in the outbox before publishing, guaranteeing at-least-once delivery.
 *
 * Concrete subclasses set `eventName` (e.g. "tenant.provisioned.v1") and provide
 * the payload as their own typed fields. The base class handles id, occurredAt,
 * and aggregate routing metadata.
 */
export abstract class IntegrationEvent {
  readonly id: string;
  readonly occurredAt: Date;

  abstract readonly eventName: string;
  abstract readonly aggregateType: string;
  abstract readonly aggregateId: string;

  constructor() {
    this.id = randomUUID();
    this.occurredAt = new Date();
  }

  /**
   * Returns the serializable payload that gets stored in outbox_events.payload
   * and shipped to consumers. Defaults to all enumerable own properties except
   * the base routing fields. Override for selective payloads or shape changes.
   */
  toPayload(): Record<string, unknown> {
    const skip = new Set(['id', 'occurredAt', 'eventName', 'aggregateType', 'aggregateId']);
    const payload: Record<string, unknown> = {};
    for (const key of Object.keys(this) as (keyof this)[]) {
      if (!skip.has(key as string)) {
        payload[key as string] = this[key] as unknown;
      }
    }
    return payload;
  }
}
