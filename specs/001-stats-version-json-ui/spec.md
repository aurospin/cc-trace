# Feature Specification: Session Stats Block, Version Display, and JSON Tab UI Improvements

**Feature Branch**: `001-stats-version-json-ui`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "1 - add a top block to display stats, such as # of turns, # of requests (post/get...), tokens - cache_read / cache_creation / input / output, 2. display version info, 3. suggestion UI improvement of JSON tabs"

## Clarifications

### Session 2026-04-26

- Q: For the JSON tab, how should request and response payloads be laid out? → A: Stacked vertically — request tree on top, response tree below, each with a sticky label header; single scroll context.
- Q: How should the session stats block be laid out at the top of the page? → A: Single row of inline pills/cells (one line tall, e.g. `Turns: 5 · Requests: 7 (POST 7 / GET 0) · cache_read: 12k · cache_creation: 800 · input: 1.2k · output: 3.4k`); not pinned on scroll.
- Q: How should the JSON tab surface a node's path? → A: Persistent breadcrumb bar at the top of the JSON view, showing the path of the last-clicked/focused node; clicking the bar copies the path to the clipboard.
- Q: How should token totals (and other counts) in the stats block be formatted? → A: Raw digits with thousands separators (e.g., `1,234,567`); no abbreviation. Locale: `en-US` grouping.
- Q: How are failed (non-2xx) requests handled in the stats block? → A: They count toward total request count and per-method breakdown; they contribute `0` to all token categories regardless of any partial `usage` payload.
- Q: How are cache-creation tokens broken down across TTL variants? → A: Three separate pills — `cache_creation_input_tokens` (legacy flat field), `cache_creation.ephemeral_5m_input_tokens`, and `cache_creation.ephemeral_1h_input_tokens` — each summed independently and rendered as its own pill. Total token pills shown becomes six: `cache_read`, `cache_creation_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `input`, `output`.
- Q: At what cadence does the stats block re-render in live mode? → A: Throttle re-renders to at most 4 per second (250 ms window) while a streaming response is in flight; flush an immediate update when a pair completes (so the post-stream snapshot is exact, not trailing-edge-blurred).
- Q: How is the version label disambiguated when `package.json` doesn't change between development builds? → A: Show the bare `package.json` version PLUS an ISO-8601 build/generation timestamp (e.g., `0.2.2 · 2026-04-26T14:33:01Z`). For static reports, the timestamp is the report-generation time; for the live dashboard, it is the server start time. No git SHA.
- Q: What is the keyboard-accessibility scope for the JSON tab in v1? → A: Mouse/hover only for v1. No required keyboard navigation, no shortcuts for expand/collapse/copy/path. Keyboard support is explicitly out of scope for this feature and is deferred to a follow-up.
- Q: With the stacked Request/Response layout, what is the scope of the Expand-all / Collapse-all controls? → A: Per-tree controls. The request tree and the response tree each get their own Expand-all / Collapse-all pair, and their expansion states are independent of one another.
- Q: How does the JSON tab filter input scope across the two stacked trees? → A: A single filter input with a target toggle that selects "Both" (default), "Request", or "Response". The toggle controls which tree(s) the filter expression is applied to.
- Q: What is the clipboard format when the user copies a JSON value or subtree? → A: Subtrees are copied as pretty-printed JSON with 2-space indentation and a trailing newline. Leaves are copied as their raw value (strings unquoted; numbers, booleans, and `null` as their JSON literal).
- Q: Should the stats block's turn count follow the Conversation tab's "Include single-message turns" toggle? → A: No — the stats block's turn count is fixed and always counts every conversational turn (equivalent to `parseHttpPairs(pairs, { includeAll: true })`), regardless of the toggle's runtime state. The stats and the transcript MAY show different counts when the user un-toggles "Include single-message turns".
- Q: How are sticky labels implemented for the stacked Request / Response JSON trees? → A: Single page scroll. Each tree's label uses `position: sticky; top: 0` inside its own section, so the label stays visible while scrolling past that tree's body within the page scroll; the next section's label takes over when its section enters the viewport. No nested scroll containers; no second scrollbar.
- Q: What does `<VersionLabel>` do in live mode if the initial `/api/status` fetch fails? → A: Render an empty placeholder (no visible error, no `unknown` fallback). Re-attempt the fetch every time the WebSocket reconnects, so a transient outage self-heals once the dashboard's existing reconnect logic fires. The label is informational, not load-bearing.
- Q: How is SC-003 ("stats reflect new pairs within 1 second") verified? → A: Automated unit test on `useThrottledStats`. The test MUST assert that, given a synthetic pair-completion event, a recompute fires within 1000 ms (use a generous tolerance to absorb CI clock noise; the FR-107 throttle of 250 ms makes the 1 s budget trivially satisfied in practice). No DOM-level integration test is required.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - At-a-Glance Session Stats Block (Priority: P1)

A developer reviewing a captured Claude Code session opens the report (or live dashboard) and immediately wants to know the *shape* of the session — how many conversational turns occurred, how many HTTP requests were captured, and how the token budget was spent across cache reads, cache creation, input, and output — without scrolling through transcripts or pair lists.

**Why this priority**: This is the headline of the report. Today users must scan the transcript or open individual pairs to understand session size and cost. A persistent header turns the report into a useful artifact for triage, cost analysis, and sharing with teammates. It also unifies information already computed for `TokenMeter` and `RawPairsView` into one place.

**Independent Test**: Open any existing `.html` report or run `cc-trace attach` and load the live dashboard. The top of the page shows a stats block with non-zero values for at least: turn count, request count (broken down by method), and the four token categories. Switching tabs (Conversation / JSON / Pairs) does not hide the block.

**Acceptance Scenarios**:

1. **Given** a captured session containing 5 conversational turns and 7 captured HTTP request/response pairs, **When** the user opens the report, **Then** the stats block displays "5 turns" and "7 requests" with a per-method breakdown (e.g., POST: 7, GET: 0).
2. **Given** a session whose responses include `cache_read_input_tokens`, `cache_creation_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `input_tokens`, and `output_tokens` in the usage payloads, **When** the user views the stats block, **Then** all six token categories display as separate, labeled values summed across the session.
3. **Given** a live `cc-trace attach` session in progress, **When** new request/response pairs arrive over the WebSocket, **Then** the stats block updates its counts and token totals without a page reload.
4. **Given** an empty session (no captured pairs), **When** the user opens the report, **Then** the stats block renders with zero values rather than collapsing or hiding (so users can confirm the report loaded correctly).
5. **Given** a session containing both streaming SSE responses and non-streaming JSON responses, **When** tokens are summed, **Then** usage from both response types is included exactly once each.

