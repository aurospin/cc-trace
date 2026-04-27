# Feature Specification: Cross-Tab Pair-Number Correlation

**Feature Branch**: `003-tab-numbering-correlation`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Co-relate the Turn # in the TRANSCRIPT tab to PAIRS tab and JSON tab. The numbering in PAIRS and JSON also have to match with each other."

## Clarifications

### Session 2026-04-26

- Q: When does a pair's index get assigned? → A: At request-receive time — the proxy assigns the index when it first observes the inbound HTTPS request (before the pair completes). Streaming responses keep their assigned slot regardless of upstream arrival order.
- Q: Where does the index live in the JSONL record? → A: Persisted as an explicit field on each record (e.g. `pairIndex`). Loaders use the field when present and fall back to line-order derivation for legacy JSONL written before this feature.
- Q: What prefix word do the three tabs use? → A: Transcript renders `Turn NN` (unchanged). Pairs renders `Pair NN`. JSON renders `Pair NN` in each Request/Response section header. Different prefix words reinforce the conversation-layer (Transcript) vs HTTP-layer (Pairs/JSON) distinction; the matching trailing number is the cross-tab anchor.
- Q: When does an in-flight pair become visible in Pairs and JSON in live mode? → A: Immediately on request-receive. Pairs/JSON render `Pair NN` with a "pending" placeholder as soon as the proxy observes the request; the row hydrates with response data when the pair completes. Transcript still waits for completion (since it depends on assembled message content). Index order in Pairs/JSON is therefore monotonic and gap-free in real time.
- Q: How does the system handle an in-flight pair that never completes (abort, timeout, proxy-process exit before response)? → A: Persist the request with a terminal error state. The JSONL record carries the request, no response body, and a status discriminator (e.g. `aborted`, `timeout`). Pairs/JSON show `Pair NN — <status>` permanently. The assigned index is never reclaimed; the JSONL invariant of one record per assigned index is preserved.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Find the same pair in any tab by its number (Priority: P1)

A user reading the Transcript notices something interesting in `Turn 04` — say, an unusual cache_creation token jump. They switch to the Pairs tab to scan the raw HTTP context, then to the JSON tab to inspect the raw request/response body. Without correlated numbering, they have to count rows or guess by timestamp. With this feature, the same pair is labeled `04` (or equivalent) in all three tabs. Click-through is unambiguous.

**Why this priority**: This is the user's stated request and the entire point of the feature. Without it, every cross-tab navigation is a manual reconciliation exercise — particularly painful in long sessions (50+ pairs) where row positions don't match because the Transcript hides single-message turns.

**Independent Test**: Capture a session with at least 5 conversation turns. Open the report, note the Turn # of any visible Transcript turn. Switch to Pairs tab — a row with that exact same number must be visible. Switch to JSON tab — a section with that exact same number must be visible. The corresponding row/section must contain the same request URL and response status as the Transcript turn shows. Repeat for three different turns including one that is hidden by the "Include single-message turns" filter (its number must appear in Pairs and JSON but be skipped — not renumbered — in Transcript).

**Acceptance Scenarios**:

1. **Given** a captured session with 7 pairs (4 displayable Transcript turns + 3 single-message warm-ups hidden when the checkbox is off), **When** the user views the Transcript tab with the default filter, **Then** the visible Turn labels read as a non-contiguous sequence (e.g. `Turn 02`, `Turn 03`, `Turn 05`, `Turn 06`) — the missing numbers correspond to the hidden pairs and are NOT collapsed into a renumbered `01–04`.
2. **Given** the same session, **When** the user opens the Pairs tab, **Then** every row shows its assigned label (e.g. `Pair 01`, `Pair 02`, `Pair 03`, `Pair 04`, `Pair 05`, `Pair 06`, `Pair 07`) and the row labeled `Pair 05` corresponds 1:1 to the pair shown as `Turn 05` in Transcript.
3. **Given** the same session, **When** the user opens the JSON tab, **Then** every Request/Response section header shows the same `Pair NN` label as the Pairs row for the same pair, and selecting section `Pair 05` reveals the request body that, in Transcript, drives `Turn 05`.
4. **Given** the user toggles "Include single-message turns" ON in the Transcript tab, **When** previously-hidden turns appear, **Then** those turns appear with their pre-assigned stable numbers (`Turn 01`, `Turn 04`, `Turn 07` in the example) — no other turn's number changes.
5. **Given** a captured session that includes non-`/v1/messages` requests (only possible without `--conversations-only`), **When** the user views Pairs and JSON, **Then** those pairs receive a number too (continuing the same sequence) — but they never appear in Transcript, and their numbers are simply absent from the Transcript number sequence.

