---
description: "Task list for 001-stats-version-json-ui"
---

# Tasks: Session Stats Block, Version Display, and JSON Tab UI Improvements

**Input**: Design documents from `/specs/001-stats-version-json-ui/`
**Prerequisites**: plan.md, spec.md (with 2026-04-26 clarifications Q1–Q4), research.md, data-model.md, contracts/ (stats.md, version.md, json-tab.md), quickstart.md

**Tests**: Required by Constitution Principle IV + Quality Gates in CLAUDE.md (100% unit on `src/` excluding `frontend/` + `proxy/server.ts` + `proxy/forwarder.ts` + `live-server/server.ts`; 100% integration on those files; ≥ 70% e2e). All test tasks below are mandatory.

**Organization**: Three user stories from spec.md (US1 P1 stats; US2 P2 version; US3 P2 JSON tab). Each is independently testable per its Independent Test section.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Different file, no dependency on an incomplete task — safe to run in parallel.
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no Story label).
- File paths are absolute-from-repo-root.

## Path Conventions

Single project (matches `plan.md` `Structure Decision`). All source under `src/`, all tests under `tests/{unit,integration,e2e}/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new tooling needed — TypeScript, Vite, Vitest, Biome, React are already wired. This phase is a pre-flight check only.

- [X] T001 Run baseline `npm run lint && npm run typecheck && npm run test:unit && npm run test:integration && npm run test:e2e` from repo root and confirm all tiers green on `001-stats-version-json-ui` before any code changes; record any pre-existing failures in the PR description so they aren't attributed to this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared type declarations consumed by US1 and US2. No user-facing behavior change.

**⚠️ CRITICAL**: User stories MUST NOT begin until Phase 2 is complete.

- [X] T002 Add `SessionStats`, `SessionTokenTotals`, and `CcTraceMeta` interfaces to `src/shared/types.ts` per `data-model.md` (export new types only — do not modify existing types). Run `npm run typecheck` to confirm.
- [X] T003 Create `src/frontend/window.d.ts` with a global `interface Window` augmentation declaring `ccTraceData?: HttpPair[]` and `ccTraceMeta?: CcTraceMeta`, importing both types from `../shared/types.js`. This eliminates the existing per-cast `as unknown as { ccTraceData?: HttpPair[] }` pattern in `App.tsx` and lets `<VersionLabel>` read `window.ccTraceMeta` without re-declaring the type. Update `App.tsx` to drop the local cast (the existing `STATIC_DATA` extraction can simplify to `window.ccTraceData ?? null`). Verify `npm run typecheck` still passes.

**Checkpoint**: Foundation ready — US1, US2, and US3 may now proceed in parallel.

---

## Phase 3: User Story 1 — At-a-Glance Session Stats Block (Priority: P1) 🎯 MVP

**Goal**: A single-row stats block at the top of every page (static report and live dashboard) showing turn count, request count + per-method breakdown, and six independent token totals, all with `en-US` thousands separators. Live mode updates incrementally with throttled re-renders (≤ 4/s) and an immediate flush on pair completion. Per spec Q1, `turnCount` is fixed (always `includeAll: true`) and does NOT follow the Conversation tab's "Include single-message turns" toggle.

**Independent Test**: Open any captured `.html` report — stats block shows non-zero values for turns, requests-by-method, and the six token categories. Run `cc-trace attach` — stats update live as pairs arrive without page reload. Toggling the Conversation tab's "Include single-message turns" checkbox MUST NOT change the stats block's turn count. Switching tabs does not hide the block.

### Tests for User Story 1

- [X] T004 [P] [US1] Create `tests/unit/stats.test.ts` covering all 17 contract behaviors C-S-01 … C-S-12 and C-F-01 … C-F-05 from `contracts/stats.md`. Use minimal hand-built `HttpPair` fixtures inline (no I/O). Add one extra fixture: a streaming pair that has `message_start` but no `message_delta` (interrupted stream) — assert `output: 0`, `input` populated (covers spec Edge Case "Streaming response interrupted before final `message_delta`"). Tests must fail initially because `src/shared/stats.ts` does not exist yet.
- [X] T005 [P] [US1] Create `tests/unit/throttle-scheduler.test.ts` covering the pure throttle scheduler (T007) per spec SC-003. Cases: (1) first call with empty history schedules immediate compute; (2) call within window returns no compute, schedules timer for remaining window; (3) call with completed-pair signal flushes immediately, cancelling pending timer; (4) consecutive in-flight updates within 250 ms coalesce to a single recompute; (5) **timing assertion** — given a synthetic pair-completion at `t0`, the next compute fires within 1000 ms of `t0` (uses `vi.useFakeTimers` so the assertion is deterministic on CI). Tests must fail initially because `src/shared/throttle.ts` does not exist yet.

### Implementation for User Story 1

- [X] T006 [US1] Implement `src/shared/stats.ts` exporting `computeStats(pairs: HttpPair[]): SessionStats` and `formatNumber(n: number): string` per `contracts/stats.md` and `data-model.md` derivation rules. `turnCount` MUST always pass `{ includeAll: true }` to `parseHttpPairs` (per spec Q1, fixed regardless of UI toggle). Parse SSE `usage` directly (do NOT call `extractUsage` from `TokenMeter.tsx` — it collapses cache-creation buckets). `formatNumber` uses `new Intl.NumberFormat("en-US")`. Make T004 pass with 100% line + branch coverage.
- [X] T007 [US1] Implement `src/shared/throttle.ts` exporting a pure scheduler `nextRecompute(input: { pairs: HttpPair[]; nowMs: number; lastRecomputeMs: number; windowMs: number }): { computeNow: boolean; scheduleAt: number | null }`. Detection of "pair completed" is encoded by comparing `pairs.length` and `pairs[pairs.length - 1].response !== null` against the previous tick's snapshot (state passed in by caller, not held internally — keeps the function pure). Make T005 pass with 100% line + branch coverage.
- [X] T008 [US1] Create `src/frontend/hooks/useThrottledStats.ts` exporting `useThrottledStats(pairs: HttpPair[], live: boolean, windowMs: number = 250): SessionStats`. The `live` parameter is passed in by the caller (`<StatsBlock>` derives it from a prop, not from probing `window.ccTraceData` — keeps the hook a pure function of its inputs and trivially mockable). When `live === false` (static mode): compute synchronously every render, no timer. When `live === true`: maintain `useState<SessionStats>`, `useRef<number>` for `lastRecomputeMs` and `useRef<number | null>` for the pending timer; on each render, call `nextRecompute(...)` from `src/shared/throttle.ts` and either recompute now (clear pending) or schedule via `setTimeout`. On unmount, clear any pending timer. The hook itself is exempt from unit-coverage gates (lives in `src/frontend/`, which CLAUDE.md excludes).
- [X] T009 [US1] Create `src/frontend/components/StatsBlock.tsx` exporting `<StatsBlock pairs={HttpPair[]} live={boolean} />`. The `live` prop is supplied by `App.tsx` (true when no `window.ccTraceData`, false otherwise) and forwarded to `useThrottledStats(pairs, live)`. Render a single-row container (CSS class `.stats-block`) with: turn-count pill, request-count pill, **one per-method pill for each key in `requestsByMethod` whose value > 0** (POST and GET pills always render even when `0`; other methods render only when seen — addresses analyze finding F5), and the six token pills in the order `cache_read · cache_creation_input_tokens · cache_creation.ephemeral_5m_input_tokens · cache_creation.ephemeral_1h_input_tokens · input · output`. Each pill displays the API field name as a `title` attribute and a shortened label as visible text per spec Assumptions. All numeric values formatted via `formatNumber`. No literal colors — use new CSS vars only.
- [X] T010 [US1] Add CSS variables and `.stats-block`, `.stats-pill`, `.stats-pill-method`, `.stats-pill-token` rules to `src/frontend/styles.css`. New vars: `--stats-pill-bg`, `--stats-pill-fg`, `--stats-pill-border` defined in both `:root` and `:root[data-mode="live"]` blocks. Single-row inline-flex layout, scrolls with the page (no `position: fixed` / `position: sticky`).
- [X] T011 [US1] Wire `<StatsBlock>` into `src/frontend/App.tsx`: render it between `<header className="masthead">` and `<nav className="tabs">` so it stays visible across all tab views. Pass `pairs` from the existing `STATIC_DATA ?? livePairs` source.
- [X] T012 [US1] Add an e2e assertion in `tests/e2e/attach.test.ts` (or its closest existing case) that a generated `.html` contains the string `class="stats-block"` — proving the stats container renders. Do not assert specific numeric values; that contract is covered by T004.

**Checkpoint**: US1 complete — manual smoke test §1 and §2 of `quickstart.md` pass for the stats block; `npm run test:unit` keeps 100% coverage on `src/` (excluding `frontend/`).

---

## Phase 4: User Story 2 — Version Info Display (Priority: P2)

**Goal**: Both static reports and the live dashboard display `<version> · <iso-timestamp>` from a single `<VersionLabel>` component. Static reports embed the values at generation time; live dashboard hydrates from `/api/status`. Per spec Q3, if the live `/api/status` fetch fails, render an empty placeholder and re-attempt the fetch every time the WebSocket reconnects.

**Independent Test**: Build, generate a report, open it — the `package.json` version and an ISO-8601 timestamp render in the masthead. Open the live dashboard — the same shape renders. `GET /api/status` returns new `version` and `startedAtIso` fields. Block `/api/status` once with DevTools; on the next WS reconnect the label populates.

### Tests for User Story 2

- [X] T013 [P] [US2] Extend `tests/unit/html-generator.test.ts` with cases C-V-01, C-V-02, C-V-03 from `contracts/version.md`: assert generated HTML contains `window.ccTraceMeta = { version: "<pkg-version>", generatedAt: "<iso>" }` (regex-match the timestamp), assert two consecutive generations may differ in timestamp but share the same version, assert the inline-fallback template path also embeds `ccTraceMeta`.
- [X] T014 [P] [US2] Extend `tests/integration/live-server.test.ts` with cases C-V-04 and C-V-05 from `contracts/version.md`: start the live server and assert `GET /api/status` JSON includes `version` matching the `package.json` value and `startedAtIso` matching `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$`. For C-V-05, restart and assert `startedAtIso` advances.

### Implementation for User Story 2

- [X] T015 [US2] Modify `src/report/template.html`: add two new placeholders `__CC_TRACE_VERSION__` and `__CC_TRACE_GENERATED_AT__`, and add a second `<script>` block in `<head>` that sets `window.ccTraceMeta = { version: "__CC_TRACE_VERSION__", generatedAt: "__CC_TRACE_GENERATED_AT__" };`. The existing `npm run build:assets` script copies this file as-is — no change required there.
- [X] T016 [US2] Modify `src/report/html-generator.ts`: read `version` from `package.json` once at module load (resolve via `path.join(__dirname, "..", "..", "package.json")`), capture `generatedAt = new Date().toISOString()` inside `generateHTML()`, and add `__CC_TRACE_VERSION__` / `__CC_TRACE_GENERATED_AT__` to the template substitution chain. Update the inline-fallback template (the `v8 ignore`d branch) to also include the `window.ccTraceMeta` script so the contract holds even without `dist/report/template.html`. Make T013 pass.
- [X] T017 [US2] Modify `src/live-server/server.ts`: read `version` from `package.json` at module load (same resolution as T016), capture `startedAtIso = new Date().toISOString()` inside `startLiveServer()`, and extend the `GET /api/status` JSON with `version` and `startedAtIso`. Make T014 pass.
- [X] T018 [P] [US2] Create `src/frontend/components/VersionLabel.tsx` exporting `<VersionLabel />`. On first render, read `window.ccTraceMeta`. If absent (live mode pre-hydration), `fetch("/api/status")`, set `window.ccTraceMeta = { version, generatedAt: startedAtIso }`, and re-render. Render `<span className="version-label">{version} · {generatedAt}</span>`; render an empty fixed-width placeholder `<span className="version-label" />` before hydration (no layout shift, no `unknown` fallback). **Per spec Q3 / Edge Case "Live `/api/status` fetch failure"**: on fetch error, render the empty placeholder. Consume the new sibling hook `useWsReconnects()` (T018a) and re-trigger the `/api/status` fetch via `useEffect` whenever the reconnect counter advances AND `window.ccTraceMeta` is still absent.
- [X] T018a [US2] Modify `src/frontend/hooks/useWebSocket.ts` to maintain a module-level (or hook-internal) reconnect counter that increments on every `connect()` call inside the existing reconnect loop. Create `src/frontend/hooks/useWsReconnects.ts` exporting `useWsReconnects(): number` — a sibling hook that subscribes to that counter and returns the current value. Per research R5a, this keeps `useWebSocket`'s public return signature stable (no breaking change for existing `App.tsx` consumer). Both hook files live under `src/frontend/`, exempt from unit-coverage gates.
- [X] T019 [US2] Add `.version-label` rule and any required CSS vars to `src/frontend/styles.css`. Theme via existing `--ink-soft` / `--ink-mid` variables; do not introduce new colors unless visually required.
- [X] T020 [US2] Wire `<VersionLabel />` into `src/frontend/App.tsx` inside `<div className="masthead-meta">`, after the existing `Listening / Archived` `<span>`. No removal of existing children.
- [X] T021 [US2] Add an e2e assertion in `tests/e2e/attach.test.ts` that the generated `.html` contains the substring `window.ccTraceMeta = ` and matches the current `package.json` version literal — proving end-to-end embedding.

**Checkpoint**: US2 complete — `quickstart.md` §1 and §2 version checklist items pass; `/api/status` payload assertion green; offline + ws-reconnect retry verified manually.

---

## Phase 5: User Story 3 — JSON Tab UI Improvements (Priority: P2)

**Goal**: JSON tab gains a stacked Request/Response layout per pair (single page scroll context with `position: sticky` labels per spec Q2), independent expand/collapse state per tree, per-tree Expand-all / Collapse-all controls, a single filter input with a `Both | Request | Response` target toggle, hover-revealed copy controls (subtree → pretty JSON + trailing newline; leaves → raw value / JSON literal), and a persistent breadcrumb bar that copies the path on click.

**Independent Test**: Open the JSON tab on any captured pair. Verify each acceptance scenario from spec.md US3 plus the manual checklist in `quickstart.md` §3. Confirm only one scrollbar (the page scroll), and that each tree's label sticks to the top while scrolling within that tree's section.

### Tests for User Story 3

- [X] T022 [P] [US3] Create `tests/unit/json-path.test.ts` covering C-J-01 … C-J-15 from `contracts/json-tab.md`. Tests must fail initially because `src/shared/json-path.ts` does not exist yet.

### Implementation for User Story 3

- [X] T023 [US3] Implement `src/shared/json-path.ts` exporting `formatForClipboard(node: unknown): string` and `formatJsonPath(segments: ReadonlyArray<string | number>): string` per `contracts/json-tab.md` rules. Make T022 pass at 100% coverage. Pure functions — no React, no DOM.
- [X] T024 [US3] Refactor `src/frontend/components/JsonView.tsx` layout to render per-pair `<JsonTree label="Request" />` + `<JsonTree label="Response" />` sections inside the existing `.json-tree` container (no nested scroll wrappers — single page scroll per spec Q2). Each `<JsonTree>` is an internal component that owns its expansion state via `useReducer<JsonViewState, JsonViewAction>` keyed by node path (per `data-model.md`). Each `<JsonTree>` exposes its own `Expand all` / `Collapse all` buttons in a small per-tree toolbar; the reducer's `expandAll` / `collapseAll` actions use a sentinel `__all__` key for O(1) lookup. Each tree's `label` renders as a header with `position: sticky; top: 0` inside its section so the label stays visible while the user scrolls past the tree's body in the page scroll. Render each pair section with `key={pair.logged_at + ":" + pairIndex}` so per-pair state resets on selection (FR-306).
- [X] T025 [US3] In `JsonView.tsx`, replace the single hover-driven `hoveredPath` state with `lastFocusedPath` updated on both `onMouseEnter` and `onClick` of each row. Render the breadcrumb as a `<button className="json-breadcrumb">` displaying `lastFocusedPath || "$"`. Click handler calls `navigator.clipboard.writeText(lastFocusedPath || "$")` (preserving the existing silent-failure pattern).
- [X] T026 [US3] In `JsonView.tsx`, add a target-toggle component (three buttons: `Both` / `Request` / `Response`) next to the filter input. State: `const [filterTarget, setFilterTarget] = useState<JsonFilterTarget>("both")`. The `filter` prop passed to a `<JsonTree>` is `filterTarget === "both" || filterTarget === thisSide ? filter : ""`. Switching the target preserves the typed filter expression.
- [X] T027 [US3] In the per-row rendering inside `<JsonTree>`, add a hover-revealed copy `<button className="json-copy">` per row. Click handler calls `navigator.clipboard.writeText(formatForClipboard(data))` from `src/shared/json-path.ts`. Visibility controlled via CSS `:hover` on the row container — no JS hover state.
- [X] T028 [US3] Add CSS to `src/frontend/styles.css`: `.json-breadcrumb`, `.json-copy`, `.json-tree-toolbar`, `.json-target-toggle`, sticky-header style for the per-tree label (`.json-tree-label { position: sticky; top: 0; background: var(--sticky-label-bg); z-index: 1; }`). Add new vars `--breadcrumb-bg`, `--breadcrumb-fg`, `--copy-btn-bg`, `--copy-btn-fg`, `--copy-btn-hover-bg`, `--sticky-label-bg` to both `:root` and `:root[data-mode="live"]` blocks.

**Checkpoint**: US3 complete — `quickstart.md` §3 manual checklist passes; existing JSON-tab functionality (filter, depth indentation, tree rendering) is unchanged or improved (SC-006).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all three stories before merge.

- [X] T029 Run `quickstart.md` §4 edge-case checklist end-to-end: empty session, missing usage fields, failed request with `--include-all-requests`, large body expand-all, live reconnect (including the new VersionLabel re-fetch on WS reconnect from spec Q3).
- [X] T030 Run `npm run lint && npm run typecheck && npm run test:unit && npm run test:integration && npm run test:e2e` — all green. Confirm unit coverage on `src/` (minus the `frontend/` + integration-only files documented in CLAUDE.md) remains 100%.
- [X] T031 Verify Constitution gates: open the generated `.html` from `file://` with DevTools Network panel — zero outbound requests (Principle II); confirm no literal colors landed in any of `StatsBlock.tsx`, `VersionLabel.tsx`, or `JsonView.tsx` (Principle III); confirm no new `any`, `@ts-ignore`, or `console.log` were introduced (CLAUDE.md Code rules).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: T001 — pre-flight, no dependencies.
- **Phase 2 (Foundational)**: T002 → T003 — both block all user stories.
- **Phase 3 (US1)**: depends on Phase 2.
- **Phase 4 (US2)**: depends on Phase 2. **Independent of Phase 3** — can run in parallel with US1.
- **Phase 5 (US3)**: depends on Phase 2. **Independent of Phase 3 and Phase 4** — can run in parallel.
- **Phase 6 (Polish)**: depends on all desired user stories being merged.

