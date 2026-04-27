---

description: "Task list for Cross-Tab Pair-Number Correlation"
---

# Tasks: Cross-Tab Pair-Number Correlation

**Input**: Design documents from `specs/003-tab-numbering-correlation/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**User Stories**:
- **US1 (P1)**: Find the same pair in any tab by its number — cross-tab correlation (FR-001–008, FR-010–012)
- **US2 (P2)**: StatsBlock `turns` count matches visible Transcript row count (FR-009)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US1] / [US2]**: Which user story this task belongs to

---

## Phase 1: Foundational — Shared Types + Pure Helpers

**Purpose**: Establish the shared contract (`src/shared/`) that every other layer imports. Must complete before any backend or frontend work can begin.

**⚠️ CRITICAL**: T001 blocks all backend phases. T002 blocks all frontend label-rendering tasks.

- [X] T001 Update `src/shared/types.ts` — add `pairIndex: number` (required) and `status?: PairStatus` to `HttpPair`; add `type PairStatus = "completed" | "aborted" | "timeout"`; add `interface PendingPair { pairIndex: number; request: HttpRequest; startedAt: string }`; replace the existing `WSMessage` type with `type WSMessage = { type: "history"; data: HttpPair[] } | { type: "pair-pending"; data: PendingPair } | { type: "pair"; data: HttpPair }`
- [X] T002 [P] Create `src/shared/pair-index.ts` — export `padWidth(highestIndex: number): number` (returns `Math.max(2, String(highestIndex).length)`); export `formatPairLabel(prefix: "Turn" | "Pair", idx: number, width: number): string` (returns `\`${prefix} ${String(idx).padStart(width, "0")}\``); both functions assert their invariants and throw on violation (idx < 1, width < 2); add JSDoc `@param` / `@returns` on both exports
- [X] T003 Create `tests/unit/pair-index.test.ts` — unit tests for `padWidth`: width=2 for idx 1–99, width=3 for 100–999, width=4 for 1000; unit tests for `formatPairLabel`: `formatPairLabel("Turn", 3, 2)` → `"Turn 03"`, `formatPairLabel("Pair", 42, 3)` → `"Pair 042"`; reject tests: `idx < 1` throws, `width < 2` throws; 100% branch coverage

**Checkpoint**: `npm run test:unit tests/unit/pair-index.test.ts` passes; `npm run typecheck` passes.

---

## Phase 2: Foundational — Backend Pipeline

**Purpose**: Proxy, logger, broadcaster, and live-server get pairIndex awareness. All depend on Phase 1 types. T005, T006, T007 can run in parallel once T004 is complete (they touch different files and subscribe to events T004 emits).

**⚠️ CRITICAL**: T004 must complete before T005–T007 can be tested end-to-end. T005–T007 can be coded in parallel using the event contract from `contracts/proxy-events.md` as a spec.

- [X] T004 Modify `src/proxy/server.ts` — add `private pairCounter = 0` on the `ProxyServer` class instance (one counter per server instance, resets to 0 at construction); inside the request-entry handler (before calling `forwardRequest()`): increment counter, capture `const pairIndex = ++this.pairCounter`, emit `emitter.emit("pair-pending", { pairIndex, request })` synchronously; attach `pairIndex` to the `HttpPair` object before emitting `emitter.emit("pair", pair)`; on socket abort / upstream error path: emit `emitter.emit("pair-aborted", { pairIndex, request, status: "aborted" | "timeout", logged_at: new Date().toISOString() })`; add shutdown handler: for every `pairIndex` that has a pending `'pair-pending'` but no terminal event yet, emit `'pair-aborted'` with `status: "aborted"` before the process exits
- [X] T005 [P] Modify `src/logger/jsonl-writer.ts` — subscribe to `'pair-aborted'` in addition to `'pair'`; on `'pair'`: write `JSON.stringify({ ...pair })` (pairIndex already on pair from T004); on `'pair-aborted'`: write `JSON.stringify({ request, response: null, logged_at, pairIndex, status })` + newline; assert before each write that `pairIndex >= 1` (writer-side invariant only — full consistency validation lives in the loader, tested in T016); on proxy shutdown, flush any buffered writes before process exit
- [X] T006 [P] Modify `src/live-server/broadcaster.ts` — maintain `private pendingPairs = new Map<number, PendingPair>()`; on `'pair-pending'` proxy event: add entry to map, broadcast `{ type: "pair-pending", data: pendingPair }` to all connected WS clients; on `'pair'` event: remove from map, broadcast `{ type: "pair", data: httpPair }`; on `'pair-aborted'` event: remove from map, construct `HttpPair` with `response: null` and `status` set, broadcast `{ type: "pair", data: abortedPair }`; `getPairs()` returns only completed pairs (not pending) for the `history` message sent at WS connect-time; drop messages to closed/closing clients silently
- [X] T007 [P] Two-file change: (a) in `src/live-server/broadcaster.ts` (extends T006) add `getPendingPairs(): PendingPair[]` that returns `Array.from(pendingPairs.values())`; (b) in `src/live-server/server.ts` update the `/api/pairs` endpoint (line 41) to return `{ completed: broadcaster.getPairs(), pending: broadcaster.getPendingPairs() }`

