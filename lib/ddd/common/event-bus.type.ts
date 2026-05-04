import type { Subject } from 'rxjs';
import type { ICommand } from '../command-bus';
import type { DomainEvent } from '../domain-event';

export type DomainEventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => void | Promise<void>;

export interface IEventBus {
  publish<TEvent extends DomainEvent>(event: TEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
}

export interface ISaga<TEvent extends DomainEvent = DomainEvent> {
  (events$: Subject<TEvent>): Subject<ICommand>;
}

export type EventConstructor<TEvent extends DomainEvent> = new (...args: never[]) => TEvent;

export interface CommandBusLike {
  execute(command: ICommand): Promise<unknown>;
}
