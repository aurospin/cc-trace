<!--
Sync Impact Report
- Version change: 1.1.0 → 1.1.1 (PATCH — wording tightened across all principles; cross-file duplication with CLAUDE.md removed; no semantic change)
- Modified principles: I–VI reworded for concision; spirit unchanged
- Added sections: none
- Removed sections: explicit commit-prefix enumeration in Development Workflow (lives in CLAUDE.md)
- Templates requiring updates:
  ✅ .specify/templates/{plan,spec,tasks}-template.md (no constitution-driven changes)
  ✅ CLAUDE.md — Working Norms collapsed to a single-line pointer; the four norms now live solely in Principle VI

Prior history:
- 1.1.0 (2026-04-26): added Principle VI (Karpathy Guidelines); expanded Principle IV with explicit per-tier thresholds.
- 1.0.0 (2026-04-26): initial ratification — Principles I–V, Operational Boundaries, Workflow, Governance.
-->

# cc-trace Constitution

The non-negotiable principles that govern how cc-trace is designed, built, and shipped. Concrete rules, commands, paths, and quality numbers live in [CLAUDE.md](../../CLAUDE.md) — this document is the *why*; CLAUDE.md is the *what*.

## Core Principles

### I. Privacy at the Boundary (NON-NEGOTIABLE)

Captured traffic MUST be sanitized at the proxy boundary before it touches disk, the wire, or any rendered artifact. Credentials, bearer tokens, and operator-identifying headers MUST be redacted there — never downstream. A generated report or live dashboard MUST be safe to share without further review.

**Rationale**: cc-trace observes a long-lived authenticated session; one un-redacted log spreads further than one un-redacted bug. Late redaction is *probable* redaction; boundary redaction is *certain*.

### II. Self-Contained Artifacts

Generated `.html` reports MUST open from `file://` with zero network requests. The live dashboard MUST run entirely from the local Node process — no CDN, analytics, font URL, or telemetry.

**Rationale**: A report that needs the internet breaks on airplanes, in regulated environments, six months from now, and inside issue-tracker attachments. Self-containment makes a report *durable*, not just *fresh*.

### III. One Component Tree, Theme via Variables

Static reports and the live dashboard MUST render from the same React component tree. Mode-specific behavior is selected via `:root[data-mode]` and CSS variables — never by branching components or duplicating views. New visual treatments land as variables, not literal values.

**Rationale**: Two parallel frontends rot at different rates. Variable-driven theming forces design changes through one code path and keeps static and live aesthetics structurally in sync.

### IV. Test Tiers Have Contracts

Each test tier has a fixed I/O boundary that MUST be respected: unit mocks all I/O, integration uses real local servers (no Anthropic API), e2e drives the full attach lifecycle through mock-claude and mock-api. A test MUST NOT escape its tier (e.g. a unit test reaching localhost). Every tier MUST pass at 100%; per-tier coverage thresholds live in [CLAUDE.md → Quality Gates](../../CLAUDE.md).

**Rationale**: Coverage numbers are meaningless if tiers leak — flaky local failures masquerade as logic bugs and real regressions hide behind over-mocking. Strict boundaries plus an asymmetric coverage bar (full where mocking is cheap, partial where it is expensive) keep each tier's signal trustworthy without inflating e2e.

### V. Fail Loud, Never Silently Default

User-facing surfaces (CLI parsing, hook output, error paths) MUST surface unrecognized input as an error and exit non-zero — never fall through to a default. A typo MUST NOT silently launch `attach`. A failed proxy start MUST NOT continue to spawn Claude.

**Rationale**: cc-trace runs as the user's HTTPS gateway during a live session. Silent degradation in this position is worse than crashing — the user keeps working, believing capture is happening, while nothing is recorded. Loud failure preserves trust.

### VI. Cautious by Default (Karpathy Guidelines)

All changes — LLM-driven or human — MUST follow these four norms:

1. **Think before coding** — Surface assumptions explicitly. If multiple interpretations exist, present them rather than picking silently. If unclear, ask. Never hide confusion behind code.
2. **Simplicity first** — Write the minimum code that solves the stated problem. No unrequested features, no abstractions for single-use code, no flags or error handling for impossible cases. If 200 lines could be 50, rewrite.
3. **Surgical changes** — Every changed line MUST trace to the request. Do not "improve" adjacent code, formatting, or comments. Match existing style. Remove only orphans your own changes created.
4. **Goal-driven execution** — Convert each task into a verifiable success criterion (typically: a failing test that turns green) and loop until met. "Make it work" is not a criterion.

For trivial tasks (typo fix, single-line tweak), apply judgment over ceremony — the bias remains caution over speed.

**Rationale**: The cheapest bug to fix is the one prevented by a question; the most expensive is the one introduced by a drive-by refactor. These norms keep change footprints small, intent explicit, and review load proportional to the actual problem.

## Operational Boundaries

Concrete platform, runtime, and dependency constraints (macOS-only, Node version, frontend dep policy, redaction format) live in [CLAUDE.md → Constraints](../../CLAUDE.md). Changes to those constraints MUST be reflected in CLAUDE.md and reviewed against the principles above — adding a runtime dependency, a network request, or a second component tree all require constitutional justification.

## Development Workflow

Quality gates, commands, and the pre-commit checklist live in [CLAUDE.md](../../CLAUDE.md). The principles governing how change *flows*:

- **Spec-kit precedence**: Non-trivial changes flow through `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Skipping stages is permitted for trivial fixes only.
- **Single-concern PRs**: One PR, one user story or fix. Bundled refactors hide regressions and inflate review.
- **Conventional Commits**: Required so release notes and version bumps derive mechanically. Prefixes listed in CLAUDE.md.

## Governance

This constitution supersedes ad-hoc convention. Amendments require:

1. A spec-kit feature spec (`/speckit-specify`) describing the principle change and rationale.
2. A version bump (policy below) applied to both the constitution and the Sync Impact Report.
3. Propagation to dependent templates (`.specify/templates/*.md`) and CLAUDE.md, in the same PR.

**Versioning** (semantic):
- **MAJOR**: removing a principle or relaxing a NON-NEGOTIABLE.
- **MINOR**: adding a principle or section, or materially expanding one.
- **PATCH**: clarifications and wording fixes; no semantic change.

**Compliance**: Code review MUST flag any change that conflicts with a principle and SHOULD cite it by name. Intentional conflicts MUST either update the constitution (with version bump) or be rejected — silent drift is not an outcome.

**Version**: 1.1.1 | **Ratified**: 2026-04-26 | **Last Amended**: 2026-04-26