**Checkpoint**: `npm run build` passes (types check across all backend modules).

---

## Phase 3: User Story 1 — Frontend Cross-Tab Labeling (Priority: P1) 🎯 MVP

**Goal**: Every captured pair has a stable visible `Pair NN` / `Turn NN` label in all three frontend tabs; Pairs and JSON tabs render pending rows immediately in live mode.

**Independent Test**: Capture a 7-pair session (4 displayable + 3 single-message warm-ups), open the HTML report, verify Turn labels in Transcript are non-contiguous (e.g. `Turn 02, 03, 05, 06`), switch to Pairs tab and confirm all 7 rows have contiguous `Pair 01…07` labels with no gaps, switch to JSON tab and confirm identical `Pair 01…07` section headers.

### Implementation for User Story 1

- [X] T008 [P] [US1] Add `--pair-row-pending-bg` CSS variable to `src/frontend/styles.css` — add to both `:root[data-mode="static"]` and `:root[data-mode="live"]` blocks; use a visually distinct but subtle background (e.g. amber tint on live, neutral on static); components reference `var(--pair-row-pending-bg)` only — no literal colors
- [X] T009 [P] [US1] Modify `src/frontend/conversation/TurnRow.tsx` — rename prop `globalTurn: number` to `pairIndex: number`; add prop `labelWidth: number`; replace `Turn {pad2(globalTurn)}` with `{formatPairLabel("Turn", pairIndex, labelWidth)}` using the helper from `src/shared/pair-index.ts`; update the `TurnRowProps` interface accordingly; remove any now-unused `pad2` import if it was only used for Turn labeling
- [X] T010 [US1] Modify `src/frontend/conversation/ConversationView.tsx` — remove the `let globalTurn = 0` counter and the `globalTurn += 1` increment (lines 53 and 97); import `{ padWidth as calcPadWidth }` from `src/shared/pair-index.ts`; compute `const labelWidth = calcPadWidth(Math.max(1, ...pairs.map(p => p.pairIndex)))` before the render loop; replace `globalTurn={globalTurn}` prop with `pairIndex={pair.pairIndex} labelWidth={labelWidth}` on each `<TurnRow>` (depends on T009)
- [X] T011 [P] [US1] Modify `src/frontend/rawPairs/RawPairsView.tsx` — import `{ padWidth as calcPadWidth, formatPairLabel }` from `src/shared/pair-index.ts`; compute `const labelWidth = calcPadWidth(Math.max(1, ...pairs.map(p => p.pairIndex)))` inside the component; add `pendingIndices: Set<number>` prop (default `new Set()`); add a leading `Pair NN` cell at the start of each row using `formatPairLabel("Pair", pair.pairIndex, labelWidth)`; apply `backgroundColor: "var(--pair-row-pending-bg)"` inline style to rows where `pendingIndices.has(pair.pairIndex)`; update the `Props` interface
- [X] T012 [P] [US1] Modify `src/frontend/jsonView/JsonView.tsx` — import `{ padWidth as calcPadWidth, formatPairLabel }` from `src/shared/pair-index.ts`; compute `const labelWidth = calcPadWidth(Math.max(1, ...pairs.map(p => p.pairIndex)))` inside the component; add `pendingIndices: Set<number>` prop (default `new Set()`); replace `aria-label={`pair ${idx + 1}`}` (line 78) with `aria-label={formatPairLabel("Pair", pair.pairIndex, labelWidth)}`; add a visible `<h3>` or `<div>` heading inside each pair section reading `{formatPairLabel("Pair", pair.pairIndex, labelWidth)}` (or the aborted variant `Pair NN — <status>` when `pair.status !== undefined && pair.status !== "completed"`); update the `Props` interface
- [X] T013 [US1] Create `src/frontend/versionLabel/useLivePairs.ts` and update `src/frontend/App.tsx` — create a specialized (non-generic) hook `useLivePairs(wsUrl: string | null): { pairs: HttpPair[]; pendingIndices: Set<number> }` that opens its own WebSocket; on `history` message: validate with `isHttpPairArray` guard from `src/shared/guards.ts`, replace pairs state, clear pendingIndices; on `pair-pending` message: validate with `isPendingPair` guard (add to `guards.ts` if not present), add `pairIndex` to pendingIndices; on `pair` message: validate with `isHttpPair` guard, remove `pairIndex` from pendingIndices, append pair to pairs; on reconnect: clear pendingIndices before new `history` arrives; keep existing `useWebSocket` generic hook **unchanged** (no type-system surgery needed); in `App.tsx` replace `useWebSocket<HttpPair>(WS_URL)` with `useLivePairs(WS_URL)` and destructure `{ pairs: livePairs, pendingIndices }`; pass `pendingIndices` to `<RawPairsView>` and `<JsonView>` (depends on T011, T012 for prop signatures)

