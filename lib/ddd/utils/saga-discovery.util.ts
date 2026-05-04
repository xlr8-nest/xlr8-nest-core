import { SAGA_METADATA } from '../common/metadata';
import type { ISaga } from '../common/event-bus.type';
import type { DomainEvent } from '../domain-event';

export function getSagas(instance: object): Array<ISaga<DomainEvent>> {
  try {
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown> | null;
    if (!prototype) {
      return [];
    }

    return Object.getOwnPropertyNames(prototype)
      .map((name) => getSaga(instance, prototype, name))
      .filter((saga): saga is ISaga<DomainEvent> => saga !== null);
  } catch {
    return [];
  }
}

function getSaga(
  instance: object,
  prototype: Record<string, unknown>,
  name: string,
): ISaga<DomainEvent> | null {
  try {
    const property = prototype[name];
    if (typeof property !== 'function') {
      return null;
    }

    const metadata = Reflect.getMetadata(SAGA_METADATA, instance, name);
    return metadata ? (property as ISaga<DomainEvent>) : null;
  } catch {
    return null;
  }
}
