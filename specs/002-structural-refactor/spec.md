# Feature Specification: Structural Refactor

**Feature Branch**: `002-structural-refactor`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "refactor the project; need to pass all existing test cases"

## User Scenarios & Testing *(mandatory)*

This feature is a **non-behavioral refactor**. The acceptance criterion across every user story is the same: **all currently-passing test suites (unit, integration, e2e) and quality gates (lint, typecheck, 100%/100%/≥70% coverage) continue to pass without modification of test expectations**. Tests may be relocated alongside refactored modules, but their assertions, inputs, and outputs MUST remain semantically identical.

## Clarifications

### Session 2026-04-26

- Q: Should unit tests colocate inside feature folders, or stay in the parallel `tests/` tree? → A: B — Keep parallel: only `src/` is restructured; `tests/unit|integration|e2e/` directory layout is unchanged.
- Q: What stays in `src/shared/` after US3? → A: A — Strict: only modules imported by both backend and frontend, or by 2+ features. Single-feature helpers (`stats.ts`, `throttle.ts`, `json-path.ts`) move into the owning feature folder.
- Q: How is each user story delivered? → A: B — One PR per story, squash-merged into `002-structural-refactor`. The feature branch is then merged to `main` as one PR.
- Q: Resolve `conversation.ts` shared-status contradiction (FR-013 vs strict rule)? → A: A — Apply strict rule literally: `conversation.ts` moves into the conversation feature folder. Only modules with actual cross-boundary or 2+-feature imports stay in `src/shared/`.
- Q: 250-LOC ceiling — hard MUST or soft heuristic? → A: B — Hard 300, soft 250. No file >300 LOC; files in 251–300 require a one-line PR justification.
- Q: Is US4's dependency on US2/US3 hard or soft? → A: A — Hard dependency. Explicit merge order: US1 → US2 → US3 → US4. US4 is NOT independently shippable; reverting US3 cascades to also revert US4.
- Q: How does the coverage exclusion list update when files split or move? → A: A — Inheritance. Split/renamed files inherit the source's coverage tier (unit-excluded vs unit-required). The PR that moves a file also updates `CLAUDE.md` and the `vitest.config.ts` exclusion list in the same commit.
- Q: How do we anchor the FR-011 bundle-size check? → A: B — US1's PR records the baseline byte-size of the rendered `.html` from a `tests/e2e/` fixture into the spec's Assumptions section, and adds a vitest e2e assertion that subsequent PRs MUST stay within ±2%. Metric = uncompressed `.html` file size.

### User Story 1 - Split oversized modules into single-purpose files (Priority: P1)

A maintainer opening `JsonView.tsx` (394 LOC) or `ConversationView.tsx` (279 LOC) wants to find a specific piece of logic — the row renderer, the breadcrumb, the reducer, the streaming-message assembler — without scrolling past unrelated code. Today these files mix multiple responsibilities (state model, rendering, event handling, formatting) in one source.

**Why this priority**: Largest files are the hottest spots for merge conflicts and the slowest to comprehend. Splitting them is the highest-leverage readability win and unblocks future feature work that touches these surfaces.

**Independent Test**: After the split, every existing unit/integration/e2e test continues to pass with no test-file edits other than import-path updates. A reviewer can locate any named symbol referenced by tests in a file ≤200 LOC.

**Acceptance Scenarios**:

1. **Given** a maintainer searches for the JsonView reducer, **When** they open the file containing it, **Then** that file contains only state/reducer logic and is ≤80 LOC (per `data-model.md`'s `jsonViewReducer.ts` budget; well under FR-003's 250 soft / 300 hard ceiling).
2. **Given** the test suite ran green on `main` before the refactor, **When** the refactor is merged, **Then** `npm run test` exits 0 with identical pass counts.
3. **Given** the JsonView/ConversationView public component API (props, exported names) used by `App.tsx` and tests, **When** the modules are split, **Then** the public API remains byte-for-byte identical at the import sites.

---

### User Story 2 - Consolidate duplicated patterns into shared helpers (Priority: P2)

Several modules independently re-implement the same primitives — reading and parsing `package.json` for `PKG_VERSION` (in `report/html-generator.ts` and `live-server/server.ts`), the "render meta from `window.ccTraceMeta` else fetch `/api/status` and hydrate" pattern, and the substitute-many-tokens-into-template chain in `html-generator.ts`. A maintainer changing the version source or template substitution mechanism today has to find every copy.

**Why this priority**: Duplication is small in count but high in coupling cost — any future change to versioning or template expansion is a multi-file edit with a real risk of drift.

