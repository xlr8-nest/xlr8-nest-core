# Extending: Custom `IMessagePublisher`

Wire the outbox worker to any message broker — Kafka, RabbitMQ, AWS SNS/SQS,
Azure Service Bus, Google Pub/Sub, or a simple HTTP webhook.

---

## Table of Contents

- [The interface](#the-interface)
- [Example: Kafka publisher](#example-kafka-publisher)
- [Example: AWS SNS publisher](#example-aws-sns-publisher)
- [Example: RabbitMQ publisher (amqplib)](#example-rabbitmq-publisher-amqplib)
- [How retry interacts with your publisher](#how-retry-interacts-with-your-publisher)
- [Testing a publisher](#testing-a-publisher)

---

## The interface

```typescript
interface IMessagePublisher {
  publish(record: OutboxEventRecord): Promise<void>;
}

interface OutboxEventRecord {
  id: string;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  retryCount: number;
}
```

`publish()` receives one record at a time. If it throws, the worker catches the error,
records the failure, and schedules a retry with exponential backoff. If it resolves without
throwing, the worker marks the record as published.

---

## Example: Kafka publisher

Using `kafkajs`:

```typescript
// src/infrastructure/kafka-message-publisher.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import type { IMessagePublisher, OutboxEventRecord } from '@xlr8-nest/core/messaging';

@Injectable()
export class KafkaMessagePublisher implements IMessagePublisher, OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private producer: Producer;

  constructor() {
    this.kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'] });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(record: OutboxEventRecord): Promise<void> {
    await this.producer.send({
      topic: record.eventName,              // topic = eventName (e.g. 'UserCreated')
      messages: [
        {
          key: record.aggregateId,          // key = aggregateId (ensures partition ordering)
          value: JSON.stringify({
            id: record.id,
            occurredAt: record.occurredAt,
            aggregateType: record.aggregateType,
            aggregateId: record.aggregateId,
            payload: record.payload,
          }),
          headers: {
            'event-name': record.eventName,
            'aggregate-type': record.aggregateType,
          },
        },
      ],
    });
  }
}
```

Register in `MessagingModule`:

```typescript
MessagingModule.forRoot({
  translators: [UserEventTranslator],
  messagePublisher: KafkaMessagePublisher,
})
```

---

## Example: AWS SNS publisher

```typescript
// src/infrastructure/sns-message-publisher.ts
import { Injectable } from '@nestjs/common';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import type { IMessagePublisher, OutboxEventRecord } from '@xlr8-nest/core/messaging';

@Injectable()
export class SnsMessagePublisher implements IMessagePublisher {
  private readonly sns = new SNSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  private readonly topicArnPrefix = process.env.SNS_TOPIC_ARN_PREFIX ?? '';

  async publish(record: OutboxEventRecord): Promise<void> {
    await this.sns.send(
      new PublishCommand({
        TopicArn: `${this.topicArnPrefix}${record.eventName}`,
        Message: JSON.stringify(record.payload),
        MessageAttributes: {
          eventName:     { DataType: 'String', StringValue: record.eventName },
          aggregateType: { DataType: 'String', StringValue: record.aggregateType },
          aggregateId:   { DataType: 'String', StringValue: record.aggregateId },
          eventId:       { DataType: 'String', StringValue: record.id },
        },
        MessageGroupId: record.aggregateId,    // for FIFO topics
      }),
    );
  }
}
```

---

## Example: RabbitMQ publisher (amqplib)

```typescript
// src/infrastructure/rabbitmq-message-publisher.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import amqp, { Connection, Channel } from 'amqplib';
import type { IMessagePublisher, OutboxEventRecord } from '@xlr8-nest/core/messaging';

@Injectable()
export class RabbitMqMessagePublisher implements IMessagePublisher, OnModuleInit, OnModuleDestroy {
  private connection: Connection;
  private channel: Channel;

  async onModuleInit(): Promise<void> {
    this.connection = await amqp.connect(process.env.AMQP_URL ?? 'amqp://localhost');
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange('domain-events', 'topic', { durable: true });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel.close();
    await this.connection.close();
  }

  async publish(record: OutboxEventRecord): Promise<void> {
    const content = Buffer.from(JSON.stringify({
      id: record.id,
      occurredAt: record.occurredAt,
      aggregateId: record.aggregateId,
      payload: record.payload,
    }));

    this.channel.publish(
      'domain-events',
      `${record.aggregateType}.${record.eventName}`,  // routing key
      content,
      {
        persistent: true,         // survive broker restart
        messageId: record.id,
        timestamp: Math.floor(record.occurredAt.getTime() / 1000),
        headers: { aggregateId: record.aggregateId },
      },
    );
  }
}
```

---

## How retry interacts with your publisher

The outbox worker calls `publish()` and:

- **If it resolves** → calls `outboxRepo.markPublished(record.id)`.
- **If it throws** → calls `outboxRepo.recordFailure(record.id, error.message, nextAttemptAt, isTerminal)`.

You do not need to handle retries inside `publish()` — the worker does it. However, you should:

1. **Throw on failure**: do not swallow errors silently. If the broker is unavailable, let the
   exception propagate so the worker can schedule a retry.
2. **Make publishing idempotent where possible**: the worker guarantees at-least-once delivery.
   The same `record.id` may be published more than once (e.g. the process crashed after the broker
   accepted the message but before `markPublished` ran). Use `record.id` as a deduplication key
   on the subscriber side.
3. **Keep `publish()` fast**: it runs on the worker's polling loop. Slow publishers delay all
   events for the same aggregate (sequential per-aggregate processing). Use async broker clients
   that don't block unnecessarily.

---

## Testing a publisher

Because `IMessagePublisher` is a plain interface, you can create a simple in-memory publisher
for integration tests:

```typescript
export class CollectingMessagePublisher implements IMessagePublisher {
  readonly published: OutboxEventRecord[] = [];

  async publish(record: OutboxEventRecord): Promise<void> {
    this.published.push(record);
  }
}
```

Override the publisher in the test module:

```typescript
const publisher = new CollectingMessagePublisher();

const module = await Test.createTestingModule({
  imports: [
    MessagingModule.forRoot({
      translators: [UserEventTranslator],
      messagePublisher: CollectingMessagePublisher,
      worker: { enabled: false },  // disable auto-polling in tests
    }),
  ],
})
  .overrideProvider(CollectingMessagePublisher).useValue(publisher)
  .compile();

// Manually trigger one tick
const worker = module.get(OutboxWorker);
await worker.tick();

expect(publisher.published).toHaveLength(1);
expect(publisher.published[0].eventName).toBe('UserCreated');
```
