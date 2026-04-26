# Implementation Plan: Structural Refactor

**Branch**: `002-structural-refactor` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-structural-refactor/spec.md`

## Summary

Non-behavioral restructure of `src/`. Four user stories executed in fixed order: (US1) split files >250 LOC into single-purpose modules, (US2) consolidate duplicated PKG_VERSION reads + template-token substitution + status-meta hydration, (US3) move single-feature modules out of `src/shared/` into per-feature folders under `src/frontend/`, (US4) replace inline `as { ... }` narrowing with named type guards exported from `src/shared/`. The entire test suite is the binding contract — no test assertion may change; only `import` paths may move. A bundle-size assertion is added in US1's PR to gate FR-011.

## Technical Context

**Language/Version**: TypeScript 5.x, Node ≥20 (uses `node:crypto`)
**Primary Dependencies**: React 18 (frontend), Express + `ws` (live server), Vite (frontend bundler), `vitest` (test runner), Biome (lint/format), Commander (CLI parsing). No new dependencies introduced by this refactor.
**Storage**: Filesystem only — JSONL session logs and HTML reports under `~/.cc-trace/sessions/`. No database.
**Testing**: `vitest` with v8 coverage. Three tiers: `tests/unit/` (mocks all I/O, 100% coverage on `src/` minus exclusions), `tests/integration/` (real local HTTPS, 100% on excluded files), `tests/e2e/` (mock-claude + mock-api, ≥70%).
**Target Platform**: macOS only (`"os": ["darwin"]`); HTML report opens from `file://` on any platform with a modern browser.
**Project Type**: CLI tool with embedded React frontend (single Node project, single-package layout)
**Performance Goals**: HTML report bundle byte-size within ±2% of pre-refactor baseline (FR-011); no runtime performance change targeted (refactor only).
**Constraints**: Self-contained `.html` output (no external network requests), no `any`/`@ts-ignore`/`as unknown as X` in source, no `console.log` in `src/`, no literal colors in components (CSS variables only), no new frontend runtime deps.
**Scale/Scope**: ~1900 LOC across `src/`; 31 source files; 5 user-facing UI features (StatsBlock, VersionLabel, ConversationView, JsonView, RawPairsView). Refactor touches ~20 source files and updates `import` paths in ~15 test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|---|---|---|
| I. Privacy at the Boundary | PASS | Refactor does not alter `proxy/forwarder.ts` redaction logic; FR-009 freezes wire-protocol behavior. |
| II. Self-Contained Artifacts | PASS | FR-011 + new e2e bundle-size assertion enforce this directly. |
| III. One Component Tree, Theme via Variables | PASS | US3 reorganizes folders but does not branch the tree; CSS variables in `styles.css` remain the single themer. |
| IV. Test Tiers Have Contracts | PASS | FR-001 forbids changing test assertions; FR-014 ensures the unit/integration boundary survives splits. |
| V. Fail Loud, Never Silently Default | PASS | No CLI parsing or error-path code is structurally changed by this refactor; US4's type guards REPLACE silent casts with explicit predicates — this strengthens loud-failure posture. |
| VI. Cautious by Default (Karpathy) | PASS | Spec went through `/speckit-clarify` twice (8 questions resolved); each user story is bounded; FR-012 fixes merge order; complexity tracking below is empty. |

**Initial Constitution Check: PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/002-structural-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 — three open layout questions resolved
├── data-model.md        # Phase 1 — explicit file move/split table
├── quickstart.md        # Phase 1 — validation checklist a reviewer runs per PR
├── contracts/
│   ├── cli-surface.md      # Frozen CLI behavior (binding via tests/e2e/)
│   └── wire-schemas.md     # Frozen JSONL line + WS frame shapes (binding via integration)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

**Pre-refactor (current)** — flat-by-kind layout:

```text
src/
├── cli/
│   ├── commands/attach.ts
│   ├── index.ts
│   └── options.ts
├── frontend/
│   ├── App.tsx
│   ├── components/
│   │   ├── ConversationView.tsx        # 279 LOC → split (US1)
│   │   ├── JsonView.tsx                # 394 LOC → split (US1)
│   │   ├── RawPairsView.tsx
│   │   ├── StatsBlock.tsx
│   │   ├── TokenMeter.tsx
│   │   └── VersionLabel.tsx
│   ├── hooks/
│   │   ├── useThrottledStats.ts
│   │   ├── useWebSocket.ts
│   │   └── useWsReconnects.ts
│   ├── index.html
│   ├── index.tsx
│   ├── styles.css
│   └── window.d.ts
├── live-server/
│   ├── broadcaster.ts
│   └── server.ts                       # PKG_VERSION + status-meta dup site
├── logger/
│   ├── jsonl-writer.ts
│   └── session.ts
├── proxy/
│   ├── cert-manager.ts
│   ├── forwarder.ts
│   └── server.ts
├── report/
│   ├── html-generator.ts               # PKG_VERSION + token-substitution chain dup site
│   └── template.html
└── shared/
    ├── conversation.ts                 # MOVE → frontend/conversation/ (US3)
    ├── json-path.ts                    # MOVE → frontend/jsonView/ (US3)
    ├── stats.ts                        # MOVE → frontend/stats/ (US3)
    ├── throttle.ts                     # MOVE → frontend/stats/ (US3)
    └── types.ts                        # STAYS (cross-boundary)
```