---

### User Story 2 — Stats block "turns" count matches what users see (Priority: P2)

The masthead StatsBlock shows a `turns` total. Today this number derives from a different definition than the Transcript Turn #s, so a 12-turn report can read `turns: 18` because the stats counter ignores the display filter and includes single-message warm-ups. Users naturally expect the headline number to equal what they can scroll past in the Transcript.

**Why this priority**: A nice-to-have alignment that reduces "why don't these numbers match?" friction, but does not block the primary user journey in P1. Tackled second so the P1 cross-tab numbering can be defined first; the StatsBlock then aligns to that definition.

**Independent Test**: Capture a session, open the report, count the Turn #s visible in the Transcript (with the default filter setting). The StatsBlock `turns` value MUST equal that count. Toggle the "Include single-message turns" checkbox on; the count must update to match the new visible total. The total in the StatsBlock and the highest visible Turn # in the Transcript must always agree on what "turns" means.

**Acceptance Scenarios**:

1. **Given** a session of 10 captured pairs of which 7 pass the Transcript display filter, **When** the user views the report with the filter ON, **Then** StatsBlock `turns` reads `7` and the Transcript shows 7 visible turn rows.
2. **Given** the same session, **When** the user toggles the filter OFF (showing all 10), **Then** StatsBlock `turns` updates to `10` and 10 turn rows are visible.

---

### Edge Cases

- **Empty session**: zero pairs captured. All tabs render empty; no numbering is shown; StatsBlock `turns: 0`.
- **Live mode mid-stream**: when the proxy observes a new inbound request, it broadcasts the assigned `Pair NN` immediately. Pairs and JSON render the row right away in a "pending" state (header label visible; body shows a pending placeholder). When the pair completes, the row hydrates with full request/response data via a second broadcast. Transcript waits for completion (it depends on assembled message content) and may still suppress the row if the display filter excludes it.
- **Capture order vs. response arrival order**: numbering is based on **request-receive time** (the moment the proxy first sees the inbound HTTPS request), not response arrival order. A slow streaming response that resolves after a faster non-streaming one still keeps its earlier number. Users see numbers in the order requests were issued, which matches their mental model of the conversation.
- **Long sessions**: at 100+ pairs the number must remain visually compact (zero-pad to a width that fits the largest number, e.g. `001` once a session crosses 100 pairs).
- **Single-pair conversation**: numbering still applies — `Turn 01` / row `01` / section `01`.
- **Same pair across two conversations** (different system prompt or model): does not occur — each pair belongs to exactly one conversation grouping. Numbers are session-global and unaffected by conversation grouping.
- **Filter checkbox toggled mid-read**: numbers do not reflow; pairs simply appear or disappear with their pre-assigned numbers intact.
- **In-flight pair that never completes** (connection abort, upstream timeout, proxy-process exit before response): the pair is persisted to JSONL with the captured request, no response, and a terminal status discriminator (e.g. `status: "aborted"` or `status: "timeout"`). The assigned `Pair NN` row remains visible in Pairs and JSON labeled `Pair NN — <status>`. The index is never reclaimed; subsequent pairs continue from `Pair NN+1`. Transcript does not display the pair (no assembled response to render).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every captured HTTP pair MUST be assigned a stable, session-global, 1-based ordinal index at the moment it is captured. The index MUST NOT change for the lifetime of the session, regardless of UI filter state, tab switches, or arrival of later pairs.
- **FR-002**: The Transcript tab MUST display each visible turn's row with its pair's assigned index, formatted identically to today's `Turn NN` style (zero-padded, minimum width 2).
- **FR-003**: The Pairs tab MUST display each row with its pair's assigned index as the leading row label, formatted as `Pair NN` using the same width and zero-padding as Transcript.
- **FR-004**: The JSON tab MUST display each per-pair Request/Response section with its pair's assigned index in the section header, formatted as `Pair NN` using the same width and zero-padding as Transcript and Pairs.
- **FR-005**: When the Transcript display filter ("Include single-message turns" checkbox) hides a pair, its assigned number MUST NOT be reused or shifted onto a subsequently visible turn — the visible Transcript turn sequence MUST simply skip that number.
- **FR-006**: When the user toggles the Transcript display filter, no visible turn's number MAY change. Hidden turns MUST appear or disappear with their pre-assigned number intact.
- **FR-007**: Pairs and JSON tabs MUST show *every* captured pair's number, including pairs that are filtered out of the Transcript display and pairs that are not `/v1/messages` (and therefore have no Transcript representation at all).
- **FR-008**: A reader MUST be able to pick any visible number in any tab and locate the same pair in the other two tabs in O(1) visual scan — i.e. the number appears at row/section start in a consistent screen position, in the same character style/weight as today's Transcript Turn label.
- **FR-009**: The StatsBlock `turns` count MUST equal the count of currently-visible Transcript turn rows for the active filter setting (i.e. it MUST update when the user toggles the display filter).
- **FR-010**: In live mode, when a new pair arrives via WebSocket, the displayed numbers MUST update without renumbering any existing pair.
- **FR-011**: In live mode, Pairs and JSON tabs MUST render a `Pair NN` row in a "pending" state as soon as the proxy observes the inbound request (before the response completes), and MUST hydrate that same row in place when the pair completes — the row's index MUST NOT change between pending and hydrated states.
- **FR-012**: When an in-flight pair fails to complete (connection abort, upstream timeout, proxy-process exit before response), the system MUST persist a JSONL record containing the captured request and a terminal status discriminator (e.g. `aborted`, `timeout`), MUST keep its assigned index permanently allocated (no reclamation, no reuse), and MUST display the row in Pairs and JSON as `Pair NN — <status>`.

