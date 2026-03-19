import 'reflect-metadata';
import { OnEvent } from '@nestjs/event-emitter';

const EVENT_NAME_METADATA = Symbol('EVENT_NAME_METADATA');

/**
 * Decorator để đánh dấu một class là Domain Event và định nghĩa event name
 * @param eventName Tên của event (optional, mặc định sử dụng class name)
 * 
 * @example
 * ```typescript
 * @Event('UserCreated')
 * class UserCreatedEvent implements DomainEvent {
 *   constructor(
 *     public readonly userId: string,
 *     public readonly email: string,
 *     public readonly occurredOn: Date = new Date()
 *   ) {}
 * 
 *   get eventName(): string {
 *     return getEventName(this);
 *   }
 * }
 * 
 * // Hoặc không cần truyền name, sẽ dùng class name
 * @Event()
 * class UserCreatedEvent implements DomainEvent {
 *   // ...
 * }
 * ```
 */
export function Event(eventName?: string): ClassDecorator {
  return (target: any) => {
    const name = eventName || target.name;
    Reflect.defineMetadata(EVENT_NAME_METADATA, name, target);
    Reflect.defineMetadata(EVENT_NAME_METADATA, name, target.prototype);
  };
}

/**
 * Lấy event name từ event class hoặc instance
 */
export function getEventName(eventOrClass: any): string {
  // Thử lấy từ instance
  const fromInstance = Reflect.getMetadata(EVENT_NAME_METADATA, eventOrClass.constructor);
  if (fromInstance) return fromInstance;
  
  // Thử lấy từ prototype
  const fromPrototype = Reflect.getMetadata(EVENT_NAME_METADATA, eventOrClass);
  if (fromPrototype) return fromPrototype;
  
  // Thử lấy từ class
  const fromClass = Reflect.getMetadata(EVENT_NAME_METADATA, eventOrClass.prototype || eventOrClass);
  if (fromClass) return fromClass;
  
  // Fallback: dùng class name
  return eventOrClass.constructor?.name || eventOrClass.name || 'UnknownEvent';
}

/**
 * Decorator để đánh dấu một method là event handler
 * Wrapper cho @OnEvent của NestJS event-emitter
 * @param eventClassOrName Event class (decorated với @Event) hoặc event name string
 * 
 * @example
 * ```typescript
 * @Injectable()
 * class UserEventHandlers {
 *   // Sử dụng event class (recommended)
 *   @EventHandler(UserCreatedEvent)
 *   async handleUserCreated(event: UserCreatedEvent) {
 *     console.log('User created:', event);
 *   }
 * 
 *   // Hoặc sử dụng event name string
 *   @EventHandler('UserUpdated')
 *   async handleUserUpdated(event: UserUpdatedEvent) {
 *     console.log('User updated:', event);
 *   }
 * }
 * ```
 */
export function EventHandler(eventClassOrName: any) {
  // Xác định event name từ class hoặc string
  const eventName = typeof eventClassOrName === 'string' 
    ? eventClassOrName 
    : getEventName(eventClassOrName);
  
  // Return NestJS @OnEvent decorator với event name
  return OnEvent(eventName);
}
