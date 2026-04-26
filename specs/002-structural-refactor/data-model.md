# Phase 1 — Data Model

For a refactor, the "data model" is the explicit table of file moves, splits, and new modules. Every transformation maps a current path to a target path with a one-sentence responsibility statement.

## US1 — File Splits

### `src/frontend/components/JsonView.tsx` (394 LOC) → 5 files in `src/frontend/jsonView/`

| Target file | LOC budget | Responsibility |
|---|---|---|
| `JsonView.tsx` | ≤120 | Container: owns `filter`, `filterTarget`, `lastFocused`; renders `JsonBreadcrumb` + per-pair `JsonTree` sections. |
| `JsonTree.tsx` | ≤120 | Per-tree wrapper: owns `useReducer`, sticky label header, Expand/Collapse-all buttons. |
| `JsonNode.tsx` | ≤200 | Single recursive node renderer: row, copy button, child dispatch. |
| `jsonViewReducer.ts` | ≤80 | Pure reducer: `JsonViewState`, `JsonViewAction`, `reducer`, `lookupExpanded`, `__all__` sentinel. |
| `JsonBreadcrumb.tsx` | ≤50 | Breadcrumb button: renders `formatJsonPath(lastFocused)`, copies on click. |

Public API at the import site: `export { JsonView }` from `src/frontend/jsonView/JsonView.tsx`. `App.tsx` and tests update only the import path.

### `src/frontend/components/ConversationView.tsx` (279 LOC) → 3 files in `src/frontend/conversation/`

| Target file | LOC budget | Responsibility |
|---|---|---|
| `ConversationView.tsx` | ≤140 | Container: groups pairs into turns, renders `TurnRow` per turn. |
| `TurnRow.tsx` | ≤120 | Per-turn row: global Turn #, `<TokenMeter>`, exhibit list. |
| `ExhibitList.tsx` | ≤80 | Auto-labeled exhibit rendering for tool calls + tool results. |

Public API at import site: `export { ConversationView }` from `src/frontend/conversation/ConversationView.tsx`. Plus `TokenMeter.tsx` moves into this folder (single consumer).

## US2 — Deduplication targets

| Current dup site (multi-file) | New shared module | Public API |
|---|---|---|
| `src/report/html-generator.ts:10` and `src/live-server/server.ts:13` (both `JSON.parse(fs.readFileSync(PKG_PATH...)) as { version: string }).version`) | `src/shared/version.ts` | `export const PKG_VERSION: string;` (resolved once at module load) |
| `src/report/html-generator.ts:54-64` (chained `.split(...).join(...)` for 5 tokens) | `src/shared/template.ts` | `export function substituteTokens(template: string, replacements: Record<string, string>): string;` |
| `src/frontend/components/VersionLabel.tsx` (read `window.ccTraceMeta` else `fetch('/api/status')` and hydrate) | Stays single-use → no extraction. Spec edge case ("If a deduplication target appears in fewer than two places, it is removed from scope") applies. | — |

**Note on the third item**: Re-audit during US2 implementation; only `VersionLabel` does the meta-fetch-and-hydrate dance today. If a second consumer is found during the audit, extract; otherwise document the negative finding in the US2 PR description.

## US3 — Moves (no logic change)

| From | To |
|---|---|
| `src/shared/conversation.ts` | `src/frontend/conversation/conversation.ts` |
| `src/shared/json-path.ts` | `src/frontend/jsonView/json-path.ts` |
| `src/shared/stats.ts` | `src/frontend/stats/stats.ts` |
| `src/shared/throttle.ts` | `src/frontend/stats/throttle.ts` |
| `src/frontend/components/StatsBlock.tsx` | `src/frontend/stats/StatsBlock.tsx` |
| `src/frontend/hooks/useThrottledStats.ts` | `src/frontend/stats/useThrottledStats.ts` |
| `src/frontend/components/VersionLabel.tsx` | `src/frontend/versionLabel/VersionLabel.tsx` |
| `src/frontend/hooks/useWebSocket.ts` | `src/frontend/versionLabel/useWebSocket.ts` (per R1) |
| `src/frontend/hooks/useWsReconnects.ts` | `src/frontend/versionLabel/useWsReconnects.ts` (per R1) |
| `src/frontend/components/RawPairsView.tsx` | `src/frontend/rawPairs/RawPairsView.tsx` |
| `src/frontend/components/TokenMeter.tsx` | `src/frontend/conversation/TokenMeter.tsx` |
| `src/frontend/components/JsonView.tsx` (whatever survives US1) | `src/frontend/jsonView/JsonView.tsx` |
| `src/frontend/components/ConversationView.tsx` (whatever survives US1) | `src/frontend/conversation/ConversationView.tsx` |