### Key Entities *(include if feature involves data)*

- **Pair index**: a session-global 1-based ordinal assigned at request-receive time and stable for the session's lifetime. Persisted as an explicit field on each JSONL record so loaders read it directly; legacy JSONL (written before this feature) falls back to line-order derivation. The defining attribute of a pair for cross-tab navigation purposes.
- **Visible turn count**: the number of Transcript rows currently rendered for the active filter setting. Equals the count shown in StatsBlock `turns`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given any number visible in one tab, the user can locate that exact pair in either of the other two tabs within 3 seconds (visual scan only — no scrolling beyond what would be required to reach a known row position).
- **SC-002**: 100% of pairs displayed in the Pairs tab and 100% of sections rendered in the JSON tab carry a visible numeric label.
- **SC-003**: Across any captured session, the count displayed in StatsBlock `turns` equals the count of Transcript turn rows visible at that moment, for both filter states (single-message included and excluded).
- **SC-004**: When the Transcript filter is toggled at least once during a single viewing session, no visible turn's displayed number changes; only the set of visible turns changes.
- **SC-005**: When a session is reopened from its self-contained HTML report, the numbers shown for every pair are identical to the numbers shown when the session was viewed live.

## Assumptions

- User-facing prefix words: Transcript uses `Turn NN` (unchanged from today); Pairs and JSON both use `Pair NN`. Different prefix words reinforce the conversation-layer (Transcript) vs HTTP-layer (Pairs/JSON) distinction; the trailing number is the cross-tab anchor and MUST match across all three tabs.
- Zero-padding width is determined by the highest pair index in the session (e.g. width 2 for sessions up to 99 pairs, width 3 from 100–999). A consistent width across all three tabs is required at any given moment.
- Numbers are assigned at **request-receive time** — the moment the proxy first observes the inbound HTTPS request, *before* the pair completes. This is intentionally earlier than the existing `'pair'` event (which fires on response completion), so a slow streaming response that resolves after a faster non-streaming one still keeps its earlier number. Implementation may require the proxy to emit a new event (or otherwise expose an early sequence-number) at request entry.
- The existing `--conversations-only` capture filter continues to determine which pairs land in the JSONL at all. This feature governs only how *captured* pairs are numbered and presented, not which pairs are captured.
- The StatsBlock `turns` field is the canonical "headline turn count" in the UI; no other on-screen counter needs to be reconciled in this scope.
- This spec covers behavior in both rendering modes (static HTML report and live dashboard) — numbering must be identical between the two for the same JSONL.
