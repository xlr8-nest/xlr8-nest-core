// Cross-service event contracts
export * from './integration-event';

// Translator pattern (domain → integration)
export * from './domain-event-translator';
export * from './domain-event-translator.registry';

// Outbox infrastructure
export * from './outbox-event-status.enum';
export * from './outbox-event.orm';
export * from './outbox.repository';
export * from './typeorm-outbox.repository';
export * from './outbox-publisher.service';

// Broker abstraction
export * from './message-publisher';
export * from './console-message-publisher';

// Background worker
export * from './outbox-worker.service';

// Admin + CLI
export * from './outbox-admin.service';
export * from './outbox.command';

// NestJS module
export * from './messaging.module';
