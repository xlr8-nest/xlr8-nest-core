# Developer Documentation — @xlr8-nest/core

This section is for **library contributors and advanced users** who need to understand
how the library works internally, how to extend it, or how to build/release it.

If you are building an application *on top of* the library, see [guides/README.md](../guides/README.md) instead.

---

## Contents

### Setup & Workflow

| Doc | Purpose |
|---|---|
| [setup.md](./setup.md) | Clone, build, typecheck, lint, format, and publish the library |

### Internals — How Each Module Works

| Doc | What it explains |
|---|---|
| [internals/ddd.md](./internals/ddd.md) | Handler discovery via DiscoveryService, AbstractMessageBus dispatch, EventBus + RxJS Subject, saga wiring, decorator metadata |
| [internals/authz.md](./internals/authz.md) | Guard evaluation pipeline, requirement-handler registry, principal resolver, DI wiring, policy cycle fix |
| [internals/database.md](./internals/database.md) | AsyncLocalStorage ambient context, TypeOrmClient transaction lifecycle, UoW token injection, DynamicModule composition |
| [internals/messaging.md](./internals/messaging.md) | Outbox write path, atomic claim mechanism, per-aggregate ordering, exponential backoff/jitter/terminal-failure |
| [internals/response.md](./internals/response.md) | Exception normalizer chain-of-responsibility, isBaseErrorLike cross-realm detection, error information disclosure prevention |

### Extending the Library

| Doc | What you can build |
|---|---|
| [extending/authz-handler.md](./extending/authz-handler.md) | Custom `RequirementHandler` (ABAC, tenant-scoped, time-window, IP-based, …) |
| [extending/principal-resolver.md](./extending/principal-resolver.md) | Custom `PrincipalResolver` (JWT claims, API key, service account, …) |
| [extending/message-publisher.md](./extending/message-publisher.md) | Custom `IMessagePublisher` (Kafka, RabbitMQ, AWS SNS/SQS, Azure Service Bus, …) |
| [extending/event-translator.md](./extending/event-translator.md) | Custom `IDomainEventTranslator` (domain → integration event mapping) |
| [extending/new-module.md](./extending/new-module.md) | Adding a brand-new subpath module to the library |

---

## When to read what

- **New contributor** → [setup.md](./setup.md) first, then the internals doc for the area you are changing.
- **Adding a new authorization strategy** → [extending/authz-handler.md](./extending/authz-handler.md).
- **Integrating a message broker** → [extending/message-publisher.md](./extending/message-publisher.md) + [extending/event-translator.md](./extending/event-translator.md).
- **Debugging a strange CQRS / saga issue** → [internals/ddd.md](./internals/ddd.md).
- **Debugging a transaction that doesn't roll back** → [internals/database.md](./internals/database.md).
- **Understanding why the outbox retries / doesn't retry** → [internals/messaging.md](./internals/messaging.md).