**Checkpoint**: `npm run build` succeeds; open a captured session HTML report and confirm Turn/Pair labels are visible and consistent across all three tabs.

---

## Phase 4: User Story 1 — Tests

**Purpose**: Verify the backend pipeline (proxy events, JSONL writer, broadcaster) and integration (WS sequence) satisfy the contracts. All test files can be written in parallel — they touch different files.

- [X] T014 [P] [US1] Modify `tests/unit/conversation.test.ts` — add test: pairIndex from `HttpPair.pairIndex` drives the Turn label (not an incremented counter); add test: with a 7-pair set (4 with `messages.length >= 3`, 3 with 1 message), the Turn labels for the displayable pairs are non-contiguous and match their pairIndex values; add test: toggling the display filter does not change any visible pair's label — only the set of visible pairs changes; add test (FR-007): a non-`/v1/messages` pair with a `pairIndex` assigned does not appear in the `parseHttpPairs` output at all (Transcript never shows it) but its `pairIndex` is a gap in the visible Turn sequence; remove or update any test that asserts `globalTurn` counter behavior
- [X] T015 [P] [US1] Modify `tests/unit/broadcaster.test.ts` — add test: `pair-pending` WS message is broadcast before `forwardRequest` completes (use a spy/mock on the WS send); add test: subsequent `pair` WS message carries the same `pairIndex` as the preceding `pair-pending`; add test: `pair-aborted` proxy event produces a `{ type: "pair", data: { ..., response: null, status: "aborted" } }` WS message; add test: `getPairs()` returns only completed pairs (not pending); add test: on reconnect, `history` message excludes in-flight pairs
- [X] T016 [P] [US1] Modify `tests/unit/jsonl-writer.test.ts` — add test: written record includes `pairIndex` field matching the proxy event's pairIndex; add test: aborted-pair record has `response: null` and `status: "aborted"`; add test: loader falls back to `pairIndex = lineNumber` (1-based) for legacy records without a `pairIndex` field; add test: loader throws on two records with the same resolved `pairIndex` in one file; add test: loader throws if `response !== null` and `status !== "completed"` (consistency check from `contracts/jsonl-record.md`)
- [X] T017 [US1] Modify `tests/integration/proxy.test.ts` — add test: `pair-pending` event fires synchronously (before the `forwardRequest` promise resolves) with correct `pairIndex` and `request`; add test: pairIndex increments monotonically across multiple requests (1, 2, 3…); add test: when the proxy server is shut down while a request is in-flight, `pair-aborted` is emitted for the pending pair before the server closes; add test: `pair` event carries the same `pairIndex` as its preceding `pair-pending`
- [X] T018 [P] [US1] Modify `tests/integration/live-server.test.ts` — add test: a WebSocket client receives `{ type: "pair-pending" }` before `{ type: "pair" }` for the same `pairIndex`; add test: the pending row hydrates in place (same `pairIndex` in both messages); add test: an aborted in-flight pair is written to JSONL with `response: null` and `status: "aborted"` before session end; add test: a client that connects mid-session receives only completed pairs in `history` (no pending entries)

