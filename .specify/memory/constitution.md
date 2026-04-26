<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (MINOR — added Principle VI; expanded Principle IV with explicit tier thresholds)
- Modified principles:
  - IV. Test Tiers Have Contracts → expanded with per-tier coverage thresholds (defers to CLAUDE.md for numbers)
- Added sections:
  - VI. Cautious by Default (Karpathy Guidelines) — new principle covering: think-first, simplicity, surgical edits, goal-driven verification
- Removed sections: none
- Templates requiring updates:
  ✅ .specify/templates/plan-template.md (no constitution-driven structural changes)
  ✅ .specify/templates/spec-template.md (no constitution-driven mandatory sections introduced)
  ✅ .specify/templates/tasks-template.md (no new principle-driven task categories introduced)
  ✅ CLAUDE.md — updated: Quality Gates now lists per-tier test thresholds (unit 100% / integration 100% / e2e ≥70%, all 100% pass); new "Working Norms" section references Principle VI

Prior ratification:
- 1.0.0 (2026-04-26): initial ratification — Core Principles I–V, Operational Boundaries, Development Workflow, Governance.
-->

# cc-trace Constitution

This constitution states the non-negotiable principles that govern how cc-trace
is designed, built, and shipped. **Concrete rules, commands, file paths, and
quality gates live in [CLAUDE.md](../../CLAUDE.md)** — this document is
deliberately complementary, not duplicative. When a rule in CLAUDE.md
elaborates a principle here, CLAUDE.md is authoritative for the *what*; this
constitution is authoritative for the *why* and the spirit.

## Core Principles

### I. Privacy at the Boundary (NON-NEGOTIABLE)

Captured traffic MUST be sanitized before it touches disk, the wire, or any
rendered artifact. Credentials, bearer tokens, and operator-identifying headers
MUST be redacted at the proxy boundary, never downstream. A generated report
or live dashboard MUST be safe to share with a teammate without further
review.

**Rationale**: cc-trace is a debugging lens on a long-lived authenticated
session; one un-redacted log spreads further than one un-redacted bug.
Redacting late means redacting *probably*. Redacting at the boundary means
redacting *always*.

### II. Self-Contained Artifacts

Generated `.html` reports MUST open from `file://` with zero network requests.
The live dashboard MUST run entirely from the local Node process. No CDN, no
analytics, no font URL, no telemetry — nothing the recipient's network has to
allow.

**Rationale**: A report that needs the internet is a report that breaks on
airplanes, in regulated environments, six months from now, and inside the
attachments folder of an issue tracker. Self-containment is the property that
makes a report a *durable* artifact rather than a *fresh* one.

### III. One Component Tree, Theme via Variables

Static reports and the live dashboard MUST render from the **same** React
component tree. Mode-specific behavior is selected by `:root[data-mode]` and
CSS variables, never by branching components or duplicating views. New visual
treatments MUST land as variables, not literal values, in components.

**Rationale**: Two parallel frontends rot at different rates. Variable-driven
theming forces design changes through one code path and keeps the static and
live aesthetics provably in sync at the structural level.

### IV. Test Tiers Have Contracts

The three test tiers each have a fixed input/output boundary that MUST be
respected: unit tests mock all I/O, integration tests use real local servers
(no Anthropic API), e2e tests drive the full attach lifecycle through
mock-claude and mock-api. A test MUST NOT escape its tier's boundary
(e.g., a unit test reaching localhost, or an integration test calling
production). Every tier MUST pass at 100%; per-tier coverage thresholds are
documented in [CLAUDE.md → Quality Gates](../../CLAUDE.md) (currently:
unit 100%, integration 100%, e2e ≥70%).

**Rationale**: Coverage numbers are meaningless if tiers leak into each
other — flaky local-only failures masquerade as logic bugs, and real
regressions hide behind over-mocking. Strict tier boundaries plus an
asymmetric coverage bar (full coverage where mocking is cheap, partial where
it is expensive) make each tier's signal trustworthy without inflating the
e2e suite into a maintenance burden.

### V. Fail Loud, Never Silently Default

