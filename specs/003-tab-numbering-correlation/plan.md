# Implementation Plan: Cross-Tab Pair-Number Correlation

**Branch**: `003-tab-numbering-correlation` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-tab-numbering-correlation/spec.md`

## Summary

Assign every captured HTTP pair a stable, session-global, 1-based ordinal **at request-receive time**, persist it as a `pairIndex` field on each JSONL record, and surface it as a visible label in three frontend tabs:
- **Transcript** keeps `Turn NN` (unchanged surface, but driven by `pairIndex` instead of a render-time counter).
- **Pairs** gains a leading `Pair NN` label.
- **JSON** gains a `Pair NN` label in each Request/Response section header.

In live mode, the proxy emits a new `'pair-pending'` event on request entry so Pairs/JSON render an in-flight row immediately; the existing `'pair'` event hydrates the same row in place. Failed in-flight pairs (abort, timeout, proxy exit) persist with a `status` discriminator and keep their assigned index permanently. The `StatsBlock.turns` count switches from `includeAll: true` to the active filter setting so it equals the visible Transcript row count.

## Technical Context

**Language/Version**: TypeScript 5.4, Node 20+ (target macOS only, per CLAUDE.md)
**Primary Dependencies**: React 18, Express 4, ws 8, commander 12, node-forge 1 (no new runtime deps)
**Storage**: Append-only JSONL files under `.cc-trace/` (one record per pair, schema additive)
**Testing**: vitest 2 (unit/integration/e2e tiers per Constitution Principle IV)
**Target Platform**: macOS (`"os": ["darwin"]`); rendered HTML report opens from `file://`
**Project Type**: Single-process CLI + bundled React frontend (existing structure from spec 002)
**Performance Goals**: SC-001 — visual scan resolves any cross-tab number in ≤3 s (purely a layout/labelling outcome; no perf budget on hot paths)
**Constraints**: Zero new external network requests (Principle II); `pairIndex` field MUST be additive (legacy JSONL still loadable); no literal colors in components (CLAUDE.md)
**Scale/Scope**: ~5 files modified across proxy/logger/live-server/frontend/shared; ~3 new event/message types; 12 functional requirements (FR-001…FR-012)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Notes |
|-----------|---------|-------|
| **I. Privacy at the Boundary** | **PASS** | No new credential surfaces; `pairIndex` is a non-sensitive ordinal. Existing redaction in `forwarder.ts` unchanged. |
| **II. Self-Contained Artifacts** | **PASS** | No new runtime deps; all changes are pure TS/CSS bundled into the same IIFE. Report still opens from `file://` with zero requests. |
| **III. One Component Tree, Theme via Variables** | **PASS** | Pending-state styling lands as a new CSS variable on `:root[data-mode]`. No mode-branching components added. |
| **IV. Test Tiers Have Contracts** | **PASS (with action)** | Adds: unit tests for the new `pair-pending` event ordering, jsonl-writer `pairIndex` persistence, broadcaster pending/hydrate sequencing, stats `turnCount` filter alignment; integration test for proxy → broadcaster → loader round-trip with abort. Each tier respects its existing I/O boundary. |
| **V. Fail Loud, Never Silently Default** | **PASS** | Loader MUST treat `pairIndex` collision (two records with the same index in one file) as a hard error, not silent dedup. Spec FR-012 already requires loud terminal status for failed pairs. |
| **VI. Cautious by Default (Karpathy)** | **PASS** | Surgical: only the named files change. No "while I'm here" refactors of the conversation parser or JSON tree renderer. |
| **VII. Security Beyond the Capture Boundary** | **PASS** | `pairIndex` is a number — never interpolated into HTML, attributes, or eval. No new dependency. CA key path untouched. |

**Result**: All gates pass. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/003-tab-numbering-correlation/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions
├── data-model.md        # Phase 1 output — JSONL + event + WS message shapes
├── quickstart.md        # Phase 1 output — manual verification recipe
├── contracts/
│   ├── jsonl-record.md      # Persisted record shape (additive `pairIndex` + optional `status`)
│   ├── proxy-events.md      # `'pair-pending'` + `'pair'` event ordering contract
│   └── ws-messages.md       # WebSocket message types for pending → hydrate flow
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

The cc-trace structure is already established by spec 002. Only the files touched by this feature are listed; everything else is unchanged.

```text
src/
├── proxy/
│   ├── server.ts                # MODIFY — emit 'pair-pending' on request entry; pass pairIndex through
│   └── forwarder.ts             # READ-ONLY — no changes
├── logger/
│   └── jsonl-writer.ts          # MODIFY — write pairIndex + optional status field; flush pending-only records on abort
├── live-server/
│   ├── broadcaster.ts           # MODIFY — track in-flight pairs; emit 'pair-pending' / 'pair' WS messages
│   └── server.ts                # MODIFY — /api/pairs returns pending + completed; /api/status unchanged
├── shared/
│   ├── types.ts                 # MODIFY — add pairIndex (number) and optional status to HttpPair; add WSMessage union
│   └── pair-index.ts            # NEW — pure helpers: padWidth(n), formatPairLabel(idx, width)
└── frontend/
    ├── conversation/
    │   ├── ConversationView.tsx # MODIFY — drop globalTurn counter; read pairIndex from each pair
    │   └── TurnRow.tsx          # MODIFY — render `Turn {formatPairLabel(pair.pairIndex, width)}`
    ├── rawPairs/
    │   └── RawPairsView.tsx     # MODIFY — leading `Pair NN` column with pending state styling
    ├── jsonView/
    │   └── JsonView.tsx         # MODIFY — visible `Pair NN` in section header (was aria-label only)
    └── stats/
        └── stats.ts             # MODIFY — turnCount uses active filter, not includeAll: true

tests/
├── unit/
│   ├── jsonl-writer.test.ts     # MODIFY — assert pairIndex written; legacy fallback derivation
│   ├── broadcaster.test.ts      # MODIFY — pending-then-hydrate ordering; abort produces terminal record
│   ├── conversation.test.ts     # MODIFY — turnCount equals visible row count; filter toggle stability
│   ├── stats.test.ts            # MODIFY — turnCount tracks filter
│   └── pair-index.test.ts       # NEW — padWidth, formatPairLabel
└── integration/
    ├── live-server.test.ts      # MODIFY — pending → hydrate WS sequence; aborted in-flight persists
    └── proxy.test.ts            # MODIFY — request-entry event fires before forwarder completes
```

**Structure Decision**: Reuse the spec-002 single-project structure. The only new file is `src/shared/pair-index.ts` (pure helpers — fits the existing `shared/` convention for Node-free cross-tier code). All other changes are additive edits to existing modules.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