**Independent Test**: After consolidation, `grep` for the duplicated literal patterns (e.g., `PKG_PATH`, repeated `.split(...).join(...)` chains) finds at most one definition site each, and all existing tests pass unchanged.

**Acceptance Scenarios**:

1. **Given** the package version is needed by both the HTML generator and the live server, **When** a maintainer changes the version-resolution logic, **Then** they edit exactly one file.
2. **Given** the HTML template uses N substitution tokens, **When** a new token is added, **Then** the substitution call site grows by one entry, not by an additional `.split(...).join(...)` pair.
3. **Given** the existing unit and integration tests for `html-generator.ts` and `live-server/server.ts`, **When** the shared helpers are introduced, **Then** all tests pass and 100% line+branch coverage is preserved on `src/`.

---

### User Story 3 - Reorganize directory layout for discoverability (Priority: P2)

A new contributor scanning `src/` should be able to map a feature (e.g., "the stats block UI") to a single folder containing its component, hook, styles partial (if any), and test fixtures. Today, a feature's pieces are scattered across `src/frontend/components/`, `src/frontend/hooks/`, `src/shared/`, and `tests/unit/` with no visible grouping.

**Why this priority**: Improves contributor onboarding and reduces "where does this go?" decisions during future feature work. Same priority as US2 because the gain is comparable and the risk is similar (touches many import paths).

**Independent Test**: After the reorganization, every test file's `import` paths resolve and every test passes. A new contributor can list the files belonging to a named feature (stats, version label, JSON view, conversation view, raw pairs) by listing one directory under `src/`. Test files themselves do NOT move — `tests/unit|integration|e2e/` directory layout is preserved; only their `import` paths into `src/` update.

**Acceptance Scenarios**:

1. **Given** a maintainer asks "where does the StatsBlock live?", **When** they `ls` the relevant folder, **Then** the component, its hook (`useThrottledStats`), its CSS rules (or a comment pointing to `styles.css`), and its test all appear together.
2. **Given** the existing build and bundling pipeline (`vite`, `tsc`, copy of `template.html`), **When** files move, **Then** `npm run build` produces an output bundle of equivalent size (±2%) and the resulting `.html` report opens from `file://` with no missing assets.
3. **Given** all existing test files, **When** the layout changes, **Then** test files compile, run, and pass without changes to assertions.

---

### User Story 4 - Tighten types at module boundaries (Priority: P3)

Several call sites narrow `unknown` with single-use casts (`as { version: string }`, `as { type: string }`, `as HttpPair`) directly at the destructuring site. A maintainer reading these can't tell whether the cast is load-bearing for a runtime-validated payload or a shortcut around a missing type. Replacing these with named, reusable type guards and discriminated-union helpers (defined once in `src/shared/`) makes intent explicit.

**Why this priority**: Lowest immediate risk — current code is type-checked and tested — but the cleanup raises the floor for future safety. **Hard dependency**: US4 MUST land after US2 and US3; type guards live in the new shared/ layout produced by those stories, so US4 is NOT independently shippable. Reverting US3 cascades to also revert US4.

**Independent Test**: After the refactor, `grep -rE "\bas \{" src/` returns zero matches in non-test code, every public function still has documented `@param`/`@returns`, lint and typecheck are clean, and all existing tests pass.

**Acceptance Scenarios**:

1. **Given** the `useWebSocket` message handler decoding `{type: string}` payloads, **When** the refactor lands, **Then** decoding goes through a named type guard exported from `src/shared/`.
2. **Given** the `VersionLabel` and `live-server/server.ts` `/api/status` consumers both expect `{version, startedAtIso}`, **When** the type is consolidated, **Then** both sides import the same named type from `src/shared/`.
3. **Given** the existing 100% unit-coverage gate, **When** type guards are added, **Then** every guard has a unit test covering both the accept and reject branches.

---

### Edge Cases

