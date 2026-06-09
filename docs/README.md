# @xlr8-nest/core — Documentation

## Quick navigation

| You want to… | Start here |
|---|---|
| Use a module in your app | [guides/README.md](guides/README.md) — consumer guides (one per module) |
| Understand how something works internally | [developer/README.md](developer/README.md) — internals + extension recipes |
| Extend or contribute to the library | [developer/README.md](developer/README.md) |
| Check the architecture & dependency graph | [architecture/overview.md](architecture/overview.md) |
| Review known risks and tech debt | [maintenance/improvement-plan.md](maintenance/improvement-plan.md) |

---

## All documents

| Doc | Audience | Purpose |
| --- | --- | --- |
| [guides/README.md](guides/README.md) | **App developers** | Quick-start guides for all 10 modules — how to register, use, and configure each one |
| [developer/README.md](developer/README.md) | **Library contributors / advanced users** | Build setup, per-module internals (mechanisms + flows), extension cookbook (custom handlers, publishers, translators, resolvers, new modules) |
| [architecture/overview.md](architecture/overview.md) | Both | System architecture, design patterns, internal dependency graph, lifecycle diagrams |
| [architecture/modules.md](architecture/modules.md) | Both | Per-module deep reference: responsibilities, public exports, key abstractions, extension points |
| [authz.md](authz.md) | App developers | Detailed authorization framework guide |
| [api-reference.md](api-reference.md) | Both | Complete public API signatures |
| [maintenance/improvement-plan.md](maintenance/improvement-plan.md) | Contributors | Prioritized risks, tech debt, and phased refactoring roadmap |

## How this was produced

The architecture and risk content was generated from a source-level review of every module under `lib/` (one deep reader per module) plus cross-cutting passes on security, scalability/performance, coupling/dependency-graph, and build/packaging. Findings total **160** (5 critical, 53 high, 59 medium, 43 low). Each finding carries a file reference and a concrete recommendation; see the improvement plan.

> ⚠️ **Start here if you are triaging:** [maintenance/improvement-plan.md → P0 (act now)](maintenance/improvement-plan.md#p0--act-now). It contains a confirmed **critical authorization bug** (wildcard permission over-grant) and a **fail-open authorization** default.

## Conventions used in these docs

- **Severity**: `critical` (exploitable / data-loss / silently-wrong) → `high` → `medium` → `low`.
- **Category**: security · correctness · architecture · coupling · packaging · scalability · testing · tech-debt · code-smell · dx.
- **Confidence**: where a finding was directly confirmed against source it is marked ✅; the automated adversarial-verification pass did not complete, so unmarked items are analyst findings to be triaged, not yet independently re-verified.
