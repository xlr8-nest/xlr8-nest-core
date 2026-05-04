import { DomainEvent } from './domain-event';
import { Entity } from './entity';
import { Identifier } from './type';

/**
 * Base class for aggregate roots.
 * It only stores domain events raised by the aggregate.
 */
export abstract class AggregateRoot<T extends Identifier> extends Entity<T> {
  private readonly events: DomainEvent[] = [];

  /**
   * Raise a domain event from inside the aggregate.
   */
  protected addEvent<TEvent extends DomainEvent = DomainEvent>(event: TEvent): void {
    this.events.push(event);
  }

  /**
   * Get recorded domain events so application code can publish them.
   */
  pullEvents(): DomainEvent[] {
    const _events = [...this.events];
    this.events.length = 0;
    return _events;
  }

  

}
