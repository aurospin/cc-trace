<!--
Sync Impact Report
- Version change: 1.2.2 → 1.2.3 (PATCH — rationales compressed to single sentences; Operational Boundaries, Development Workflow, and Governance tightened; no semantic change)
- Modified principles: I–VII (rationale wording only); Operational Boundaries; Development Workflow; Governance
- Added sections: none
- Removed sections: none
- Templates requiring updates: none

Prior history:
- 1.2.2 (2026-04-26): Principle IV wording tightened; CLAUDE.md pass-rate duplication removed.
- 1.2.1 (2026-04-26): Principle VII rationale tightened; CLAUDE.md duplication trimmed.
- 1.2.0 (2026-04-26): added Principle VII (Security Beyond the Capture Boundary); CLAUDE.md gained Security section.
- 1.1.1 (2026-04-26): wording tightened across I–VI; cross-file duplication with CLAUDE.md removed.
- 1.1.0 (2026-04-26): added Principle VI (Karpathy Guidelines); expanded Principle IV with explicit per-tier thresholds.
- 1.0.0 (2026-04-26): initial ratification — Principles I–V, Operational Boundaries, Workflow, Governance.
-->

# cc-trace Constitution

The non-negotiable principles governing how cc-trace is designed, built, and shipped. Concrete rules, commands, and numbers live in [CLAUDE.md](../../CLAUDE.md).

## Core Principles

### I. Privacy at the Boundary (NON-NEGOTIABLE)

Captured traffic MUST be sanitized at the proxy boundary before it touches disk, the wire, or any rendered artifact. Credentials, bearer tokens, and operator-identifying headers MUST be redacted there — never downstream. A generated report or live dashboard MUST be safe to share without further review.

**Rationale**: Late redaction is probable; boundary redaction is certain.

### II. Self-Contained Artifacts

Generated `.html` reports MUST open from `file://` with zero network requests. The live dashboard MUST run entirely from the local Node process — no CDN, analytics, font URL, or telemetry.

**Rationale**: A report that needs the internet breaks on airplanes, in regulated environments, and as CDNs age.

### III. One Component Tree, Theme via Variables

Static reports and the live dashboard MUST render from the same React component tree. Mode-specific behavior is selected via `:root[data-mode]` and CSS variables — never by branching components or duplicating views. New visual treatments land as variables, not literal values.

**Rationale**: Two parallel frontends rot at different rates; variable-driven theming forces all design changes through one path.

### IV. Test Tiers Have Contracts

Each tier has a fixed I/O boundary — unit mocks all I/O, integration uses real local servers (no Anthropic API), e2e drives the full attach lifecycle through mock-claude and mock-api — and a test MUST NOT escape it. Every tier MUST pass 100%; per-tier coverage thresholds live in [CLAUDE.md → Quality Gates](../../CLAUDE.md).

**Rationale**: Leaking tiers let flaky failures masquerade as logic bugs and hide real regressions behind over-mocking.

### V. Fail Loud, Never Silently Default

User-facing surfaces (CLI parsing, hook output, error paths) MUST surface unrecognized input as an error and exit non-zero — never fall through to a default. A typo MUST NOT silently launch `attach`. A failed proxy start MUST NOT continue to spawn Claude.

**Rationale**: cc-trace is the user's HTTPS gateway; silent degradation is worse than crashing — the user keeps working while nothing is recorded.

### VI. Cautious by Default (Karpathy Guidelines)

All changes — LLM-driven or human — MUST follow these four norms:

1. **Think before coding** — Surface assumptions explicitly. If multiple interpretations exist, present them rather than picking silently. Ask when unclear.
2. **Simplicity first** — Minimum code for the stated problem. No unrequested features, abstractions for single-use code, or error handling for impossible cases.
3. **Surgical changes** — Every changed line traces to the request. Don't improve adjacent code, formatting, or comments. Remove only orphans your changes created.
4. **Goal-driven execution** — Define a verifiable success criterion (typically: a failing test that turns green) before writing code.

For trivial tasks (typo fix, single-line tweak), apply judgment over ceremony.

**Rationale**: The cheapest bug is the one prevented by a question; these norms keep footprints small and review proportional to the problem.

### VII. Security Beyond the Capture Boundary

Principle I governs what enters disk; this governs everything afterward. Captured payloads MUST be treated as adversary-controlled when re-rendered — model output and tool input are arbitrary bytes reaching a JavaScript viewer. The MITM CA private key is host-wide TLS-forging material and MUST stay local, restricted, and absent from every shared artifact (report, JSONL, log, stack trace). New runtime dependencies MUST be reviewed for install-time scripts, network behavior, and ownership churn before merge.

**Rationale**: Principle I protects credentials at capture; this protects everyone downstream — a backdoored dep inherits every credential the process holds.

## Operational Boundaries

Platform, runtime, and dependency constraints live in [CLAUDE.md → Constraints](../../CLAUDE.md). Adding a runtime dep, a network request, or a second component tree each require a principle-level justification.

## Development Workflow

- **Spec-kit precedence**: Non-trivial changes: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Trivial fixes may skip stages.
- **Single-concern PRs**: One PR, one user story or fix. Bundled refactors hide regressions.
- **Conventional Commits**: Required for mechanical release notes. Prefixes listed in [CLAUDE.md](../../CLAUDE.md).

## Governance

Amendments require:
1. A spec-kit feature spec (`/speckit-specify`) describing the change and rationale.
2. A version bump applied to both the constitution and the Sync Impact Report.
3. Propagation to dependent templates (`.specify/templates/*.md`) and CLAUDE.md in the same PR.

**Versioning** (semantic):
- **MAJOR**: removing a principle or relaxing a NON-NEGOTIABLE.
- **MINOR**: adding a principle or section, or materially expanding one.
- **PATCH**: clarifications and wording fixes; no semantic change.

**Compliance**: Code review MUST flag conflicts by principle name. Intentional conflicts MUST update the constitution or be rejected.

**Version**: 1.2.3 | **Ratified**: 2026-04-26 | **Last Amended**: 2026-04-27
