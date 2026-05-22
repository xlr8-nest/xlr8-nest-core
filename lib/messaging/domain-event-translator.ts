import { DomainEvent } from '../ddd/domain-event';
import { IntegrationEvent } from './integration-event';

/**
 * Strategy that converts domain events into integration events.
 *
 * One translator typically covers one bounded context's domain events
 * (e.g. TenantEventTranslator handles tenant.*, plan_version.*).
 *
 * Returning [] from `translate()` is valid — not every domain event must cross
 * the service boundary. Internal events (metrics, projector triggers) stay
 * inside the service.
 */
export interface IDomainEventTranslator {
  /** Cheap predicate: does this translator handle the given event name? */
  supports(eventName: string): boolean;

  /** Produces zero or more integration events for the given domain event. */
  translate(event: DomainEvent): IntegrationEvent[];
}

/** Multi-injection token: bind every translator to this token to register it. */
export const TRANSLATORS_TOKEN = Symbol('DomainEventTranslators');
