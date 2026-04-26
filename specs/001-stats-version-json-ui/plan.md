# Implementation Plan: Session Stats Block, Version Display, and JSON Tab UI Improvements

**Branch**: `001-stats-version-json-ui` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-stats-version-json-ui/spec.md`

## Summary

Add a persistent at-a-glance session stats block (turns · requests-by-method · six token totals with `en-US` thousands separators) and a version + ISO-8601 timestamp label rendered consistently in both the static HTML report and the live dashboard from a single React component tree. Improve the JSON tab with a stacked Request/Response layout (sticky labels, independent expand-all/collapse-all per tree, independent expansion state), a single filter input with a `Both | Request | Response` target toggle, hover-revealed copy controls (subtree → pretty JSON + trailing newline; leaves → raw value / JSON literal), and a persistent breadcrumb bar that copies on click. All derivations reuse existing parsing (`parseHttpPairs`, the same SSE/JSON `usage` shapes already read by `TokenMeter`); no new persistence, no new runtime dependency, no new component tree.

## Technical Context

**Language/Version**: TypeScript 5.4, Node.js ≥ 20 (`"os": ["darwin"]`)
**Primary Dependencies**: React 18 (frontend), Express 4 + ws 8 (live server), Vite 5 (frontend bundle), Commander 12 (CLI), node-forge 1 (proxy CA). No new runtime deps for this feature.
**Storage**: JSONL session log on disk; no schema change.
**Testing**: Vitest 2 with v8 coverage. Tiers: `tests/unit/` (mock all I/O, 100% coverage on `src/`), `tests/integration/` (real HTTPS to local servers, 100% on the unit-excluded files), `tests/e2e/` (mock-claude + mock-api, ≥ 70%).
**Target Platform**: macOS-only CLI; bundled React UI runs both from `file://` (self-contained `.html` report) and from the local Express server (live dashboard).
**Project Type**: Single Node CLI project with embedded React frontend bundle.
**Performance Goals**: Live stats re-render throttled to ≤ 4/s (250 ms window) while a stream is in flight; flush an immediate re-render on pair completion (FR-107). Expand-all on a > 1 MB pretty-printed body should remain responsive (no UI lockup beyond ~1 s on a typical developer machine; spec edge case).
**Constraints**: Self-contained `.html` (no network at view time, FR-202); no literal colors in components (theme via CSS vars in `frontend/styles.css`); no `any` / `@ts-ignore`; no `console.log` in `src/` (use `process.stdout.write` / `process.stderr.write`); no new frontend runtime deps beyond React (the JSON tree, copy buttons, breadcrumb, and stats block must be hand-written).
**Scale/Scope**: Three additive UI changes across one component tree (`src/frontend/`); two new pure derivations in `src/shared/` (stats, throttle scheduler) plus one new pure formatter module (`json-path`); one new field in `/api/status` and one new injection in `report/html-generator.ts`. Estimated touch surface: ≤ 12 source files; **3 new unit test files** (`stats.test.ts`, `throttle-scheduler.test.ts`, `json-path.test.ts`) plus extensions to 2 existing files (`html-generator.test.ts`, `live-server.test.ts`). No frontend test framework is introduced (R9 defers React Testing Library out of scope).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Privacy at the Boundary | ✅ Pass | Stats are derived from already-redacted pairs in memory. No new on-disk fields, no new headers logged. Version + timestamp are build/start-time metadata, never user-identifying. |
| II. Self-Contained Artifacts | ✅ Pass | Version string and report-generation timestamp are embedded by `report/html-generator.ts` at generation time (FR-202, FR-204). Stats are derived from the already-embedded pairs payload. No new fonts, no new network calls. |
| III. One Component Tree, Theme via Variables | ✅ Pass | Stats block, version label, and JSON tab improvements live in `src/frontend/` and render identically under `data-mode="static"` and `data-mode="live"`. New colors (if any) MUST land as new CSS vars in `styles.css`, not inline. |
| IV. Test Tiers Have Contracts | ✅ Pass | Pure derivation functions (stats aggregator, breadcrumb formatter, copy formatter) live in `src/shared/` and are unit-testable with no I/O. The `/api/status` `version` field is exercised by an integration test (existing `live-server.test.ts`). HTML embedding of `__CC_TRACE_VERSION__` / `__CC_TRACE_GENERATED_AT__` is exercised by `html-generator.test.ts`. No tier escapes. |
| V. Fail Loud, Never Silently Default | ✅ Pass | Version is read from `package.json` at build time; if the read fails the build fails (no silent default). Timestamp is captured at generation/start time, not at view time — a missing field is a real bug, not a fallback. The CLI surface is unchanged by this feature, so the existing `CliHelpDisplayed` contract is untouched. |
| VI. Cautious by Default (Karpathy) | ✅ Pass | Scope is exactly the three things in the spec. No incidental refactors of `TokenMeter` (reused as-is), `ConversationView`, `RawPairsView`, proxy, or CLI. Each functional requirement maps to a verifiable test (Phase 1 contracts). |

