# Research: Cross-Tab Pair-Number Correlation

All five spec clarifications already pinned the load-bearing decisions. This document records the technical decisions that flow from them, with rationale and rejected alternatives.

## Decision 1: Where the index is generated

**Decision**: A monotonic counter lives on the proxy server instance. It increments when the inbound HTTPS request enters `proxy/server.ts` (before `forwardRequest()` is called) and is attached to the request context for the lifetime of that pair.

**Rationale**:
- Spec Clarification Q1 requires assignment at request-receive time (earlier than today's `'pair'` event, which fires on response completion).
- The proxy is the single funnel for all captured requests — placing the counter elsewhere (e.g. in `jsonl-writer.ts` or `broadcaster.ts`) would either delay assignment until completion (violating Q1) or require duplicating the state.
- Counter starts at 1 on each proxy start; persists in memory only. JSONL is the durable record.

**Alternatives considered**:
- *Counter in `jsonl-writer.ts`* — rejected: writes happen on completion, defeats Q1.
- *UUID per pair, sort at render time* — rejected: violates "stable session-global ordinal" and breaks the `Pair NN` UI label requirement.
- *Counter from `forwarder.ts`* — rejected: forwarder is per-call; the counter must outlive a single forward.

## Decision 2: How the proxy surfaces request-entry to consumers

**Decision**: Add a new `'pair-pending'` event on the proxy `EventEmitter`, fired immediately after the index is assigned and before `forwardRequest()` runs. Payload: `{ pairIndex: number; request: HttpRequest }`. Existing `'pair'` event is unchanged in shape (still fires on completion) but its payload now carries the same `pairIndex`.

**Rationale**:
- A new named event is less invasive than changing the existing `'pair'` payload semantics. Consumers that don't care about pending state (e.g. the JSONL writer, in some configurations) can ignore it.
- The two events are paired: every `'pair-pending'` is followed by exactly one of `'pair'` (success or upstream error captured) or `'pair-aborted'` (in-flight failure). See Decision 5.

**Alternatives considered**:
- *Single `'pair'` event with a `phase: 'pending' | 'complete'` field* — rejected: forces every consumer to switch on phase, even those that only care about completion.
- *Promise/async iteration of pair lifecycle* — rejected: heavier API surface than the existing EventEmitter pattern; inconsistent with `proxy/server.ts` style.

## Decision 3: JSONL schema change

**Decision**: Add `pairIndex: number` (required for newly written records) and `status?: "completed" | "aborted" | "timeout"` (optional; absent means `"completed"` for back-compat) to the JSONL record. Schema is **additive**: legacy records without `pairIndex` parse cleanly, and the loader derives the index from line position as a fallback.

**Rationale**:
- Spec Clarification Q2: persist the index, fall back to line-order for legacy files.
- Additive change preserves all existing JSONL files and tests without migration.
- `status` is optional because the vast majority of records are completed; adding `"completed"` to every record bloats the file pointlessly.

**Alternatives considered**:
- *Replace JSONL schema entirely (versioned envelope)* — rejected: breaks every existing capture; spec scope is "numbering", not "format overhaul".
- *Always emit `status`* — rejected: adds bytes per record with no behavior change for the 99% case.

## Decision 4: WebSocket message protocol for live mode

**Decision**: Two message types replace today's single `{ type: "pair", data: HttpPair }`:

```ts
{ type: "pair-pending", data: { pairIndex: number; request: HttpRequest } }
{ type: "pair", data: HttpPair }  // payload now includes pairIndex; row hydrates in place
```

The `history` message at connection time becomes `{ type: "history", data: HttpPair[] }` where each entry has `pairIndex` populated (already-completed pairs only — no mid-flight history replay).

**Rationale**:
- Spec FR-011: Pairs/JSON render pending row immediately, hydrate in place on completion.
- Mirrors the proxy event split (Decision 2). Same data shape on the wire as in-process — no translation layer.
- `history` excludes mid-flight pairs because a reconnecting client has no way to know whether a pending broadcast it missed has since completed; safer to send only durable state and let the next `'pair'` arrive normally.

**Alternatives considered**:
- *Single message with `phase` field* — rejected for the same reason as Decision 2.
- *Include in-flight pairs in `history`* — rejected: race condition between client reconnect and request completion produces orphaned pending rows on the client.

## Decision 5: Failure handling for in-flight pairs

**Decision**: When the proxy detects an in-flight failure (socket abort, upstream timeout, connection close before response headers), emit a third event `'pair-aborted'` carrying `{ pairIndex, request, status: "aborted" | "timeout", logged_at }`. The JSONL writer persists this as a normal record with `response: null` and `status` set. The broadcaster forwards it as `{ type: "pair", data: HttpPair }` — same WS shape as success — so the frontend's pending → hydrate transition uses one code path regardless of outcome.

**Rationale**:
- Spec Clarification Q5: persist with terminal error state; never reclaim the index.
- Reusing the WS `pair` message keeps the frontend simple — it just sees the pending row replaced with the final state, whatever that state is.
- A separate proxy event (vs. piggybacking on `'pair'`) makes the abort path explicit at the emission site and is easier to test.

**Alternatives considered**:
- *No abort handling — just leave the pending row forever* — rejected: violates SC-005 (HTML report parity) because in-memory pending rows aren't in JSONL.
- *Drop the index and reuse it* — rejected by Q5 directly.

## Decision 6: Frontend rendering

**Decision**:
- **`pair-index.ts` helper**: pure `padWidth(highestIndex: number): number` and `formatPairLabel(prefix: "Turn" | "Pair", idx: number, width: number): string`. Single source of truth for label formatting; testable without DOM.
- **Pending state styling**: a new CSS variable `--pair-row-pending-bg` on `:root[data-mode]` (per Principle III). Component uses the variable; literal colors stay banned.
- **Width recomputation**: pad width is derived from `Math.max(...pairs.map(p => p.pairIndex))`. When a new pair pushes the count from 99 → 100 in live mode, all rows re-render with width 3. Acceptable: width changes are rare (once per order-of-magnitude crossing) and the spec assumes consistent width across tabs at any instant.

**Rationale**: Helpers are pure, theming is via vars, width derivation is one-line — no abstraction beyond what the spec requires.

**Alternatives considered**:
- *Lock width to 3 always (`001`, `099`, `100`)* — rejected: ugly for the 99% of sessions with <100 pairs.
- *Per-tab width derivation* — rejected: violates the "consistent across tabs at any moment" assumption.

## Decision 7: StatsBlock turn count

**Decision**: `stats.ts` `turnCount` switches from `parseHttpPairs(pairs, { includeAll: true })` to `parseHttpPairs(pairs, { includeAll: filterChecked })`, where `filterChecked` is the live "Include single-message turns" checkbox state. The hook that drives `StatsBlock` already has access to that state.

**Rationale**: Spec FR-009 + SC-003 — the headline number must equal what's visible in Transcript. This is a one-line argument change plus a prop wire-up.

**Alternatives considered**:
- *Compute turnCount inside ConversationView and pass it to StatsBlock* — rejected: cross-cuts component ownership; `stats.ts` is the single source for headline numbers and should stay so.