---

### User Story 2 - Version Info Display (Priority: P2)

A user looking at a generated `.html` report (potentially weeks or months after capture) needs to know which version of `cc-trace` produced it, so they can correlate report behavior with release notes, reproduce results, or report bugs against the right version.

**Why this priority**: Reports are long-lived artifacts and frequently shared. Without an embedded version stamp, users cannot tell whether a quirk in a report is a known issue in an older version or a current bug. This is low-cost to add and pays off every time a report is revisited.

**Independent Test**: Build the project, generate a report, and inspect the rendered page. The version string of the `cc-trace` build that produced the report is visible in the UI (no need to open DevTools or view source). The same version is visible in the live dashboard.

**Acceptance Scenarios**:

1. **Given** a report generated by `cc-trace` v0.2.2, **When** the user opens the `.html` file, **Then** the version `0.2.2` is displayed somewhere persistent in the UI (e.g., header or footer).
2. **Given** the user opens the live dashboard, **When** the page loads, **Then** the same version string is displayed in the same location as in static reports.
3. **Given** the user hovers or clicks the version label, **When** more detail is desired, **Then** the user can see at minimum the version number; additional metadata (capture date, mode) MAY also appear but is not required.

---

### User Story 3 - JSON Tab UI Improvements (Priority: P2)

A user inspecting raw API payloads in the JSON tab wants to navigate large, deeply nested objects efficiently — quickly finding fields of interest, expanding only the branches they care about, and copying values without selecting through indentation.

**Why this priority**: The JSON tab is one of the three primary views and is the only way to inspect full request/response shapes. Today the depth-indented collapsible tree works but lacks affordances common in modern JSON viewers (path display, copy, expand-to-depth, key search highlight). Improvements here disproportionately help debugging workflows. Priority P2 because it improves an existing working view rather than unblocking new use cases.

