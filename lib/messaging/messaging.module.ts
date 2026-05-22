import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IDomainEventTranslator, TRANSLATORS_TOKEN } from './domain-event-translator';
import { DomainEventTranslatorRegistry } from './domain-event-translator.registry';
import { OutboxEventOrm } from './outbox-event.orm';
import { OutboxPublisher } from './outbox-publisher.service';
import { OutboxRepositoryToken } from './outbox.repository';
import { TypeOrmOutboxRepository } from './typeorm-outbox.repository';
import { ConsoleMessagePublisher } from './console-message-publisher';
import {
  IMessagePublisher,
  MessagePublisherToken,
} from './message-publisher';
import {
  OUTBOX_WORKER_OPTIONS,
  OutboxWorker,
  OutboxWorkerOptions,
} from './outbox-worker.service';
import { OutboxAdminService } from './outbox-admin.service';
import { OutboxCommandRunner } from './outbox.command';

export interface MessagingModuleOptions {
  /**
   * Domain → integration event translator classes to register. Each class
   * must implement IDomainEventTranslator and be DI-instantiable.
   */
  translators?: Array<Type<IDomainEventTranslator>>;

  /**
   * Class providing the IMessagePublisher implementation
   * (Kafka, RabbitMQ, SNS, ...). Defaults to ConsoleMessagePublisher.
   */
  messagePublisher?: Type<IMessagePublisher>;

  /** OutboxWorker tuning (poll interval, batch size, retry backoff). */
  worker?: OutboxWorkerOptions;

  /**
   * Register the `outbox` CLI command (OutboxCommandRunner). Default: true.
   * Set to false in environments where you do not bootstrap a nest-commander
   * CLI and want to avoid the dependency.
   */
  cli?: boolean;

  /** Set the module global (default true) so handlers can inject OutboxPublisher. */
  global?: boolean;
}

/**
 * Wires the messaging / outbox stack into a NestJS app in one line.
 *
 *     @Module({
 *       imports: [
 *         MessagingModule.forRoot({
 *           translators: [TenantEventTranslator],
 *           messagePublisher: KafkaMessagePublisher,
 *         }),
 *       ],
 *     })
 *
 * What's provided:
 *  - OutboxEventOrm registered via TypeOrmModule.forFeature.
 *  - IOutboxRepository → TypeOrmOutboxRepository
 *  - IMessagePublisher → caller-provided class, or ConsoleMessagePublisher.
 *  - OutboxPublisher (application-facing service).
 *  - OutboxWorker (background poller, auto-starts on module init).
 *  - DomainEventTranslatorRegistry, with caller's translators injected via
 *    TRANSLATORS_TOKEN.
 *  - OutboxAdminService + OutboxCommandRunner (`outbox` CLI command).
 */
@Module({})
export class MessagingModule {
  static forRoot(options: MessagingModuleOptions = {}): DynamicModule {
    const translatorClasses = options.translators ?? [];
    const publisherClass = options.messagePublisher ?? ConsoleMessagePublisher;
    const enableCli = options.cli ?? true;

    const providers: Provider[] = [
      // ORM-backed outbox repository
      TypeOrmOutboxRepository,
      { provide: OutboxRepositoryToken, useExisting: TypeOrmOutboxRepository },
      // Application-facing publisher
      OutboxPublisher,
      // Translator registry + each translator class + the aggregated array
      DomainEventTranslatorRegistry,
      ...translatorClasses,
      {
        provide: TRANSLATORS_TOKEN,
        useFactory: (...instances: IDomainEventTranslator[]) => instances,
        inject: translatorClasses,
      },
      // Message publisher (default: ConsoleMessagePublisher)
      publisherClass,
      { provide: MessagePublisherToken, useExisting: publisherClass },
      // Background worker + its options
      { provide: OUTBOX_WORKER_OPTIONS, useValue: options.worker ?? {} },
      OutboxWorker,
      // Admin + CLI
      OutboxAdminService,
      ...(enableCli ? [OutboxCommandRunner] : []),
    ];

    return {
      module: MessagingModule,
      global: options.global ?? true,
      imports: [TypeOrmModule.forFeature([OutboxEventOrm])],
      providers,
      exports: [OutboxPublisher, OutboxRepositoryToken, OutboxAdminService],
    };
  }
}
