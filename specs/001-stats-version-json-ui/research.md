# Phase 0 Research: Session Stats, Version Display, JSON Tab UI

All NEEDS CLARIFICATION items in Technical Context have been resolved against the existing codebase and the spec's clarifications session (2026-04-26). No remaining unknowns.

---

## R1 — Stats source of truth

**Decision**: Compute `SessionStats` in a new pure module `src/shared/stats.ts`. Turn count delegates to `parseHttpPairs(pairs, { includeAll: true })` (already in `src/shared/conversation.ts`); the stats block always counts every conversational turn, independent of the Conversation tab's "include single-message turns" toggle. Token totals iterate raw `HttpPair[]` and read `usage` from JSON bodies (`response.body.usage`) and from streaming SSE bodies (`response.body_raw`, parsing `message_start.message.usage` for input/cache fields and `message_delta.usage.output_tokens` for output).

**Rationale**: This matches the spec's Assumptions section ("turn count is derived via the existing `parseHttpPairs` grouping logic") and avoids divergence from the Conversation tab. Reading `usage` directly from the raw pair shape (rather than going through the existing `extractUsage` helper in `TokenMeter.tsx`) is required because `extractUsage` collapses the three cache-creation TTL variants into a single `cacheCreate` field, and the spec requires three separate pills (FR-104). `TokenMeter.tsx` is intentionally left untouched — the new stats aggregator is a superset, not a replacement.

**Alternatives considered**:
- Reuse and extend `extractUsage` → rejected. Widening it to expose three cache-creation fields would force a `TokenMeter` refactor that this PR is not scoped for (Principle VI: surgical changes).
- Aggregate in `App.tsx` → rejected. Keeps logic untestable at the unit tier.
- Persist stats in JSONL → rejected. Spec assumes "no new capture or persistence."

---

## R2 — Six token totals & failed-request handling

**Decision**: For each `HttpPair`, ignore the response if `pair.response === null` OR `pair.response.status_code >= 400` OR the request URL does not contain `/v1/messages` (token totals only). Otherwise sum into six fields:

| Field | API source |
|---|---|
| `cacheRead` | `usage.cache_read_input_tokens` |
| `cacheCreationInput` | `usage.cache_creation_input_tokens` (legacy flat field) |
| `cacheCreation5m` | `usage.cache_creation.ephemeral_5m_input_tokens` |
| `cacheCreation1h` | `usage.cache_creation.ephemeral_1h_input_tokens` |
| `input` | `usage.input_tokens` |
| `output` | `usage.output_tokens` |