**Independent Test**: Open the JSON tab in any report. Verify each acceptance scenario below operates without page reload and without changes to other tabs.

**Acceptance Scenarios**:

1. **Given** a deeply nested JSON object (≥4 levels) is shown in the JSON tab, **When** the user clicks an "Expand all" / "Collapse all" control, **Then** all branches expand or collapse accordingly, and the choice does not persist into other pairs unless the user explicitly chooses to.
2. **Given** the user has the filter input focused, **When** the user types a key name, **Then** matching keys are highlighted in place and non-matching branches are visually de-emphasized or hidden (current filter behavior is preserved or improved, not regressed).
3. **Given** the user hovers any value or key, **When** a copy affordance appears, **Then** clicking it copies the value (for leaves) or the JSON subtree (for objects/arrays) to the clipboard.
4. **Given** the user hovers any node, **When** the path indicator is enabled, **Then** the dot/bracket path from root to that node is shown (e.g., `messages[0].content[1].text`) so the user can reference it elsewhere.
5. **Given** a request and response pair is selected, **When** the JSON tab renders, **Then** request and response are visually distinct (clear labels, separation, or side-by-side option) so they cannot be confused.
6. **Given** the user is browsing the JSON tab, **When** scope-altering actions happen (selecting a different pair, switching tabs), **Then** the user is not surprised by lost expand/collapse state for the *currently visible* pair within a single navigation back-and-forth.

---

### Edge Cases

- **Stats block with mixed/missing usage fields**: Older Anthropic responses may not include every token category (e.g., no `cache_read_input_tokens`, or only the legacy flat `cache_creation_input_tokens` with no TTL breakdown). Missing categories MUST display as `0`, not as blank or `—`, so totals add correctly. A response carrying only the legacy flat field contributes solely to the `cache_creation_input_tokens` pill (not to either ephemeral TTL pill).
- **Stats block with non-`/v1/messages` traffic**: When `--include-all-requests` is on, captured pairs may include unrelated requests with no usage. These MUST contribute to request counts but MUST NOT skew token totals. *(Flag renamed to `--conversations-only` with inverted default in v0.3.4 — capture-all is now default; the flag opts into the filter.)*
- **Streaming response interrupted before final `message_delta`**: Token totals for that message use whatever usage events did arrive (e.g., `message_start.usage`); incomplete is preferred over omitted.
- **Version display in static report opened offline**: Version string MUST be embedded at build/generation time, not fetched at runtime.
- **Live `/api/status` fetch failure**: If the initial fetch on mount fails (network blip, transient server unavailability), `<VersionLabel>` MUST render an empty placeholder (no visible error, no `unknown` fallback) and MUST re-attempt the fetch every time the WebSocket reconnects, so the label self-heals once the dashboard's existing reconnect logic fires.
- **JSON tab on extremely large bodies (>1 MB pretty-printed)**: Expand-all SHOULD remain responsive (no UI lockup beyond ~1 second on a typical developer machine); if a hard limit is needed, a clear notice MUST be shown.
- **Live dashboard reconnect**: After a transient WebSocket drop, stats MUST reconcile to the same totals a fresh page load would show — no double-counting.

## Requirements *(mandatory)*

### Functional Requirements

#### Session Stats Block (FR-100 series)

