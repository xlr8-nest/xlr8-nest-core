import { Inject, Injectable } from '@nestjs/common';
import { AggregateRoot } from '../ddd/aggregate-root';
import { DomainEvent } from '../ddd/domain-event';
import { Identifier } from '../ddd/type';
import { DomainEventTranslatorRegistry } from './domain-event-translator.registry';
import { IntegrationEvent } from './integration-event';
import { type IOutboxRepository, OutboxRepositoryToken } from './outbox.repository';

/**
 * Bridges domain events to the outbox.
 *
 * Application handlers call `publishFrom(aggregate)` inside their
 * `uow.transaction(...)` block, AFTER persisting the aggregate. The publisher:
 *   1. Pulls domain events from the aggregate.
 *   2. Translates them to integration events via the registered translators.
 *   3. Writes the integration events into the outbox table in the same transaction.
 *
 * This guarantees that aggregate state and outbox entries either both commit or
 * both roll back — the cornerstone of the outbox pattern.
 *
 * The pulled domain events are also returned so the caller can publish them
 * through the in-process EventBus (for non-transactional listeners like logging
 * or metrics) AFTER the transaction commits.
 */
@Injectable()
export class OutboxPublisher {
  constructor(
    private readonly translators: DomainEventTranslatorRegistry,
    @Inject(OutboxRepositoryToken)
    private readonly outboxRepo: IOutboxRepository,
  ) {}

  /** Convenience: pull, translate, and stash in one call. */
  async publishFrom(aggregate: AggregateRoot<Identifier>): Promise<DomainEvent[]> {
    const events = aggregate.pullEvents();
    await this.publishEvents(events);
    return events;
  }

  /** Lower-level: translate already-pulled events and stash. */
  async publishEvents(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const integrationEvents: IntegrationEvent[] = this.translators.translateAll(events);
    if (integrationEvents.length > 0) {
      await this.outboxRepo.save(integrationEvents);
    }
  }
}