### User Story Dependencies

- US1, US2, US3 are mutually independent post-Phase 2. Each modifies a disjoint set of files in `src/frontend/components/`, `src/shared/`, and (for US2) `src/report/` + `src/live-server/`.
- Shared file across stories: `src/frontend/App.tsx` (US1 mounts `<StatsBlock>` at T011, US2 mounts `<VersionLabel>` at T020). These touch different JSX regions and rebase cleanly; sequence them per branch.
- Shared file inside US1+US2+US3: `src/frontend/styles.css` (T010, T019, T028) — coordinate to avoid merge conflicts; merge each story's CSS additions in a single commit.

### Within Each User Story

- Tests (T004, T005, T013, T014, T022) MUST be written before their implementation tasks and MUST FAIL initially (red → green).
- Pure shared modules (T006 stats, T007 throttle, T023 json-path) before the components/hooks that consume them (T008, T009, T024).
- Components before App-level wiring (T011, T020).
- CSS can land in parallel with component scaffolding (different files).

### Parallel Opportunities

- **After Phase 2 completes**: T004, T005, T013, T014, T022 are all `[P]` and write to different files — launch concurrently.
- **Within US2**: T015 (template.html), T016 (html-generator.ts), T017 (server.ts), T018a (useWebSocket + useWsReconnects), T018 (VersionLabel.tsx) all touch different files; can be done in parallel by different developers, but T016 + T017 each need T013/T014 written first (red), and T018 depends on T018a (consumes `useWsReconnects`).
- **Within US3**: T023 (json-path.ts) is independent of `JsonView.tsx` edits and can land first.

