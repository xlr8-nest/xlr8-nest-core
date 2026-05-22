import { Inject, Injectable, Optional } from '@nestjs/common';
import { DomainEvent } from '../ddd/domain-event';
import { IntegrationEvent } from './integration-event';
import {
  IDomainEventTranslator,
  TRANSLATORS_TOKEN,
} from './domain-event-translator';

/**
 * Aggregates all registered IDomainEventTranslators and dispatches each domain
 * event to the first translator that supports it. Returns the flat list of
 * integration events produced across every translator.
 */
@Injectable()
export class DomainEventTranslatorRegistry {
  constructor(
    @Optional()
    @Inject(TRANSLATORS_TOKEN)
    private readonly translators: IDomainEventTranslator[] = [],
  ) {}

  translateAll(events: DomainEvent[]): IntegrationEvent[] {
    const result: IntegrationEvent[] = [];
    for (const event of events) {
      for (const translator of this.translators) {
        if (translator.supports(event.eventName)) {
          result.push(...translator.translate(event));
          break;
        }
      }
    }
    return result;
  }
}
