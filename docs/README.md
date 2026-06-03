# @xlr8-nest/core — Documentation

Engineering documentation for the `@xlr8-nest/core` library: how it is built, and how it should evolve.

## Contents

| Doc | Purpose |
| --- | --- |
| [architecture/overview.md](architecture/overview.md) | System architecture, design patterns, internal dependency graph, module-init & request lifecycles |
| [architecture/modules.md](architecture/modules.md) | Per-module deep reference: responsibilities, public exports, key abstractions, extension points, usage |
| [maintenance/improvement-plan.md](maintenance/improvement-plan.md) | **Long-term improvement & maintenance plan** — prioritized risks (security, correctness, packaging, scalability, coupling, DX), technical debt, missing features, and a phased refactoring roadmap |
| [authz.md](authz.md) | Authorization framework guide (`@xlr8-nest/core/authz`) |

## How this was produced

The architecture and risk content was generated from a source-level review of every module under `lib/` (one deep reader per module) plus cross-cutting passes on security, scalability/performance, coupling/dependency-graph, and build/packaging. Findings total **160** (5 critical, 53 high, 59 medium, 43 low). Each finding carries a file reference and a concrete recommendation; see the improvement plan.

> ⚠️ **Start here if you are triaging:** [maintenance/improvement-plan.md → P0 (act now)](maintenance/improvement-plan.md#p0--act-now). It contains a confirmed **critical authorization bug** (wildcard permission over-grant) and a **fail-open authorization** default.

## Conventions used in these docs

- **Severity**: `critical` (exploitable / data-loss / silently-wrong) → `high` → `medium` → `low`.
- **Category**: security · correctness · architecture · coupling · packaging · scalability · testing · tech-debt · code-smell · dx.
- **Confidence**: where a finding was directly confirmed against source it is marked ✅; the automated adversarial-verification pass did not complete, so unmarked items are analyst findings to be triaged, not yet independently re-verified.