---

## Parallel Example: After Phase 2

```bash
# Launch all five test scaffolds together (each writes a different file):
Task: "T004 [P] [US1] Create tests/unit/stats.test.ts per contracts/stats.md"
Task: "T005 [P] [US1] Create tests/unit/throttle-scheduler.test.ts per spec SC-003"
Task: "T013 [P] [US2] Extend tests/unit/html-generator.test.ts per contracts/version.md C-V-01..03"
Task: "T014 [P] [US2] Extend tests/integration/live-server.test.ts per contracts/version.md C-V-04..05"
Task: "T022 [P] [US3] Create tests/unit/json-path.test.ts per contracts/json-tab.md C-J-01..15"
```

```bash
# After tests are red, launch shared-module implementations in parallel:
Task: "T006 [US1] Implement src/shared/stats.ts (makes T004 green)"
Task: "T007 [US1] Implement src/shared/throttle.ts (makes T005 green)"
Task: "T023 [US3] Implement src/shared/json-path.ts (makes T022 green)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 → T001 (baseline)
2. Phase 2 → T002, T003 (types + Window augmentation in place)
3. Phase 3 → T004, T005 (tests red), T006, T007 (tests green), T008 (hook), T009 (component), T010 (CSS), T011 (wire), T012 (e2e)
4. **STOP and VALIDATE**: open a captured `.html` report, run `cc-trace attach`. Confirm stats block renders with correct values, toggle the Conversation tab's "Include single-message turns" — stats must NOT change. Demo.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. **MVP**: ship US1. Six token pills + turn/request counts + live throttling. Self-contained value.
3. Add US2 (version + timestamp + WS-tied refetch). One-day add. Closes the "which build was this" question.
4. Add US3 (JSON tab improvements). Largest UI change but no behavior change to other tabs.
5. Polish phase → ship.

### Parallel Team Strategy

With multiple developers post-Phase-2:
- Dev A → US1 (T004 → T012).
- Dev B → US2 (T013 → T021).
- Dev C → US3 (T022 → T028).
- Single-file conflicts to coordinate: `src/frontend/App.tsx` (US1 + US2 mounts) and `src/frontend/styles.css` (all three stories add classes).

---

## Notes

- [P] = different file, no dependency on incomplete tasks.
- Constitution Principle VI: each task corresponds to a verifiable success criterion (a contract test going green or a `quickstart.md` checklist box ticked). "Make it work" is not the criterion; the contract is.
- Commit after each task or per logical group; conventional-commit prefix `feat:` for US tasks, `test:` for test-only tasks, `chore:` for build/CSS scaffolding, `docs:` for spec edits.
- Verify each red test actually fails before implementing — if a stats test passes against a missing module it's importing the wrong path.
- Stop at any checkpoint and validate independently — the spec's Independent Test sections were written for exactly this.
- Version-bump (`package.json`) and CHANGELOG updates are deliberately NOT in this task list. Per repo convention (recent commits like `9d18506 chore: bump version to 0.2.2`), version bumps happen as separate `chore:` commits at release time, not inside feature PRs.