- **Public CLI surface MUST NOT change.** `cc-trace attach`, `--help`, `--version`, exit codes, env-var names, on-disk session-file naming, and the proxy port behavior are all part of the user-visible contract and are out of scope for this refactor.
- **Self-contained HTML report MUST remain self-contained.** Any change that introduces a new external runtime asset (font, script, CSS) breaks the `file://` invariant and is rejected.
- **Wire-protocol events** between proxy → JSONL writer and proxy → WebSocket broadcaster (`'pair'` event payload shape) MUST NOT change; existing JSONL files written by `0.3.0` MUST still produce identical HTML when re-rendered.
- **What if a test is found that is brittle (asserts on file locations or symbol names rather than behavior)?** The test is rewritten to assert on behavior; the change is called out explicitly in the PR description and treated as a deviation requiring approval.
- **What if a deduplication target (US2) appears in fewer than two places after closer inspection?** The item is removed from scope rather than introducing a single-use abstraction.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All currently-passing tests in `tests/unit/`, `tests/integration/`, `tests/e2e/` MUST pass after the refactor with no modifications to test assertions, inputs, or expected outputs. Import-path updates and file relocations are permitted.
- **FR-002**: Quality gates MUST remain green: `npm run lint` (zero warnings), `npm run typecheck` (zero errors), unit coverage 100% on `src/` (with the existing exclusions documented in `CLAUDE.md`), integration coverage 100% on the excluded files, e2e coverage ≥70%.
- **FR-003**: After US1, no source file under `src/` (excluding `template.html` and any auto-generated bundle) MUST exceed 300 lines of code (hard ceiling). 250 LOC is the soft target; files in the 251–300 range MUST carry a one-line justification in the PR description naming the responsibility that resists further splitting (e.g., a long discriminated-union switch). LOC counts physical lines including imports, blank lines, and comments — i.e., `wc -l` of the source file. Files touched by the split MUST each have a single primary responsibility expressible in one sentence.
- **FR-004**: After US2, the package version string MUST be resolved by exactly one module in `src/shared/`, imported wherever needed.
- **FR-005**: After US2, the HTML-template token substitution MUST be performed by a single helper that accepts a token-to-value map; the helper MUST be unit-tested for empty maps, single token, and multiple tokens including overlapping substrings.
- **FR-006**: After US3, every UI feature listed in `CLAUDE.md` (StatsBlock, VersionLabel, ConversationView, JsonView, RawPairsView) MUST have its component and dedicated hook(s) discoverable by listing a single directory under `src/` per feature. Test files remain under `tests/unit|integration|e2e/` (no colocation); the only test-side change permitted is updating `import` paths to follow moved sources.
- **FR-007**: After US4, `grep -rnE "\bas \{[^}]" src/` MUST return zero matches in non-test source files. Inline `as unknown as X` and `@ts-ignore` MUST remain absent (already enforced by `CLAUDE.md`).
- **FR-008**: All shared types representing wire payloads (HTTP pair, status response, WebSocket frame) MUST live in `src/shared/types.ts` (or an explicitly named submodule of `src/shared/`) and MUST be imported by both the producing and consuming module — no parallel declarations.
- **FR-013**: `src/shared/` MUST contain only modules imported by both backend and frontend, OR by 2+ feature folders. Modules used by exactly one feature MUST move into the owning feature's folder. Audit results for current `src/shared/` contents:
  - `types.ts` → STAYS (true cross-boundary: backend writes, frontend reads).
  - `conversation.ts` → MOVES to `src/frontend/conversation/` (frontend-only, single-feature).
  - `stats.ts` → MOVES to `src/frontend/stats/` (single-feature).
  - `throttle.ts` → MOVES to `src/frontend/stats/` (single-feature; only consumer is `useThrottledStats`).
  - `json-path.ts` → MOVES to `src/frontend/jsonView/` (single-feature).
  Final eligible-for-shared check: a module re-enters `src/shared/` only if a second importer (cross-boundary or different feature) actually exists at refactor time — anticipated future use does not qualify.
- **FR-014**: Coverage-tier inheritance — when an existing source file under `src/` is split or renamed, every resulting file MUST inherit the original file's coverage classification (unit-excluded vs unit-required) listed in `CLAUDE.md`'s "Quality Gates" section. The same PR that performs the split MUST update both `CLAUDE.md`'s exclusion list and the `vitest.config.ts` (or equivalent tooling) exclusion globs to enumerate the new files. A unit-excluded file MUST NOT enter the unit-coverage pool through omission.
- **FR-009**: The CLI public surface (`cc-trace attach`, flags, exit codes, env vars, output file naming) MUST be unchanged. The e2e suite serves as the binding contract.
- **FR-010**: The on-disk JSONL line schema and the WebSocket message schema MUST be unchanged. A JSONL file written before the refactor MUST be readable by the post-refactor `report/html-generator.ts` and produce a byte-identical pair list (timestamps and version-string aside).
- **FR-011**: The self-contained HTML report MUST continue to open from `file://` with zero external network requests. Bundle size MUST NOT grow by more than 2% relative to the pre-refactor baseline. Baseline metric: uncompressed byte-size of the `.html` file produced by `report/html-generator.ts` when rendering a fixed JSONL fixture (the `tests/e2e/` mock-claude session). The US1 PR MUST: (a) record the baseline byte count in the Assumptions section of this spec, and (b) add a vitest e2e assertion that compares the freshly-rendered fixture's `.html` byte count against the recorded baseline, failing if delta exceeds ±2%. Subsequent story PRs (US2–US4) MUST keep that assertion green.
- **FR-012**: Each refactor user story MUST be delivered as one PR squash-merged into `002-structural-refactor`, producing exactly one commit per story on the feature branch. Merge order is fixed: **US1 → US2 → US3 → US4**. The feature branch then merges to `main` as a single PR. Revertability: US1, US2, US3 each MUST be revertable post-merge via `git revert <story-squash-sha>`. US4 is NOT independently revertable — reverting US2 or US3 cascades to also revert US4.