**Result**: All gates pass. No entries required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-stats-version-json-ui/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature specification (already present)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── stats.md         # SessionStats derivation contract
│   ├── version.md       # Version + timestamp surface contract
│   └── json-tab.md      # JSON tab UI contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── attach.ts                  # unchanged by this feature
│   ├── index.ts                   # unchanged
│   └── options.ts                 # unchanged
├── proxy/                         # unchanged (server.ts, cert-manager.ts, forwarder.ts)
├── logger/                        # unchanged (session.ts, jsonl-writer.ts)
├── live-server/
│   ├── server.ts                  # MODIFY — add `version` + `startedAtIso` to /api/status
│   └── broadcaster.ts             # unchanged
├── report/
│   ├── html-generator.ts          # MODIFY — embed __CC_TRACE_VERSION__ + __CC_TRACE_GENERATED_AT__
│   └── template.html              # MODIFY — read version + generatedAt into window.ccTraceMeta
├── shared/
│   ├── types.ts                   # MODIFY — add SessionStats, SessionTokenTotals, CcTraceMeta types
│   ├── conversation.ts            # unchanged
│   ├── stats.ts                   # NEW — pure aggregator: HttpPair[] → SessionStats
│   ├── throttle.ts                # NEW — pure scheduler: { computeNow, scheduleAt } from current+prev tick (testable with vi.useFakeTimers per SC-003)
│   └── json-path.ts               # NEW — pure: format dot/bracket path, copy formatter
└── frontend/
    ├── App.tsx                    # MODIFY — render <StatsBlock> + version label, drop existing `as unknown as { ccTraceData? }` cast
    ├── window.d.ts                # NEW — global Window augmentation: `ccTraceData?: HttpPair[]`, `ccTraceMeta?: CcTraceMeta`
    ├── styles.css                 # MODIFY — new CSS vars + classes for stats pills, breadcrumb, sticky labels
    ├── hooks/
    │   ├── useWebSocket.ts        # MODIFY — expose a reconnect counter (consumed by useWsReconnects + VersionLabel for ws-tied refetch)
    │   ├── useWsReconnects.ts     # NEW — sibling hook returning the reconnect counter (keeps useWebSocket's public signature stable)
    │   └── useThrottledStats.ts   # NEW — React wrapper around src/shared/throttle.ts
    └── components/
        ├── StatsBlock.tsx         # NEW
        ├── VersionLabel.tsx       # NEW
        ├── JsonView.tsx           # MODIFY — stacked req/resp, target toggle, breadcrumb, expand-all per tree, copy controls
        ├── ConversationView.tsx   # unchanged
        ├── RawPairsView.tsx       # unchanged
        └── TokenMeter.tsx         # unchanged

tests/
├── unit/
│   ├── stats.test.ts              # NEW — 100% coverage of src/shared/stats.ts
│   ├── throttle-scheduler.test.ts # NEW — 100% coverage of src/shared/throttle.ts (vi.useFakeTimers, SC-003 timing assertion)
│   ├── json-path.test.ts          # NEW — 100% coverage of src/shared/json-path.ts
│   ├── html-generator.test.ts     # MODIFY — assert version + generatedAt embedded
│   └── (existing tests unchanged)
├── integration/
│   └── live-server.test.ts        # MODIFY — assert /api/status returns version + startedAtIso
└── e2e/
    └── attach.test.ts             # unchanged (HTML-report version embedding covered by unit)
```

**Structure Decision**: Single project (Option 1) — the existing layout. The feature is additive to `src/frontend/`, `src/shared/`, `src/report/`, and `src/live-server/`. Pure derivations (stats, json-path/copy formatters) land in `src/shared/` so they are Node-free and importable by both backend and the Vite frontend bundle, and so they are unit-testable at the 100% bar set by Quality Gates.

## Complexity Tracking

> No constitutional violations to justify. Section intentionally empty.