**Checkpoint**: `npm run test:unit` 100% pass; `npm run test:integration` 100% pass.

---

## Phase 5: User Story 2 — StatsBlock Filter Alignment (Priority: P2)

**Goal**: `StatsBlock.turns` equals the count of Transcript turn rows visible for the currently active filter setting and updates when the filter toggles.

**Independent Test**: Open any captured session, note the StatsBlock `turns` value and count visible Transcript rows — they must match. Toggle the "Include single-message turns" checkbox; verify StatsBlock `turns` updates to equal the new visible count.

### Implementation for User Story 2

- [X] T019 [US2] Modify `src/frontend/stats/stats.ts` — update `computeStats(pairs: HttpPair[], opts?: { includeAll?: boolean }): SessionStats` to accept an optional `opts` argument; change line 120 from `parseHttpPairs(pairs, { includeAll: true })` to `parseHttpPairs(pairs, { includeAll: opts?.includeAll ?? true })`; update JSDoc `@param` / `@returns` accordingly; `includeAll` defaulting to `true` preserves existing callers that pass no opts
- [X] T020 [US2] Modify `src/frontend/stats/useThrottledStats.ts` — add `includeAll: boolean` parameter to `useThrottledStats(pairs, live, windowMs, includeAll)`; thread `includeAll` to every `computeStats(pairs, { includeAll })` call in the hook (both the `useMemo` for static mode and the `setLiveStats` calls in the live path); update the function signature JSDoc (depends on T019)
- [X] T021 [US2] Modify `src/frontend/App.tsx` — pass `includeAll` state to `useThrottledStats`: change line 87's `<StatsBlock pairs={pairs} live={IS_LIVE} />` area so `useThrottledStats` is called with `includeAll` (e.g. `useThrottledStats(pairs, IS_LIVE, 250, includeAll)`); verify the `includeAll` state variable (already exists at line 52) is now consumed by both `ConversationView` and `useThrottledStats` (depends on T020; also depends on T013 which already modifies App.tsx — sequence T021 after T013)
- [X] T022 [US2] Modify `tests/unit/stats.test.ts` — add test: `computeStats(pairs, { includeAll: false })` returns `turnCount` equal to pairs that pass the display filter (messages.length >= 3); add test: `computeStats(pairs, { includeAll: true })` returns `turnCount` equal to all pairs; add test: calling `computeStats(pairs)` with no opts defaults to `includeAll: true` (backward-compat); add test: a session of 10 pairs where 3 are single-message warm-ups → `turnCount: 7` with filter OFF, `turnCount: 10` with filter ON

**Checkpoint**: `npm run test:unit tests/unit/stats.test.ts` 100% pass; live dashboard shows correct `turns` count that updates on filter toggle.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Confirm zero quality-gate regressions across all tiers.

- [X] T023 Run `npm run lint:fix` to auto-fix any Biome warnings introduced by new code; manually resolve any remaining warnings (zero warnings is the gate per CLAUDE.md)
- [X] T024 Run `npm run typecheck` to verify zero TypeScript errors across all modified files
- [X] T025 Run `npm run test:unit` to verify 100% unit coverage on `src/` (including the new `src/shared/pair-index.ts` and `src/frontend/versionLabel/useLivePairs.ts`); confirm `vitest.config.ts` coverage exclusions are documented if any new files are excluded
- [X] T026 Run `npm run test:integration` to verify all integration tests pass (live-server.test.ts + proxy.test.ts pending/hydrate/abort scenarios)
- [X] T027 Verify `npm run test:e2e` still passes; add one e2e assertion in `tests/e2e/` that the generated JSONL from a full `attach` lifecycle contains a `pairIndex` field and that the rendered HTML report contains a visible `Pair 01` label — covers SC-005 round-trip parity

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately. T001 + T002 run in parallel.
- **Phase 2 (Backend Pipeline)**: Depends on T001 (types). T004 first, then T005/T006/T007 in parallel.
- **Phase 3 (US1 Frontend)**: Depends on T001 + T002. T008, T009, T011, T012 can run in parallel. T010 depends on T009. T013 depends on T011 + T012.
- **Phase 4 (US1 Tests)**: T014–T016, T018 can run in parallel. T017 (integration) should run after Phase 2 complete.
- **Phase 5 (US2)**: T019 and T020 depend only on Phase 1 (types) and can start in parallel with Phase 2. T021 (App.tsx) must follow T013 (Phase 3) since both touch `App.tsx`. T022 follows T019.
- **Phase 6 (Polish)**: Depends on all Phases 1–5 complete.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 1 + Phase 2. No dependency on US2.
- **US2 (P2)**: T019/T020 depend on Phase 1 only (shared types) and can start in parallel with Phase 2 backend work. T021 must run after T013 (both touch `App.tsx`).

