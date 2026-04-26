---
description: "Task list for 002-structural-refactor"
---

# Tasks: Structural Refactor

**Input**: Design documents from `/specs/002-structural-refactor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: A small number of new tests are required by this refactor:
- US1 adds `tests/e2e/bundle-size.test.ts` (FR-011 / SC-006).
- US2 adds unit tests for the two new shared helpers (FR-005, 100% coverage gate).
- US4 adds paired accept/reject unit tests for each new type guard (FR-007, US4 Acceptance #3).

No existing test assertion may change. Only `import` paths in tests may move (FR-001).

**Organization**: Tasks grouped by user story; merge order is fixed (US1 → US2 → US3 → US4 per FR-012). Each story is one PR squash-merged into `002-structural-refactor`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to
- File paths are absolute or repo-rooted

## Path Conventions

Single-package layout: source in `src/`, tests in `tests/{unit,integration,e2e}/` at repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch baseline; nothing else needs to be set up — refactor edits existing code only.

- [X] T001 Confirm `002-structural-refactor` branch is checked out and clean: `git status` shows no modifications outside `specs/002-structural-refactor/` and `CLAUDE.md`.
- [X] T002 [P] Run baseline `npm run test` on `002-structural-refactor` HEAD; record pass count in PR description for SC-001 comparison. **Result: 151 tests pass (142 unit / 6 integration / 3 e2e), 100% src/ coverage, commit 4dff88c.**

---

## Phase 2: Foundational

**Purpose**: None. Refactor adds no shared infrastructure that blocks user stories. The only "foundational" item — the bundle-size baseline — belongs inside US1's PR per spec FR-011.

**Checkpoint**: Skip directly to Phase 3.

---

## Phase 3: User Story 1 — Split oversized modules (Priority: P1) 🎯 MVP

**Goal**: `JsonView.tsx` (394 LOC) and `ConversationView.tsx` (279 LOC) split into single-purpose files ≤300 LOC each (target ≤250). Bundle-size guardrail in place for subsequent stories.

**Independent Test**: `npm run test` exits 0 with pass count ≥ baseline; `wc -l src/**/*.{ts,tsx}` shows zero files >300; `tests/e2e/bundle-size.test.ts` is green.

### Bundle-size baseline (must complete before splits land)

- [X] T003 [US1] Build the project on baseline HEAD: run `npm run build` and copy the resulting `dist/frontend/index.js` byte count plus the rendered HTML byte count into a scratch note. **Bundle: 857307 bytes; HTML: 862531 bytes.**
- [X] T004 [US1] Choose the e2e fixture that drives baseline — pick the largest existing JSONL under `tests/e2e/fixtures/` (or generate one from `mock-claude.ts` + `mock-api.ts` if none exists), commit it as `tests/e2e/fixtures/bundle-baseline.jsonl`.
- [X] T005 [US1] Render the fixture through `report/html-generator.ts` (one-off script invocation), capture uncompressed byte size of the resulting `.html`. **862531 bytes.**
- [X] T006 [US1] Update `specs/002-structural-refactor/spec.md` Assumptions section: replace the `TBD` baseline placeholder with `Baseline: NNNNN bytes (commit <sha>, fixture tests/e2e/fixtures/bundle-baseline.jsonl)`.
- [X] T007 [US1] Create `tests/e2e/bundle-size.test.ts` that loads the fixture, renders via `report/html-generator.ts`, and asserts `Math.abs(html.length - BASELINE) / BASELINE <= 0.02`.
- [X] T008 [US1] Run `npm run test:e2e` (or equivalent) and confirm `bundle-size.test.ts` passes on baseline.

### JsonView split (sequential — all touch one source file)

- [X] T009 [US1] Create directory `src/frontend/jsonView/`.
- [X] T010 [US1] Extract reducer state model to `src/frontend/jsonView/jsonViewReducer.ts`: move `JsonViewState`, `JsonViewAction`, `reducer`, `lookupExpanded`, `__all__` sentinel out of `src/frontend/components/JsonView.tsx`. Export each named symbol. ≤80 LOC target.
- [X] T011 [US1] Extract single-row renderer to `src/frontend/jsonView/JsonNode.tsx`: move the recursive node-renderer JSX + dispatch + hover-revealed copy button. ≤200 LOC. Imports `formatForClipboard` from current location.
- [X] T012 [US1] Extract per-tree wrapper to `src/frontend/jsonView/JsonTree.tsx`: `useReducer` setup, sticky `<header className="json-tree-label">`, Expand/Collapse-all buttons. ≤120 LOC.
- [X] T013 [US1] Extract breadcrumb to `src/frontend/jsonView/JsonBreadcrumb.tsx`: button rendering `formatJsonPath(lastFocused)`, copy on click. ≤50 LOC.
- [X] T014 [US1] Move slimmed container to `src/frontend/jsonView/JsonView.tsx`: owns `filter`, `filterTarget`, `lastFocused`; renders `JsonBreadcrumb` + per-pair `JsonTree` sections. ≤120 LOC. Delete `src/frontend/components/JsonView.tsx`.
- [X] T015 [US1] Update `src/frontend/App.tsx` import for `JsonView` from `./components/JsonView` → `./jsonView/JsonView`.
- [X] T016 [US1] Run `npm run lint && npm run typecheck && npm run test`; confirm all green and `tests/e2e/bundle-size.test.ts` still passes. **Contract gate**: `tests/e2e/attach.test.ts` (FR-009) and `tests/integration/live-server.test.ts` (FR-010) must pass with no test-assertion edits.

### ConversationView split (sequential — all touch one source file)

- [X] T017 [US1] Create directory `src/frontend/conversation/`.
- [X] T018 [US1] Extract per-turn row to `src/frontend/conversation/TurnRow.tsx`: global Turn #, `<TokenMeter>`, exhibit list rendering for one turn. ≤120 LOC.
- [X] T019 [US1] Extract auto-labeled exhibits to `src/frontend/conversation/ExhibitList.tsx`: tool-call + tool-result rendering. ≤80 LOC.
- [X] T020 [US1] Move slimmed container to `src/frontend/conversation/ConversationView.tsx`: groups pairs into turns via `parseHttpPairs`, renders `TurnRow` per turn. ≤140 LOC. Delete `src/frontend/components/ConversationView.tsx`.
- [X] T021 [US1] Update `src/frontend/App.tsx` import for `ConversationView` from `./components/ConversationView` → `./conversation/ConversationView`.
- [X] T022 [US1] Run `npm run lint && npm run typecheck && npm run test`; confirm pass count = baseline; `wc -l $(git ls-files 'src/**/*.ts' 'src/**/*.tsx')` shows zero files >300 LOC; `bundle-size.test.ts` green. **Contract gate**: `tests/e2e/attach.test.ts` (FR-009) and `tests/integration/live-server.test.ts` (FR-010) must pass with no test-assertion edits.
- [X] T023 [US1] Squash-merge US1 PR into `002-structural-refactor`. **Committed as ee0341c on feature branch.**

**Checkpoint US1**: `JsonView` lives in `src/frontend/jsonView/` (5 files, ≤300 LOC each); `ConversationView` lives in `src/frontend/conversation/` (3 files, ≤300 LOC each). All tests green. Bundle-size guardrail active.

---

## Phase 4: User Story 2 — Consolidate duplicated patterns (Priority: P2)

**Goal**: One module owns `PKG_VERSION` resolution; one helper performs HTML-template token substitution; both have unit tests at 100% line+branch coverage.

**Independent Test**: `grep -rn "PKG_PATH\|JSON.parse(fs.readFileSync.*package.json" src/` returns matches in exactly one file (`src/shared/version.ts`); `grep -rn "split(\"__CC_TRACE" src/` returns zero matches; `npm run test` green; bundle-size assertion still green.

### Tests for US2 (add before/with the helpers per FR-005)

- [X] T024 [P] [US2] Create `tests/unit/version.test.ts`: assert `import { PKG_VERSION } from "../../src/shared/version.js"` matches `JSON.parse(fs.readFileSync("package.json")).version`.
- [X] T025 [P] [US2] Create `tests/unit/template.test.ts` with the three required cases per FR-005: empty replacements map, single-token substitution, multi-token substitution including overlapping substrings (e.g., `__FOO__` and `__FOOBAR__` in the same template).

### Implementation for US2

- [X] T026 [P] [US2] Create `src/shared/version.ts`: read `package.json` once at module load, export `PKG_VERSION: string`. JSDoc on the exported constant.
- [X] T027 [P] [US2] Create `src/shared/template.ts`: export `substituteTokens(template: string, replacements: Record<string, string>): string`. Implementation iterates the replacements map and applies each substitution. JSDoc with `@param` and `@returns`.
- [X] T028 [US2] Update `src/report/html-generator.ts`: replace local `PKG_PATH` + `JSON.parse(...).version` with `import { PKG_VERSION } from "../shared/version.js"`. Replace the `.split(...).join(...)` chain with a single `substituteTokens(template, { __CC_TRACE_DATA__: dataB64, __CC_TRACE_BUNDLE__: bundle, __CC_TRACE_TITLE__: title, __CC_TRACE_VERSION__: PKG_VERSION, __CC_TRACE_GENERATED_AT__: generatedAt })` call.
- [X] T029 [US2] Update `src/live-server/server.ts`: replace local `PKG_PATH` + `JSON.parse(...).version` with `import { PKG_VERSION } from "../shared/version.js"`.
- [X] T030 [US2] Audit: search `src/` for any remaining direct `package.json` reads — confirm zero matches outside `src/shared/version.ts`. Search for any remaining `.split("__CC_TRACE` chains — confirm zero matches outside `src/shared/template.ts` (the helper itself MAY contain literal token patterns in comments/docs but no other file).
- [X] T030a [US2] Re-audit the meta-fetch-and-hydrate dedup target (data-model.md US2 row 3): `grep -rn "window.ccTraceMeta\|fetch.*api/status" src/`. If exactly one consumer remains, document the negative finding in the US2 PR description and skip extraction. If ≥2 consumers exist, extract into `src/shared/meta.ts` with paired unit tests before merging US2.
- [X] T031 [US2] Run `npm run lint && npm run typecheck && npm run test`; confirm all green and unit coverage is 100% line+branch on `src/shared/version.ts` and `src/shared/template.ts`. **Contract gate**: `tests/e2e/attach.test.ts` (FR-009) and `tests/integration/live-server.test.ts` (FR-010) must pass with no test-assertion edits.
- [X] T032 [US2] Verify integration test `tests/integration/live-server.test.ts` (specifically `C-V-04` which asserts `version` matches `package.json`) still passes — proves end-to-end version resolution unchanged.
- [X] T033 [US2] Verify `tests/unit/html-generator.test.ts` (specifically `C-V-01`–`C-V-03`) still passes — proves token-substitution behavior unchanged.
- [X] T034 [US2] Squash-merge US2 PR into `002-structural-refactor`. **Committed as 8438c29.**

**Checkpoint US2**: `src/shared/version.ts` and `src/shared/template.ts` exist with 100% coverage. `report/html-generator.ts` and `live-server/server.ts` import from them. All existing tests green.

---

## Phase 5: User Story 3 — Reorganize directory layout (Priority: P2)

**Goal**: Five UI features each have their own folder under `src/frontend/`. `src/shared/` shrinks to genuinely cross-boundary code only. `src/frontend/components/` and `src/frontend/hooks/` deleted.

**Independent Test**: `ls src/frontend/{conversation,jsonView,rawPairs,stats,versionLabel}/` succeeds; `src/frontend/components/` and `src/frontend/hooks/` do not exist; `ls src/shared/` shows only `types.ts`, `version.ts`, `template.ts`; `npm run test` green; `bundle-size.test.ts` green.

### Move shared/ single-feature modules into feature folders (per FR-013)

- [X] T035 [P] [US3] Move `src/shared/conversation.ts` → `src/frontend/conversation/conversation.ts`.
- [ ] T036 [P] [US3] Move `src/shared/json-path.ts` → `src/frontend/jsonView/json-path.ts`.
- [ ] T037 [P] [US3] Move `src/shared/stats.ts` → `src/frontend/stats/stats.ts` (creates the `stats/` folder).
- [ ] T038 [P] [US3] Move `src/shared/throttle.ts` → `src/frontend/stats/throttle.ts`.

### Move remaining frontend/components & frontend/hooks into feature folders

- [ ] T039 [P] [US3] Move `src/frontend/components/StatsBlock.tsx` → `src/frontend/stats/StatsBlock.tsx`.
- [ ] T040 [P] [US3] Move `src/frontend/hooks/useThrottledStats.ts` → `src/frontend/stats/useThrottledStats.ts`.
- [ ] T041 [P] [US3] Move `src/frontend/components/RawPairsView.tsx` → `src/frontend/rawPairs/RawPairsView.tsx` (creates the `rawPairs/` folder).
- [ ] T042 [P] [US3] Move `src/frontend/components/TokenMeter.tsx` → `src/frontend/conversation/TokenMeter.tsx`.
- [ ] T043 [P] [US3] Move `src/frontend/components/VersionLabel.tsx` → `src/frontend/versionLabel/VersionLabel.tsx` (creates the `versionLabel/` folder).
- [ ] T044 [P] [US3] Move `src/frontend/hooks/useWebSocket.ts` → `src/frontend/versionLabel/useWebSocket.ts` (per research R1).
- [ ] T045 [P] [US3] Move `src/frontend/hooks/useWsReconnects.ts` → `src/frontend/versionLabel/useWsReconnects.ts` (per research R1).
- [ ] T046 [US3] Verify `src/frontend/components/` and `src/frontend/hooks/` are now empty; delete both directories.

### Update import paths (sources)

- [ ] T047 [US3] Update all `src/frontend/**` files: rewrite imports of `../shared/{conversation,json-path,stats,throttle}` and `./components/*`, `./hooks/*` to the new paths. (Do this with a single search-and-replace pass; verify with `npm run typecheck`.)
- [ ] T048 [US3] Update `src/frontend/App.tsx` imports for the moved components (StatsBlock, RawPairsView, TokenMeter, VersionLabel, JsonView, ConversationView).

### Update import paths (tests) — only `import` lines change, no assertion edits

- [ ] T049 [P] [US3] Update `tests/unit/conversation.test.ts`: change source import from `../../src/shared/conversation.js` → `../../src/frontend/conversation/conversation.js`.
- [ ] T050 [P] [US3] Update `tests/unit/json-path.test.ts`: change source import from `../../src/shared/json-path.js` → `../../src/frontend/jsonView/json-path.js`.
- [ ] T051 [P] [US3] Update `tests/unit/stats.test.ts`: change source import from `../../src/shared/stats.js` → `../../src/frontend/stats/stats.js`.
- [ ] T052 [P] [US3] Update `tests/unit/throttle-scheduler.test.ts`: change source import from `../../src/shared/throttle.js` → `../../src/frontend/stats/throttle.js`.

### Coverage exclusion update (FR-014)

- [ ] T053 [US3] Update `vitest.config.ts` `coverage.exclude`: keep `src/frontend/**` excluded for `.tsx` files and frontend-specific React hooks, but ADD an explicit include (or carve-out exclude pattern) for the four moved logic files (`src/frontend/conversation/conversation.ts`, `src/frontend/jsonView/json-path.ts`, `src/frontend/stats/stats.ts`, `src/frontend/stats/throttle.ts`) so they remain in the unit-coverage pool with their existing 100% line+branch tests. Verify with `npm run test:unit`.
- [ ] T054 [US3] Update `CLAUDE.md` Quality Gates exclusion list to match the new `vitest.config.ts` reality. Update CLAUDE.md "Modules" table to reflect the new feature-folder layout (replace `frontend/components/*` and `frontend/hooks/*` rows with feature-folder entries).

### Verification

- [ ] T055 [US3] Run `npm run lint && npm run typecheck && npm run test`; confirm pass count = baseline, unit coverage 100% line+branch, integration coverage 100%, e2e ≥70%, bundle-size assertion green. **Contract gate**: `tests/e2e/attach.test.ts` (FR-009) and `tests/integration/live-server.test.ts` (FR-010) must pass with no test-assertion edits.
- [ ] T055a [US3] Audit FR-008: `grep -rnE "^(export )?(interface|type) (HttpPair|StatusMeta|WsFrame)" src/` returns matches in exactly one file (`src/shared/types.ts`). Zero parallel declarations.
- [ ] T055b [US3] Verify FR-013 final eligibility: for each file in `src/shared/`, run `grep -rln "from .*shared/<basename>" src/` and confirm ≥2 distinct importing scopes (cross-boundary backend↔frontend OR ≥2 feature folders). Document the importer list per file in the US3 PR description.
- [ ] T056 [US3] Run `npm run build`; confirm dist artifacts produced and the report bundle still opens from `file://`.
- [ ] T057 [US3] Squash-merge US3 PR into `002-structural-refactor`.

**Checkpoint US3**: Five feature folders under `src/frontend/`. `src/shared/` contains only `types.ts`, `version.ts`, `template.ts`. All tests green. CLAUDE.md and vitest.config.ts in sync.

---

## Phase 6: User Story 4 — Tighten types at module boundaries (Priority: P3)

**Goal**: Inline `as { ... }` casts in non-test source code drop to zero. All narrowing goes through named, tested type guards in `src/shared/guards.ts`.

**Independent Test**: `grep -rnE "\bas \{[^}]" src/` (excluding `tests/`) returns zero matches; `tests/unit/guards.test.ts` has paired accept/reject tests for every guard, 100% line+branch; `npm run test` green.

**Hard dependency**: US4 lands ONLY after US3 (per FR-012 / spec clarification Q3). Do not start until US3 is squash-merged into `002-structural-refactor`.

### Tests for US4 (write first per US4 Acceptance Scenario 3)

- [ ] T058 [US4] Create `tests/unit/guards.test.ts` skeleton with one `describe` block per guard listed in `data-model.md` US4 table.
- [ ] T059 [P] [US4] Add accept + reject tests for `isStatusMeta` (accept: `{version: "x", startedAtIso: "2026-..."}`; reject: missing field, wrong type, null, primitive).
- [ ] T060 [P] [US4] Add accept + reject tests for `isPairWsFrame` (accept: `{type: "pair", pair: {...}}`; reject: wrong `type` value, missing `pair`).
- [ ] T061 [P] [US4] Add accept + reject tests for `isMessagesBody` (accept: `{messages: []}`, `{messages: [...]}`; reject: missing field, non-array).
- [ ] T062 [P] [US4] Add accept + reject tests for `isModelBody` (accept: `{}`, `{model: "x"}`, `{system: anything}`; reject: null, primitive).
- [ ] T063 [P] [US4] Add accept + reject tests for `isContentBody` (accept: `{content: []}`; reject: missing or wrong type).
- [ ] T064 [P] [US4] Add accept + reject tests for `isAddressInfo` (accept: `{port: 0}`; reject: `null`, string).
- [ ] T065 [P] [US4] Add accept + reject tests for SSE event guards (one set per Anthropic stream event type referenced in `src/frontend/conversation/conversation.ts`).
- [ ] T065a [P] [US4] Add accept + reject tests for `isErrorWithCode` (accept: `{code: "ENOENT"}`, `{}`; reject: `null`, primitive, non-object).
- [ ] T066 [US4] Run `npm run test:unit` and confirm all guard tests fail (no implementation yet).

### Implementation for US4

- [ ] T067 [US4] Create `src/shared/guards.ts` with named exports for each guard listed in `data-model.md` US4 table (including `isErrorWithCode`). Each guard has signature `(x: unknown): x is T`. JSDoc on each.
- [ ] T068 [US4] Run `npm run test:unit` and confirm guard tests now pass with 100% line+branch coverage on `src/shared/guards.ts`.

### Replace inline casts (all 11 confirmed sites, distributed across T069–T077)

- [ ] T069 [P] [US4] Replace cast at `src/live-server/server.ts:75` (`server.address() as { port: number }`) with `isAddressInfo(addr)` guard call + explicit error if reject.
- [ ] T070 [US4] Replace all casts in `src/frontend/conversation/conversation.ts` (lines 43, 49, 58, 68–69, 108, 143, 116) in one sequential edit pass: SSE event guards (`isAnthropicStreamEvent` family) at 43/49/58/68–69, `isModelBody` at 108/143, `isMessagesBody` at 116. (T071–T075 IDs reserved — folded into T070; same file precludes parallelism.)
- [ ] T071 [P] [US4] Replace cast at `src/cli/commands/attach.ts:61` with `isMessagesBody`.
- [ ] T076 [P] [US4] Replace cast at `src/frontend/conversation/ConversationView.tsx:23` with `isContentBody`.
- [ ] T077 [P] [US4] Replace cast at `src/cli/options.ts:108` (`(err as { code?: string })?.code`) with `isErrorWithCode` from `src/shared/guards.ts` (defined per data-model.md US4 table; tests added in Phase 6 test sub-phase).
- [ ] T078 [US4] Audit: run `grep -rnE "\bas \{[^}]" src/` and confirm zero matches in non-test files.
- [ ] T079 [US4] Run `npm run lint && npm run typecheck && npm run test`; confirm all green, coverage thresholds hold, bundle-size assertion green. **Contract gate**: `tests/e2e/attach.test.ts` (FR-009) and `tests/integration/live-server.test.ts` (FR-010) must pass with no test-assertion edits.
- [ ] T080 [US4] Squash-merge US4 PR into `002-structural-refactor`.

**Checkpoint US4**: `src/shared/guards.ts` exists with paired tests at 100%. Zero inline `as { ... }` casts in source. All tests green.

---

## Phase 7: Polish & Final Merge

- [ ] T081 [P] Update `CLAUDE.md` "Modules" table once more to reflect the final post-US4 layout (guards added, all moves applied).
- [ ] T082 [P] Update `README.md` if the project tree section mentions any moved files.
- [ ] T083 Run `npm run lint && npm run typecheck && npm run test && npm run build` one final time on `002-structural-refactor` HEAD; confirm all green.
- [ ] T083a Verify SC-008: `for d in conversation jsonView rawPairs stats versionLabel; do count=$(find "src/frontend/$d" -maxdepth 1 -type f | wc -l); test "$count" -le 6 || { echo "FAIL: $d has $count files (>6)"; exit 1; }; done` — every feature folder has ≤6 files.
- [ ] T083b Verify SC-002: `total=$(git ls-files 'src/**/*.ts' 'src/**/*.tsx' | wc -l); under=$(git ls-files 'src/**/*.ts' 'src/**/*.tsx' | xargs wc -l | awk '$1<=250 && $2!="total"' | wc -l); awk "BEGIN{exit !($under/$total >= 0.9)}"` — assert ≥90% of source files are ≤250 LOC.
- [ ] T084 Manual smoke test: `node dist/cli/index.js attach -- echo hello` produces a `~/.cc-trace/sessions/session-*.html` that opens from `file://` with no missing assets.
- [ ] T085 Open PR `002-structural-refactor` → `main`. PR body lists the four story squash-commits, links to `specs/002-structural-refactor/spec.md`, and confirms `quickstart.md` "Final merge to `main`" checklist.
- [ ] T086 Merge `002-structural-refactor` → `main` per FR-012 (single PR, squash or merge-commit per repo policy).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Trivial verification only.
- **Foundational (Phase 2)**: Empty by design.
- **US1 (Phase 3)**: Independent; may begin immediately.
- **US2 (Phase 4)**: Depends on US1 squash-merged into `002-structural-refactor`.
- **US3 (Phase 5)**: Depends on US2 squash-merged.
- **US4 (Phase 6)**: Hard dependency on US3 squash-merged (per FR-012).
- **Polish (Phase 7)**: Depends on US4 squash-merged.

### Within Each User Story

- US1: bundle-size baseline tasks (T003–T008) MUST complete before any split lands. Within JsonView split, T009→T010→T011→T012→T013→T014→T015→T016 sequential. ConversationView split (T017–T022) can run in parallel with JsonView split work since they touch different files (mark T017+ [P] vs T009+ in implementation if staffed).
- US2: T024–T027 parallel; T028+T029 depend on T026+T027; T030–T034 sequential verification.
- US3: T035–T038 parallel; T039–T046 sequential per file (some can be [P]); T047+T048 sequential after moves; T049–T052 parallel; T053–T057 sequential.
- US4: Tests T058–T066 parallel after T058; implementation T067 sequential; cast-replacements T069, T071, T076, T077 parallel (different files); T070 sequential (single file, 8 sites); T078–T080 sequential.

### Parallel Opportunities

- US1 JsonView and ConversationView splits touch entirely separate file trees → can run in parallel by two contributors.
- US2 helper-creation tasks (T024–T027) are file-independent.
- US3 file moves (T035–T045) touch one source path each — all `[P]`-eligible.
- US3 test-import updates (T049–T052) are entirely independent.
- US4 cast-site replacements: T069 (live-server), T071 (attach.ts), T076 (ConversationView.tsx), T077 (cli/options.ts) are fully parallel after T067; T070 is sequential (8 sites in one file).

---

## Parallel Example: User Story 2 helpers

```bash
# Two contributors can work on these four tasks simultaneously:
Task: "Create tests/unit/version.test.ts"               # T024
Task: "Create tests/unit/template.test.ts"              # T025
Task: "Create src/shared/version.ts"                    # T026
Task: "Create src/shared/template.ts"                   # T027
```

## Parallel Example: User Story 4 cast replacements

After T067 (guards.ts implemented), the four single-file tasks below touch distinct source files and can be parceled out in parallel; T070 runs alone since it owns one file:

```bash
Task: "Replace cast in src/live-server/server.ts:75"                            # T069  [P]
Task: "Replace 8 casts in src/frontend/conversation/conversation.ts"            # T070  (sequential — single file)
Task: "Replace cast in src/cli/commands/attach.ts:61"                           # T071  [P]
Task: "Replace cast in src/frontend/conversation/ConversationView.tsx:23"      # T076  [P]
Task: "Replace cast in src/cli/options.ts:108"                                  # T077  [P]
```

---

## Implementation Strategy

### MVP Scope

US1 alone is the MVP for this refactor: it splits the two largest files and installs the bundle-size guardrail. Shippable on its own — US2/US3/US4 are improvements, not corrections.

1. Complete Phase 1 setup (verification only).
2. Complete US1 (Phase 3). PR review + squash-merge.
3. **STOP and validate**: confirm `npm run test` pass count matches baseline, no file >300 LOC, bundle-size assertion green.
4. Decide whether to continue to US2/US3/US4 or pause and ship.

### Incremental Delivery

US1 → US2 → US3 → US4, each as one squash-merged PR into `002-structural-refactor`. The feature branch then merges to `main` once all four are in.

### Single-Contributor Strategy (default for this repo)

Run sequentially. Each user story is one focused sitting; the parallel markers are advisory only.

---

## Notes

- [P] tasks = different files, no cross-task dependencies on incomplete work
- [Story] label maps task to specific user story for traceability
- US4 is NOT independently shippable — reverting US3 cascades to also revert US4 (per spec clarification Q3)
- Avoid: editing test assertions (FR-001 forbids); adding new runtime dependencies; relaxing CLAUDE.md constraints
- Each task description names the exact file path so an LLM executing the task does not need to scan the codebase first
- For US3 the `vitest.config.ts` exclusion update (T053) is the most subtle task — get it right or unit coverage drops below 100% and the gate fails