User-facing surfaces (CLI flag parsing, hook outputs, error paths) MUST
surface unrecognized input as an error and exit non-zero, never fall through
to a default action. A typo MUST NOT silently launch `attach`. A failed proxy
start MUST NOT continue to spawn Claude.

**Rationale**: cc-trace runs as the user's HTTPS gateway during a live coding
session. Silent degradation in this position is worse than crashing — the user
keeps working, believing they are being captured, while nothing is recorded.
Loud failure preserves trust.

### VI. Cautious by Default (Karpathy Guidelines)

LLM-driven and human-driven changes alike MUST follow these four norms,
adapted from Andrej Karpathy's observations on common LLM coding pitfalls:

1. **Think before coding** — Surface assumptions explicitly. If multiple
   interpretations exist, present them rather than picking silently. If
   something is unclear, stop and ask. Never hide confusion behind code.
2. **Simplicity first** — Write the minimum code that solves the stated
   problem. No features that were not asked for; no abstractions for
   single-use code; no flags, configurability, or error handling for
   scenarios that cannot occur. If 200 lines could be 50, rewrite it.
3. **Surgical changes** — Every changed line MUST trace directly to the
   request. Do not "improve" adjacent code, comments, or formatting. Do not
   refactor things that are not broken. Match existing style. Remove only
   the orphans your own changes created.
4. **Goal-driven execution** — Convert each task into a verifiable success
   criterion (typically: a failing test that becomes green, or a check that
   passes) and loop until that criterion is met. "Make it work" is not a
   criterion.

For trivial tasks (typo fix, single-line tweak), apply judgment rather than
ceremony — but the bias remains caution over speed.

**Rationale**: The cheapest bug to fix is the one prevented by a question;
the most expensive is the one introduced by a drive-by refactor. These four
norms collectively keep change footprints small, intent explicit, and review
load proportional to the actual problem.

## Operational Boundaries

Concrete platform, runtime, and dependency constraints (macOS-only, Node
version, frontend dependency policy, redaction format, etc.) are documented
in [CLAUDE.md → Constraints](../../CLAUDE.md). Changes to those constraints
MUST be reflected in CLAUDE.md and reviewed against the principles above —
adding a runtime dependency, a network request, or a second component tree
all require constitutional justification.

## Development Workflow

Quality gates, commands, and the pre-commit checklist live in
[CLAUDE.md → Quality Gates / Commands](../../CLAUDE.md). The principles
that govern how change *flows* are:

- **Spec-kit precedence**: Non-trivial changes flow through
  `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks`
  → `/speckit-implement`. Skipping stages is permitted for trivial fixes
  (typos, doc tweaks, single-line bug fixes); for anything user-visible, the
  spec is the source of truth.
- **Single-concern PRs**: One PR addresses one user story or one fix. Bundled
  refactors hide regressions and inflate review cost.
- **Conventional Commits**: Commit prefixes (`feat:`, `fix:`, `test:`,
  `chore:`, `docs:`) are required so release notes and version bumps can be
  derived mechanically.

## Governance

This constitution supersedes ad-hoc convention. Amendments require:

1. A spec-kit feature spec (`/speckit-specify`) describing the principle change
   and its rationale.
2. A version bump per the policy below, applied to the constitution and to
   the Sync Impact Report at the top of this file.
3. Propagation to dependent templates (`.specify/templates/*.md`) and to
   CLAUDE.md where concrete rules are affected, in the same PR.

**Versioning policy** (semantic):
- **MAJOR**: removing a principle, or redefining one in a backward-incompatible
  way (e.g., relaxing a NON-NEGOTIABLE).
- **MINOR**: adding a principle or section, or materially expanding one.
- **PATCH**: clarifications, wording fixes, no semantic change.

**Compliance**: Code review MUST flag any change that conflicts with a
principle. The reviewer SHOULD cite the principle by name. If a conflict is
intentional, the PR MUST either update the constitution (with version bump)
or be rejected — silent drift is not an outcome.

**Version**: 1.1.0 | **Ratified**: 2026-04-26 | **Last Amended**: 2026-04-26