For streaming responses, `usage` is split across events: `message_start.message.usage` carries `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, and the `cache_creation` object; `message_delta.usage` carries `output_tokens`. A missing field contributes `0`, never throws (FR-106).

Request counts and per-method breakdown count **all** pairs (including failures and non-`/v1/messages` traffic when `--include-all-requests` is on), per FR-103 and FR-106a. *(Flag renamed to `--conversations-only` with inverted default in v0.3.4: capture-all is now the default; the flag opts into the filter.)*

**Rationale**: Direct mapping to the Anthropic response shape; matches the spec's clarifications (failed pairs count toward request totals but contribute zero tokens; legacy flat field stays separate from the two TTL variants).

**Alternatives considered**:
- Sum the legacy flat field into `cacheCreation5m` for "newer" responses → rejected. The spec explicitly forbids merging.
- Treat 5xx as separate from 4xx → rejected. Spec's rule is "non-2xx" — one bucket.

---

## R3 — Number formatting (`en-US` thousands separators)

**Decision**: Use `new Intl.NumberFormat("en-US").format(n)` to render every numeric in the stats block. Locale is hardcoded `"en-US"` regardless of the user's browser locale, so a report shared with a colleague in a different locale renders identically (FR-104).

**Rationale**: `Intl.NumberFormat` is in the JS standard library — no dependency. Hardcoding the locale satisfies the spec's "Locale: `en-US` grouping" requirement and aligns with the self-contained-artifact principle (no implicit dependence on viewer environment).

**Alternatives considered**:
- `n.toLocaleString()` (no locale arg) → rejected. Result varies by browser locale; defeats portability.
- Hand-rolled grouping with regex → rejected. Reinvents `Intl` for no benefit.

---

## R4 — Live re-render throttling (≤ 4/s during stream, immediate on completion)

**Decision**: The new `<StatsBlock>` receives the live `pairs` array as a prop (same source of truth `App.tsx` already uses). Throttling is a render concern: wrap the derivation in a custom hook `useThrottledStats(pairs, 250)` that:

1. Holds the most recently computed `SessionStats` in `useState`.
2. On each `pairs` change, checks whether the last pair has `response === null` (in-flight). If so, schedule recomputation via `setTimeout(..., 250 - elapsed)` clamped to ≥ 0; coalesce repeated changes within the window.
3. If the last pair transitions from `response === null` → non-null (pair completed), or any new completed pair is appended, flush immediately (cancel pending timer, recompute now).

Static mode renders synchronously (no throttling, no timer) — `data-mode="static"` skips the timer branch since the pairs array is frozen.

**Rationale**: A render-side throttle keeps the WebSocket and broadcaster paths untouched (Principle VI). Coalescing at the component edge is cheaper than at the broadcaster, where multiple clients would each need their own cadence.

**Alternatives considered**:
- Throttle in `useWebSocket.ts` → rejected. Would slow down `RawPairsView` and `ConversationView` too — out of scope and behavior-changing.
- Use `requestAnimationFrame` → rejected. RAF cadence is not capped at 4 Hz; doesn't match the spec's 250 ms window.
- Debounce instead of throttle → rejected. Debouncing delays the first update, which would hide the first incoming pair until the stream completes.

---

## R5 — Version + ISO-8601 timestamp injection

**Decision**: Two delivery paths, both producing the same `window.ccTraceMeta = { version: string, generatedAt: string }` shape consumed by a single `<VersionLabel>` component.

- **Static report**: `report/html-generator.ts` reads `version` from `package.json` once at startup (using `import.meta.url` to resolve, falling back to `process.cwd()/package.json` only if needed) and computes `new Date().toISOString()` at the moment of generation. Both values are inlined into `template.html` via two new placeholders `__CC_TRACE_VERSION__` and `__CC_TRACE_GENERATED_AT__`. The template emits `window.ccTraceMeta = { version: "...", generatedAt: "..." }` in a second inline `<script>` tag adjacent to the existing `window.ccTraceData` script.
- **Live dashboard**: `live-server/server.ts` reads `version` from `package.json` once at module init and captures `startedAtIso = new Date().toISOString()` at the moment `startLiveServer()` is invoked. Both are returned from `GET /api/status` (additive to the existing fields). The frontend `<VersionLabel>` falls back to fetching `/api/status` once on mount when `window.ccTraceMeta` is absent (live mode) and seeds `ccTraceMeta` from the response. This keeps a single read path in the component.

**Rationale**: One component, one shape, two embed points — matches Principle III (one component tree). Reading `package.json` at server-init time avoids per-request disk reads. The ISO string is locked at start time per FR-204 ("MUST be embedded at generation/start time, not computed at view time").

**Alternatives considered**:
- Inject version via Vite `define` at frontend build time → rejected. Would still need a separate timestamp injection per report, and would couple frontend bundle rebuilds to every patch version bump (slower iteration).
- Surface version as a WebSocket message → rejected. `/api/status` already exists for this exact role; adding a second channel duplicates state.
- Omit timestamp; rely on file mtime → rejected. mtime is lost when reports are emailed, copied between filesystems, or attached to issue trackers — defeating the disambiguation goal.

---

## R5a — `<VersionLabel>` retry-on-WS-reconnect mechanism

**Decision**: Add a sibling hook `useWsReconnects(): number` in `src/frontend/hooks/useWsReconnects.ts` that returns a monotonically-increasing reconnect counter. The existing `useWebSocket` is modified minimally — increment an internal counter ref each time the reconnect loop calls `connect()`, and expose it via the new sibling hook (which reads from the same module-level state, or via a small subscription primitive). `<VersionLabel>` consumes `useWsReconnects()` and re-runs its `/api/status` fetch in a `useEffect` whenever the counter advances AND `window.ccTraceMeta` is still absent.

**Rationale**: Keeps `useWebSocket`'s public return signature stable (today returns the parsed `pairs` array). Other consumers (`App.tsx`) are unaffected. Isolating the reconnect-aware behavior in its own hook means the `<VersionLabel>` retry logic stays colocated with the component that needs it, and the contract is unit-mockable (a test fixture can stub `useWsReconnects` to drive re-fetches deterministically).

**Alternatives considered**:
- Widen `useWebSocket` to return `{ pairs, reconnects }` → rejected. Forces every existing consumer to destructure or accept a breaking change for a one-component need.
- Use a CustomEvent on `window` (`window.dispatchEvent(new Event("cc-trace:ws-reconnect"))`) → rejected. Couples the React tree to global event bus state, harder to test, and surprising for future readers grepping the codebase.
- Use React Context to broadcast reconnect events → rejected. Provider plumbing for a single consumer is overkill; a sibling hook reading the same ref is one fewer abstraction.

---

## R6 — JSON tab: stacked req/resp + target toggle + breadcrumb + per-tree controls

**Decision**:

- **Layout**: Single scroll container. Inside, two `<section>` blocks — `<JsonTree label="Request" />` then `<JsonTree label="Response" />`. Each section has a sticky header (`position: sticky; top: 0;`) inside its own scroll context using a wrapping element with `overflow: auto` + `max-height: 50vh` (or natural flow with sticky inside the page scroll — to be decided in implementation; the contract is "labels stay visible while scrolling within the tree", FR-304). Default to natural-flow sticky inside the page scroll for v1 (simpler, no nested scrollbars).
- **Target toggle**: Three-button toggle (`Both` | `Request` | `Response`) next to the filter input. The current filter value is passed to a tree only when the toggle includes that tree; otherwise the tree receives `filter=""` (renders fully expanded-eligible, no de-emphasis).
- **Breadcrumb**: Persistent `<button>` styled as a bar at the top of the JSON view, showing `hoveredPath` (existing state) updated to `lastFocusedPath` — the path of the last node the user moused over OR clicked. Clicking the bar copies the path to clipboard via `navigator.clipboard.writeText`. When no path has been focused, render `$` as the empty-state placeholder.
- **Expand-all / Collapse-all per tree**: Each `<JsonTree>` owns its expansion state via a `useReducer` keyed by node path. The Expand-all button dispatches `{ type: "expand", target: "all" }`; Collapse-all dispatches `{ type: "collapse", target: "all" }`. Trees are independent: passing different reducer instances to each `<JsonTree>` is sufficient.
- **Copy controls**: A hover-revealed `<button>` per row (CSS `:hover` reveals it; mouse-only per spec — keyboard explicitly out of scope for v1). Copy formatter lives in `src/shared/json-path.ts`:
  - object/array → `JSON.stringify(node, null, 2) + "\n"`
  - string → raw value, no quotes
  - number/boolean/null → JSON literal (`String(n)`, `String(b)`, `"null"`)

**Rationale**: Reuses the existing `JsonNode` recursion; the changes are layout (stacked, sticky labels), state ownership (per-tree expansion via reducer instead of per-node `useState`), and additive controls (toggle, breadcrumb-as-button, copy-on-hover). The pure formatter in `src/shared/` keeps the unit-tier 100% bar achievable without React Testing Library acrobatics for the formatting rules.

**Alternatives considered**:
- Side-by-side req/resp columns → rejected. Spec clarification chose stacked vertical with single scroll context.
- Two filter inputs (one per tree) → rejected. Spec clarification chose single input + target toggle.
- Migrate to `react-json-view` or similar → rejected by project constraint ("no frontend runtime deps beyond React").
- Keep per-node `useState` and just add bulk-toggle messaging via context → rejected. State scattered across the tree makes "expand all" require either context propagation (re-render storm) or a tree walk; a single reducer keyed by path is simpler and keeps state colocated with the tree.

---

## R7 — Per-pair state isolation (FR-306)

**Decision**: Each pair view in `JsonView` is rendered with a `key={pairId}` (e.g., `key={pair.logged_at + i}`) so that React unmounts/remounts the tree when the user selects a different pair, naturally resetting expansion and (per-tree) filter state. The single filter input and target toggle are owned by `JsonView` itself (parent), not by the per-pair tree, so they persist across pair selection — but expansion and any per-tree-derived state reset.

Note: `JsonView` today renders one merged tree over the entire `pairs` array. The new layout splits this into per-pair Request/Response sections; the unmount-on-pair-change pattern only matters once per-pair selection is exposed. For v1 the JSON tab continues to render the entire pairs array, but each pair's request and response get their own `<JsonTree>` instances with independent reducers, satisfying FR-306 by construction (no shared expansion state across pairs).

**Rationale**: React's `key` reconciliation is the simplest and most reliable per-pair isolation primitive — no manual cleanup, no stale-state bugs.

**Alternatives considered**: Manual `useEffect`-based reset on pair change → rejected. Easy to forget a state slice; unmount is total.

---

## R8 — CSS theming for new elements

**Decision**: New CSS custom properties (added to both `:root` and `:root[data-mode="live"]`):

- `--stats-pill-bg`, `--stats-pill-fg`, `--stats-pill-border`
- `--breadcrumb-bg`, `--breadcrumb-fg`
- `--copy-btn-bg`, `--copy-btn-fg`, `--copy-btn-hover-bg`
- `--sticky-label-bg`

All new component CSS references only these vars (and existing ones like `--rule-soft`, `--ink-mid`); no literal color values in `StatsBlock.tsx`, `VersionLabel.tsx`, or the modified `JsonView.tsx`.

**Rationale**: Principle III. The static "Bound Transcript" and live "Wire Room" aesthetics derive entirely from `data-mode` switching at the `:root` level.

**Alternatives considered**: Reuse existing vars like `--paper-edge` for pill backgrounds → partially adopted where tonally correct, but new semantic vars are added so a future restyle can move pills without affecting page chrome.

---

## R9 — Frontend unit tests (new to this repo)

**Decision**: Frontend component tests are out of scope for this PR. The pure derivations (`src/shared/stats.ts` and `src/shared/json-path.ts`) are unit-tested at 100% coverage as required by Quality Gates. Component behavior (StatsBlock rendering, JsonView toggle/breadcrumb interaction, VersionLabel) is exercised at the integration tier through `live-server.test.ts` (assert `/api/status` payload) and at the e2e tier through the existing `attach.test.ts` (assert generated `.html` contains the version string and a stats-block DOM marker).

**Rationale**: Adding React Testing Library + jsdom is a new runtime concern that exceeds the spec's scope. The existing tier contracts (Constitution Principle IV) already cover the semantic surfaces — derivation correctness (unit), API surface (integration), and end-to-end embedding (e2e). UI interaction correctness for v1 is verified manually per the spec's Independent Test sections.

**Alternatives considered**:
- Add `@testing-library/react` + `jsdom` and write component tests → rejected for v1 scope. Acknowledged as a likely follow-up if the JSON tab grows further interactivity.
- Promote the e2e tests to assert specific stats values → adopted in part: e2e will assert presence of the stats-block container and version text; precise number formatting is covered by unit tests on `formatStatsLabel(stats)` helpers.

---

## Open follow-ups (NOT this PR)

- Keyboard accessibility for the JSON tab (deferred per spec clarification).
- Component-level unit tests with React Testing Library (deferred per R9).
- Cost-in-dollars display, charts, and stats-block export (out of scope per spec).