### Critical Path

`T001 → T004 → T006 → T013 → T021` (types → proxy events → broadcaster → App WS → stats wire-up)

### Parallel Opportunities

Within Phase 1:
```bash
# Run together:
T001 — Update src/shared/types.ts
T002 — Create src/shared/pair-index.ts
# After T002:
T003 — Create tests/unit/pair-index.test.ts
```

Within Phase 2 (after T004):
```bash
# Run together:
T005 — src/logger/jsonl-writer.ts
T006 — src/live-server/broadcaster.ts
T007 — src/live-server/server.ts
```

Within Phase 3 (after T001 + T002):
```bash
# Run together:
T008 — src/frontend/styles.css
T009 — src/frontend/conversation/TurnRow.tsx
T011 — src/frontend/rawPairs/RawPairsView.tsx
T012 — src/frontend/jsonView/JsonView.tsx
# After T009:
T010 — src/frontend/conversation/ConversationView.tsx
# After T011 + T012:
T013 — src/frontend/versionLabel/useLivePairs.ts (NEW) + App.tsx
```

Within Phase 4 (after Phase 2):
```bash
# Run together:
T014 — tests/unit/conversation.test.ts
T015 — tests/unit/broadcaster.test.ts
T016 — tests/unit/jsonl-writer.test.ts
T018 — tests/integration/live-server.test.ts
# After Phase 2 complete:
T017 — tests/integration/proxy.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational types + helpers
2. Complete Phase 2: Backend pipeline
3. Complete Phase 3: Frontend labeling
4. Complete Phase 4: Tests
5. **STOP and VALIDATE**: Run all unit + integration tests; open a captured session and verify Turn/Pair labels match across tabs
6. Ship US1 — delivers the primary user value

### Incremental Delivery

1. Phase 1 → Foundation ready
2. Phase 2 → Backend pipeline emitting pairIndex
3. Phase 3 → Frontend labels visible in all three tabs → **MVP shippable**
4. Phase 4 → Test coverage locked
5. Phase 5 → StatsBlock alignment (low-risk polish)
6. Phase 6 → Quality gates confirmed

---

## Notes

- The `pairIndex` counter in `src/proxy/server.ts` lives on the `ProxyServer` **instance**, not at module scope — each `createProxyServer()` call starts fresh at 1.
- `padWidth` must be computed from the **highest** `pairIndex` in the current session so all tabs use consistent column width at any instant.
- `useWebSocket` generic hook is **left unchanged** (T013 decision). A new specialized `useLivePairs` hook in `src/frontend/versionLabel/useLivePairs.ts` handles the three-message protocol and returns `{ pairs, pendingIndices }`. This avoids TypeScript generic constraint surgery and keeps the existing hook clean.
- `pendingIndices` in static HTML report mode is always an empty `Set` (no WS connection, `useLivePairs(null)` returns `{ pairs: [], pendingIndices: new Set() }`); `RawPairsView` and `JsonView` default `pendingIndices` to `new Set()` so static reports render without changes.
- `padWidth` from `pair-index.ts` is imported with the alias `calcPadWidth` at every call site to avoid shadowing the local result variable (`labelWidth`). Consistent across T010, T011, T012.
- Constitution Principle V: the JSONL loader MUST throw (not silently ignore) on duplicate `pairIndex`. Test this in T016.
- CLAUDE.md reminder: no `console.log` in `src/` — use `process.stdout.write` / `process.stderr.write` if any debug output is needed.
