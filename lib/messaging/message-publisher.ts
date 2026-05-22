import { OutboxEventRecord } from './outbox.repository';

export const MessagePublisherToken = Symbol('MessagePublisher');

/**
 * Hands an integration event off to the underlying message bus
 * (Kafka, RabbitMQ, NATS, AWS SNS/SQS, etc.).
 *
 * Implementations must:
 *  - Resolve (no error) only when the broker has accepted the message.
 *  - Throw on any failure so the OutboxWorker can record it and schedule a retry.
 *
 * Idempotency expectations:
 *  - The OutboxEventRecord.id is stable across retries — use it as the dedupe key
 *    on the broker side if supported.
 */
export interface IMessagePublisher {
  publish(record: OutboxEventRecord): Promise<void>;
}
