import { randomUUID } from 'node:crypto';

/**
 * Cross-service contract published through the message bus.
 *
 * Differences from a DomainEvent:
 *  - Defines an external contract (other services consume it) — name + version are stable.
 *  - Carries a serializable payload, not value-object instances.
 *  - Persisted in the outbox before publishing, guaranteeing at-least-once delivery.
 *
 * Concrete subclasses set `eventName` (e.g. "tenant.provisioned.v1") and provide
 * the payload as their own typed fields. The base class handles id, occurredAt,
 * and aggregate routing metadata.
 *
 * Note: the base class uses `occurredAt`; the DomainEvent interface uses `occurredOn`.
 * When translating, pass the domain event's `occurredOn` as `occurredAt` to preserve
 * the original event time rather than the translation time.
 */
export abstract class IntegrationEvent {
  readonly id: string;
  readonly occurredAt: Date;

  abstract readonly eventName: string;
  abstract readonly aggregateType: string;
  abstract readonly aggregateId: string;

  constructor(occurredAt?: Date) {
    this.id = randomUUID();
    this.occurredAt = occurredAt ?? new Date();
  }

  /**
   * Returns the JSON-serializable payload stored in outbox_events.payload.
   * Defaults to all enumerable own properties except the base routing fields.
   * Override for selective payloads or versioned shapes.
   *
   * The default implementation passes through JSON.parse(JSON.stringify(...)) to
   * strip non-serializable values (undefined, class instances, bigint) and ensure
   * the stored payload is safe jsonb. Override toPayload() explicitly if you need
   * custom serialization (e.g. Date → ISO string, enum → code).
   */
  toPayload(): Record<string, unknown> {
    const skip = new Set(['id', 'occurredAt', 'eventName', 'aggregateType', 'aggregateId']);
    const raw: Record<string, unknown> = {};
    for (const key of Object.keys(this)) {
      if (!skip.has(key)) {
        raw[key] = (this as unknown as Record<string, unknown>)[key];
      }
    }
    // JSON round-trip: strips non-serializable values and Date → ISO string
    return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  }
}