After US3, `src/frontend/components/` and `src/frontend/hooks/` are deleted (empty).

## US4 — Type guards introduced in `src/shared/guards.ts`

| Guard name | Replaces inline cast at | Shape |
|---|---|---|
| `isStatusMeta` | `src/frontend/versionLabel/VersionLabel.tsx` (status fetch parse) and `src/live-server/server.ts` (response shape) | `(x: unknown): x is { version: string; startedAtIso: string }` |
| `isPairWsFrame` | `src/frontend/versionLabel/useWebSocket.ts` (`payload.type === 'pair'` check) | `(x: unknown): x is { type: 'pair'; pair: HttpPair }` |
| `isMessagesBody` | `src/cli/commands/attach.ts:61` and `src/frontend/conversation/conversation.ts:116` (request body shape) | `(x: unknown): x is { messages: unknown[] }` |
| `isModelBody` | `src/frontend/conversation/conversation.ts:108,143` | `(x: unknown): x is { model?: string; system?: unknown }` |
| `isContentBody` | `src/frontend/conversation/ConversationView.tsx:23` | `(x: unknown): x is { content: ContentBlock[] }` |
| `isAddressInfo` | `src/live-server/server.ts:75` (`server.address() as { port: number }`) | `(x: unknown): x is { port: number }` (with `null` reject) |
| `isErrorWithCode` | `src/cli/options.ts:108` (`(err as { code?: string })?.code`) | `(x: unknown): x is { code?: string }` |
| SSE event narrowing (`message_start`, `content_block_start`, `content_block_delta`, `message_delta`) | `src/frontend/conversation/conversation.ts:43-69` | One discriminated-union guard `isAnthropicStreamEvent` plus per-type narrows, OR five small guards — to be decided in implementation; both satisfy FR-007. |

Each guard MUST have paired accept/reject unit tests (FR-007 + Acceptance Scenario 3 of US4).

## Vitest exclusion list deltas (FR-014)

`vitest.config.ts` `coverage.exclude` updates per story:

- **US1**: No moves yet, but new files (`bundle-size.test.ts` lives under `tests/e2e/`, not `src/`, so no exclusion change). Splits of `JsonView.tsx` / `ConversationView.tsx` produce files under `src/frontend/**`, already excluded by the broad `src/frontend/**` glob.
- **US2**: New files `src/shared/version.ts` and `src/shared/template.ts` are NOT excluded → they enter the unit pool and require 100% line+branch coverage. Their unit tests are added in the US2 PR.
- **US3**: Moves under `src/frontend/**` stay excluded by the broad glob. The move of `src/shared/conversation.ts` → `src/frontend/conversation/conversation.ts` removes it from the unit pool — the existing unit tests for it (`tests/unit/conversation.test.ts`) need to be reclassified or the file's coverage source-of-truth changed. **Decision**: reclassify by moving the test to `tests/integration/` is wrong (it has no I/O); instead, keep the test under `tests/unit/` and explicitly exclude `src/frontend/conversation/conversation.ts` from the `src/frontend/**` exclusion using a more specific include — OR adjust the coverage `include` to keep `src/shared/conversation.ts` style coverage. Cleanest: add `src/frontend/conversation/conversation.ts` to a new `coverage.include` list narrower than `src/frontend/**`. Implementation choice deferred to US3 PR.
- **US4**: New file `src/shared/guards.ts` is NOT excluded → enters unit pool, requires 100% line+branch via the paired accept/reject tests added in the US4 PR.

## Bundle-size baseline workflow (US1 PR)

1. On the `002-structural-refactor` branch HEAD, before any source edits, run a script that:
   - Builds the project: `npm run build`.
   - Renders `tests/e2e/fixtures/<chosen-fixture>.jsonl` → temporary `.html` via `report/html-generator.ts`.
   - Reports `wc -c` of the resulting `.html`.
2. Record the byte count + commit SHA + fixture path in `spec.md` Assumptions section, replacing the `TBD` placeholder.
3. Add `tests/e2e/bundle-size.test.ts`:
   ```ts
   it('US1+US2+US3+US4 do not bloat HTML report bundle by >2%', async () => {
     const baseline = 123456; // value from step 2
     const html = await renderFixtureHtml('mock-claude-session.jsonl');
     const delta = Math.abs(html.length - baseline) / baseline;
     expect(delta).toBeLessThanOrEqual(0.02);
   });
   ```
4. CI passes → US1 PR mergeable.

Subsequent stories (US2, US3, US4) keep this assertion green or fail loudly per FR-011 / SC-006.
