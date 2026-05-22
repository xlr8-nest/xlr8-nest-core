import { Injectable, Logger } from '@nestjs/common';
import { IMessagePublisher } from './message-publisher';
import { OutboxEventRecord } from './outbox.repository';

/**
 * Placeholder publisher that logs to stdout. Replace with a Kafka / RabbitMQ /
 * AWS SNS implementation in production by binding MessagePublisherToken
 * to that class via MessagingModule.forRoot({ messagePublisher: ... }).
 */
@Injectable()
export class ConsoleMessagePublisher implements IMessagePublisher {
  private readonly logger = new Logger(ConsoleMessagePublisher.name);

  async publish(record: OutboxEventRecord): Promise<void> {
    this.logger.log(
      `[outbox→bus] ${record.eventName} id=${record.id} aggregate=${record.aggregateType}:${record.aggregateId} payload=${JSON.stringify(record.payload)}`,
    );
  }
}