- **FR-101**: The report and live dashboard MUST display a persistent stats block at the top of the page, visible regardless of which tab (Conversation / JSON / Pairs) is active. The block MUST be a single row of inline pills/cells (target one line of vertical space) and MUST scroll with the page rather than pin to the viewport.
- **FR-102**: The stats block MUST display the total number of conversational turns in the session, using the same turn-grouping logic as the Conversation view (`parseHttpPairs`) but with `includeAll: true` always — i.e., the count is fixed and MUST NOT change in response to the Conversation tab's "Include single-message turns" toggle. When the toggle is off, the stats count and the transcript-row count MAY differ; this is intentional, so the stats block remains a stable session-wide headline.
- **FR-103**: The stats block MUST display the total number of captured HTTP request/response pairs, with a per-method breakdown for at least `POST` and `GET`. Other methods that appear MUST also be shown.
- **FR-104**: The stats block MUST display six separate token totals — `cache_read` (from `cache_read_input_tokens`), `cache_creation_input_tokens` (legacy flat field), `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `input` (from `input_tokens`), and `output` (from `output_tokens`) — each summed independently across all `/v1/messages` responses in the session. The three cache-creation variants MUST NOT be merged into a single bucket. Numeric values (turn count, request counts, and all six token totals) MUST be rendered as raw digits with thousands separators using `en-US` grouping (e.g., `1,234,567`); abbreviation (`1.2M`, `12k`) MUST NOT be used.
- **FR-105**: Token totals MUST be derived from response `usage` payloads (both streaming SSE and non-streaming JSON), summed exactly once per message.
- **FR-106**: When a usage field is absent from a response, that response MUST contribute `0` to the corresponding category (no error, no skipped row).
- **FR-106a**: Failed (non-2xx) request/response pairs MUST be counted toward the total request count and per-method breakdown (FR-103), but MUST contribute `0` to all six token categories regardless of any `usage`-shaped payload that may appear in the error body.
- **FR-107**: In live mode, the stats block MUST update incrementally as new pairs arrive over the WebSocket, without requiring a page reload. While a streaming response is in flight, re-renders MUST be throttled to no more than 4 per second (250 ms window). When a request/response pair completes, an immediate (non-throttled) re-render MUST occur so that the post-completion snapshot exactly matches the final summed totals.
- **FR-108**: An empty session MUST render the stats block with all-zero values rather than hiding the block.

#### Version Display (FR-200 series)

- **FR-201**: Both the static HTML report and the live dashboard MUST display the `cc-trace` version that produced/served them, in a fixed UI location (header or footer).
- **FR-202**: The version string in static reports MUST be embedded at report generation time and MUST NOT require a network request to render.
- **FR-203**: The displayed version MUST match the `version` field in `package.json` of the build that generated/served the report.
- **FR-204**: Alongside the version, the UI MUST display an ISO-8601 timestamp (UTC, e.g., `2026-04-26T14:33:01Z`) rendered as `<version> · <timestamp>`. For a static HTML report, the timestamp MUST be the report-generation time (captured when `report/html-generator.ts` runs). For the live dashboard, the timestamp MUST be the live-server start time. The timestamp MUST be embedded at generation/start time, not computed at view time.

#### JSON Tab UI Improvements (FR-300 series)

- **FR-301**: The JSON tab MUST provide an "Expand all" and a "Collapse all" control for **each** of the two stacked trees (one pair on the request tree, one pair on the response tree). The request and response trees MUST maintain independent expansion state — operating one tree's controls MUST NOT alter the other tree's expansion state.
- **FR-302**: The JSON tab MUST allow the user to copy any leaf value or any subtree (object/array) to the clipboard via a hover-revealed control. Clipboard format MUST be:
  - **Subtree (object/array)**: pretty-printed JSON with 2-space indentation and a single trailing newline (e.g., `JSON.stringify(node, null, 2) + "\n"`).
  - **Leaf — string**: the raw string value, no surrounding quotes, no escape transformations.
  - **Leaf — number, boolean, `null`**: the JSON literal form (e.g., `42`, `true`, `null`).
- **FR-303**: The JSON tab MUST display a persistent breadcrumb bar at the top of the JSON view that shows the dot/bracket path (e.g., `messages[0].content[1].text`) of the last-clicked or focused node. Clicking the breadcrumb bar MUST copy the displayed path to the clipboard. When no node is selected, the breadcrumb MUST show the root (`$` or empty state placeholder).
- **FR-304**: The JSON tab MUST display request and response payloads stacked vertically (request on top, response below) within a single page scroll context (no nested scrollbars). Each tree MUST have a label header rendered with `position: sticky; top: 0` inside its own section, so the label remains visible while the user scrolls past that tree's body in the page scroll; once the tree's section leaves the viewport, the next section's sticky label takes over.
- **FR-305**: The existing filter behavior MUST be preserved or improved; existing keyboard/typing flow MUST NOT regress. The JSON tab MUST expose a **single** filter input paired with a target toggle whose options are `Both`, `Request`, and `Response`. The default target MUST be `Both`. The filter expression MUST apply to the tree(s) selected by the target toggle, leaving any tree not in scope unfiltered (fully visible). Switching the target MUST re-apply the current filter expression to the new scope without requiring the user to retype.
- **FR-306**: Expand/collapse and filter state for a given pair MUST NOT bleed into unrelated pairs (state is scoped per pair view).

### Key Entities *(include if feature involves data)*

- **Session Stats**: A derived, in-memory aggregate computed from the same pair list that already powers existing views. Attributes: `turnCount`, `requestCount`, `requestsByMethod` (map of method → count), `tokens.cacheRead`, `tokens.cacheCreationInput` (legacy flat `cache_creation_input_tokens`), `tokens.cacheCreation5m` (`cache_creation.ephemeral_5m_input_tokens`), `tokens.cacheCreation1h` (`cache_creation.ephemeral_1h_input_tokens`), `tokens.input`, `tokens.output`. No new persistence; it is recomputed on render and updated incrementally in live mode.
- **Version Info**: A single string (the package version at build/generation time), attached to the report payload (alongside the existing pairs payload) and surfaced in the live dashboard via the same mechanism that already serves status to the UI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user opening any generated report can identify total turns, total requests (with method breakdown), and all six token totals within 5 seconds without scrolling or interacting with tabs.
- **SC-002**: For any session, the stats block's turn count exactly equals the number of turns the Conversation tab renders **with "Include single-message turns" enabled** (the default); when the user disables that toggle, the stats count and the visible transcript-row count MAY differ, by design. The request count exactly equals the row count of the Pairs tab. The six token totals each exactly equal the sum of their corresponding `usage` fields across all responses (verifiable by inspection).
- **SC-003**: In live mode, the stats block reflects newly arrived pairs within 1 second of the pair appearing in the Pairs tab. Verified by an automated unit test on `useThrottledStats` that asserts a recompute fires within 1000 ms of a synthetic pair-completion event.
- **SC-004**: 100% of generated reports display a version string matching `package.json` at build time, verifiable by opening the file and reading the UI.
- **SC-005**: After the JSON tab improvements ship, a user inspecting a 4-level-nested response can collapse-all, expand a single branch they care about, and copy that branch in three or fewer clicks (vs. depth-by-depth toggling today).
- **SC-006**: No regression: existing JSON filter, depth indentation, and tree rendering continue to work; existing 100% unit coverage on `src/` is maintained.

## Assumptions

- **Stats source of truth**: Turn count is derived via the existing `parseHttpPairs` grouping logic in `src/shared/conversation.ts` so the number always matches the Conversation view. Token totals are derived from the same `usage` parsing already used by `TokenMeter` (streaming `message_start` + `message_delta`, and non-streaming JSON `usage`). No new capture or persistence is added.
- **Stats placement**: A single header block above the tab bar is preferred over per-tab variants, both because the data is global to the session and to keep `data-mode` static/live theming consistent across tabs.
- **Token category labels**: The six labels are `cache_read`, `cache_creation_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `input`, `output`, matching the Anthropic API field names users will recognize from raw payloads. Labels MAY be presented in shortened display form (e.g., "cache_read", "cc_input", "cc_5m", "cc_1h", "input", "output") to fit the inline pills row, but the underlying mapping is 1:1 with API field names and the full path MUST be discoverable (e.g., via title/tooltip).
- **Version source**: The version comes from `package.json` and is injected into the report payload by `report/html-generator.ts` at generation time, and exposed to the live dashboard via the existing live-server status mechanism (e.g., `/api/status`). No new build tooling.
- **JSON tab scope**: Improvements are additive; the existing hand-written tree (no `react-json-view` etc.) is retained per project constraints. "Expand to depth N" beyond expand-all/collapse-all is out of scope for v1.
- **Out of scope for this feature**: Cost-in-dollars display, charts/graphs, exporting the stats block as a separate artifact, persisting per-user JSON-tab preferences across sessions, and keyboard navigation/shortcuts in the JSON tab (mouse/hover only in v1). These may be follow-ups.
- **Theming**: All new UI elements MUST use existing CSS variables in `frontend/styles.css`; no literal colors per project constraints.
