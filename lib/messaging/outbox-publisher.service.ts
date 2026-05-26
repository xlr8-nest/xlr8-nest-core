import { Inject, Injectable } from '@nestjs/common';
import { DomainEvent } from '../ddd/domain-event';
import { DomainEventTranslatorRegistry } from './domain-event-translator.registry';
import { IntegrationEvent } from './integration-event';
import { type IOutboxRepository, OutboxRepositoryToken } from './outbox.repository';

/**
 * Persists integration events derived from domain events into the outbox table.
 *
 * Single responsibility: translate domain events → integration events → outbox row.
 * In-process domain event dispatch is the caller's responsibility, not this class.
 *
 * Correct handler pattern (inside uow.transaction()):
 *
 *   const domainEvents = aggregate.pullEvents();
 *   await this.eventBus.publishAll(domainEvents);   // domain events first (internal)
 *   await this.outbox.publishEvents(domainEvents);  // integration events second (external)
 *
 * Domain events dispatch first because they represent what happened inside the
 * domain; integration events are the external consequence derived from them.
 * Both run inside the same transaction, so they commit or roll back together.
 */
@Injectable()
export class OutboxPublisher {
  constructor(
    private readonly translators: DomainEventTranslatorRegistry,
    @Inject(OutboxRepositoryToken)
    private readonly outboxRepo: IOutboxRepository,
  ) {}

  /** Translate already-pulled domain events to integration events and write to outbox. */
  async publishEvents(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const integrationEvents: IntegrationEvent[] = this.translators.translateAll(events);
    if (integrationEvents.length > 0) {
      await this.outboxRepo.save(integrationEvents);
    }
  }
}
