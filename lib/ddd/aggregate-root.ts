import { DomainEvent } from './domain-event';
import { Entity } from './entity';
import { Identifier } from './type';

/**
 * Abstract base class for Aggregate Roots in DDD
 * Combines Entity identity with Domain Event management
 * Supports both event collection and event sourcing patterns
 */
export abstract class AggregateRoot<T extends Identifier> extends Entity<T> {
  private readonly uncommittedEvents: DomainEvent[] = [];

  /**
   * Add domain event (legacy method for backward compatibility)
   * @deprecated Use apply() instead
   */
  protected addDomainEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
  }

  /**
   * Apply and record a domain event
   * This method both records the event and applies it to the aggregate state
   */
  protected apply<TEvent extends DomainEvent = DomainEvent>(event: TEvent): void {
    this.uncommittedEvents.push(event);
    this.applyEvent(event);
  }

  /**
   * Pull all uncommitted events and clear the list
   * @deprecated Use getUncommittedEvents() and commitEvents() instead
   */
  pullDomainEvents(): DomainEvent[] {
    const events = [...this.uncommittedEvents];
    this.uncommittedEvents.length = 0;
    return events;
  }

  /**
   * Get all uncommitted events without clearing them
   */
  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }

  /**
   * Mark all events as committed (clear the list)
   */
  commitEvents(): void {
    this.uncommittedEvents.length = 0;
  }

  /**
   * Discard all uncommitted events
   */
  uncommit(): void {
    this.uncommittedEvents.length = 0;
  }

  /**
   * Load aggregate from event history (for event sourcing)
   * Replays all historical events without recording them as new events
   */
  loadFromHistory(history: DomainEvent[]): void {
    history.forEach((event) => this.applyEvent(event));
  }

  /**
   * Apply event to aggregate state
   * Override this method in subclasses to handle state changes
   * This is called by apply() and loadFromHistory()
   * 
   * @example
   * ```typescript
   * protected applyEvent(event: DomainEvent): void {
   *   if (event instanceof UserCreatedEvent) {
   *     // Update state based on event
   *   } else if (event instanceof UserNameChangedEvent) {
   *     this.name = event.newName;
   *   }
   * }
   * ```
   */
  protected applyEvent(event: DomainEvent): void {
    // Override in subclass to handle state changes
  }
}