**Post-refactor (target)** — feature-folder layout under `src/frontend/`, kind-folder layout retained on the backend (no contributor-discoverability win there since each kind already maps to one concern):

```text
src/
├── cli/                                # unchanged (e2e contract surface)
│   ├── commands/attach.ts
│   ├── index.ts
│   └── options.ts
├── frontend/
│   ├── App.tsx
│   ├── conversation/                   # NEW — US3
│   │   ├── ConversationView.tsx        # facade + container (≤200 LOC)
│   │   ├── TurnRow.tsx                 # extracted in US1
│   │   ├── ExhibitList.tsx             # extracted in US1
│   │   ├── conversation.ts             # moved from shared/ in US3
│   │   └── TokenMeter.tsx              # moved here (single consumer)
│   ├── jsonView/                       # NEW — US3
│   │   ├── JsonView.tsx                # facade + container (≤200 LOC)
│   │   ├── JsonTree.tsx                # extracted in US1 — renderer + reducer dispatch
│   │   ├── jsonViewReducer.ts          # extracted in US1 — state machine only
│   │   ├── JsonNode.tsx                # extracted in US1 — single-row renderer
│   │   ├── JsonBreadcrumb.tsx          # extracted in US1
│   │   └── json-path.ts                # moved from shared/ in US3
│   ├── rawPairs/                       # NEW — US3
│   │   └── RawPairsView.tsx
│   ├── stats/                          # NEW — US3
│   │   ├── StatsBlock.tsx
│   │   ├── useThrottledStats.ts
│   │   ├── stats.ts                    # moved from shared/
│   │   └── throttle.ts                 # moved from shared/
│   ├── versionLabel/                   # NEW — US3
│   │   ├── VersionLabel.tsx
│   │   ├── useWebSocket.ts             # see Phase 0 R1
│   │   └── useWsReconnects.ts
│   ├── index.html
│   ├── index.tsx
│   ├── styles.css                      # remains a single global file (see Phase 0 R3)
│   └── window.d.ts                     # remains here (see Phase 0 R2)
├── live-server/
│   ├── broadcaster.ts
│   └── server.ts                       # imports shared/version.ts, shared/template.ts after US2
├── logger/                             # unchanged
├── proxy/                              # unchanged
├── report/
│   ├── html-generator.ts               # imports shared/version.ts, shared/template.ts after US2
│   └── template.html
└── shared/
    ├── types.ts                        # STAYS
    ├── version.ts                      # NEW (US2) — single PKG_VERSION read + export
    ├── template.ts                     # NEW (US2) — substituteTokens(template, map) helper
    └── guards.ts                       # NEW (US4) — type guards (isStatusMeta, isWsFrame, ...)

tests/
├── unit/                               # parallel layout preserved per Q1
├── integration/
└── e2e/
    ├── attach.test.ts
    ├── bundle-size.test.ts             # NEW (US1) — FR-011 / SC-006 enforcement
    └── fixtures/
        └── ...                         # mock-claude session JSONL acts as bundle-size baseline source
```

**Structure Decision**: Hybrid layout — feature folders under `src/frontend/` (where five distinct UI features benefit from colocation), kind folders preserved on the backend (`cli/`, `live-server/`, `logger/`, `proxy/`, `report/`) where each directory already has one cohesive concern. `src/shared/` shrinks to genuine cross-boundary code: `types.ts`, plus US2's `version.ts` + `template.ts`, plus US4's `guards.ts`. `tests/` directory layout is unchanged per clarification Q1.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Table intentionally empty.

---

## Phase Outputs

Phase 0 (`research.md`), Phase 1 (`data-model.md`, `contracts/`, `quickstart.md`) are generated as separate files in this directory. The agent context update writes the plan reference into `CLAUDE.md` between the `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` markers.

**Re-evaluation after Phase 1**: Constitution Check re-run at the bottom of `research.md` after Phase 0 decisions are recorded; expected to remain PASS since no decision below introduces new dependencies, branches the component tree, or changes wire format.