### Key Entities

- **Module**: A single source file under `src/`. Has a path, an LOC count, a public export list, and a "primary responsibility" description.
- **Shared helper**: A function or type exported from `src/shared/` that consolidates logic previously duplicated across two or more modules. Has a list of call sites and a unit-test file.
- **Feature folder**: A directory grouping all source files belonging to one user-facing UI feature (component, hooks, tests). Has a name matching the feature term used in `CLAUDE.md`.
- **Type guard**: A predicate function `(x: unknown) => x is T` exported from `src/shared/`. Replaces inline `as`-cast narrowing. Has paired accept/reject unit tests.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing test cases pass on the refactor branch with no edits to test assertions. Pass count on `npm run test` is identical to the pass count on the merge-base commit.
- **SC-002**: Zero source files under `src/` exceed 300 LOC after US1 lands. ≥90% of source files under `src/` are ≤250 LOC.
- **SC-003**: Duplicated literal patterns identified in scoping (PKG_VERSION resolution, template-token substitution chain, status-meta fetch-and-hydrate) appear in exactly one definition site each after US2.
- **SC-004**: For each of the five named UI features (StatsBlock, VersionLabel, ConversationView, JsonView, RawPairsView), a maintainer can list every source file belonging to that feature with a single directory listing after US3.
- **SC-005**: Inline `as { ... }` casts in non-test `src/` code drop to zero after US4.
- **SC-006**: Built HTML report bundle size — measured as uncompressed bytes of the `.html` rendered from the `tests/e2e/` mock-claude JSONL fixture — is within ±2% of the baseline byte count recorded in the Assumptions section by the US1 PR. Enforced by a vitest e2e assertion.
- **SC-007**: A reviewer unfamiliar with the changes can identify which user story (US1, US2, US3, US4) any individual commit/PR belongs to from its diff alone.
- **SC-008**: After US3, every UI feature listed in `CLAUDE.md` (StatsBlock, VersionLabel, ConversationView, JsonView, RawPairsView) resolves to exactly one directory under `src/frontend/`, and each such directory contains ≤6 source files. Verified by listing `src/frontend/{conversation,jsonView,rawPairs,stats,versionLabel}/` and asserting per-directory file counts.

## Assumptions

- The current test suite is treated as the **complete behavioral contract**. Behavior not covered by tests is considered intentional but not load-bearing; the refactor preserves it on a best-effort basis but does not add new tests for previously-untested behavior.
- "Refactor" here means **structural reshape only**: file splits, file moves, import-path changes, deduplication into shared helpers, and type-guard introduction. It does NOT include performance tuning, dependency upgrades, framework swaps, or behavior changes (those would warrant separate features).
- The two-tier LOC rule (hard 300, soft 250) defined in FR-003 / SC-002 is the binding interpretation. Any older "soft heuristic" framing is superseded.
- US4 is a P3 polish; if US1–US3 consume the available time budget, US4 can be deferred to a follow-up feature without blocking merge of US1–US3.
- Existing `CLAUDE.md` constraints (no `any`, no `@ts-ignore`, no `console.log` in `src/`, JSDoc on public functions, no literal colors in components, no new frontend runtime deps) continue to apply — this refactor MUST NOT relax them.
- The refactor will be implemented and merged on `002-structural-refactor`, not directly on `main`.
- **Bundle-size baseline (FR-011 / SC-006)**: TBD — the US1 PR MUST replace this placeholder with the recorded uncompressed byte-size of the `.html` rendered from the `tests/e2e/` mock-claude JSONL fixture at the merge-base commit. Format: `Baseline: NNNNN bytes (commit <sha>, fixture <path>)`. Until US1 lands, FR-011's ±2% gate is informational only.
