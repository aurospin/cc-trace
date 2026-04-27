# Data Model: Cross-Tab Pair-Number Correlation

Three types change shape, one helper is added, one in-memory entity is introduced. Everything else is unchanged.

## 1. `HttpPair` (modified)

Located in `src/shared/types.ts`. The shape grows by two fields; both are additive.

```ts
interface HttpPair {
  request: HttpRequest;
  response: HttpResponse | null;     // null when status !== "completed"
  logged_at: string;                 // ISO timestamp (unchanged)
  note?: string;                     // unchanged
  pairIndex: number;                 // NEW: 1-based, session-global, stable for life of session
  status?: PairStatus;               // NEW: optional; absent ⇒ "completed"
}

type PairStatus = "completed" | "aborted" | "timeout";
```

**Validation rules** (enforced at the writer + loader boundary):
- `pairIndex >= 1` and integer.
- Within a single JSONL file, `pairIndex` MUST be unique. The loader treats a duplicate as a hard error (Constitution Principle V — fail loud).
- If `response` is `null`, `status` MUST be present and not equal to `"completed"`.
- If `status` is absent or `"completed"`, `response` MUST be present.

**Lifecycle**:

```
proxy receives request
  └─→ pairIndex assigned                  state: pending     (in-memory only; not yet in JSONL)
      ├─→ forwarder completes
      │     └─→ status: "completed"        state: completed   → JSONL append + WS 'pair'
      └─→ socket abort / upstream timeout
            └─→ status: "aborted"|"timeout" state: aborted    → JSONL append + WS 'pair'
```

A pair never moves backwards through these states. Once written to JSONL, it is immutable.

## 2. `PendingPair` (new, in-memory only)

Lives in `src/live-server/broadcaster.ts`. Tracks pairs that have been seen at request-receive but have not yet completed. Never persisted; never sent in `history` replays.

```ts
interface PendingPair {
  pairIndex: number;
  request: HttpRequest;
  startedAt: string;  // ISO timestamp; for future timeout tracking
}
```

**Validation**: `pairIndex` is unique across the union of pending + completed pairs in memory.

**Lifecycle**:
- Added on `'pair-pending'` proxy event.
- Removed on `'pair'` (success) or `'pair-aborted'` (failure) proxy event for the same `pairIndex`.
- On proxy-process exit, any remaining `PendingPair` entries are converted to `HttpPair` records with `status: "aborted"` and flushed to JSONL (one shutdown-time append per pending pair).

## 3. WebSocket message union (modified)

Located in `src/shared/types.ts`. Today's protocol has two message types; this feature adds one.

```ts
type WSMessage =
  | { type: "pair-pending"; data: PendingPair }    // NEW
  | { type: "pair"; data: HttpPair }                // unchanged shape; payload now has pairIndex
  | { type: "history"; data: HttpPair[] };          // unchanged shape; entries now have pairIndex
```

**Ordering invariant**: For any `pairIndex`, the broadcaster emits `pair-pending` exactly once, followed by exactly one `pair` (whether the underlying pair completed or was aborted). A client that connects mid-session receives `history` with completed pairs only, then begins receiving `pair-pending`/`pair` for new arrivals.

## 4. Proxy event payloads (modified)

The proxy `EventEmitter` (in `src/proxy/server.ts`) gains one event and updates one payload.

```ts
emitter.emit("pair-pending", { pairIndex, request });               // NEW
emitter.emit("pair", pair);                                         // pair now has pairIndex set
emitter.emit("pair-aborted", { pairIndex, request, status });       // NEW
```

`pair-aborted` is consumed only by the JSONL writer and the broadcaster. The broadcaster translates it into the same WS `pair` message as a successful completion (with `response: null` and `status` set), so the wire protocol stays at three message types.

## 5. JSONL record shape (modified)

The on-disk record is `JSON.stringify(httpPair) + '\n'`. With the new fields, a single line looks like:

```json
{"request":{...},"response":{...},"logged_at":"2026-04-26T12:34:56.789Z","pairIndex":5}
```

For an aborted pair:

```json
{"request":{...},"response":null,"logged_at":"...","pairIndex":7,"status":"aborted"}
```

**Loader rules** (`report/html-generator.ts` embed path + `frontend/conversation/conversation.ts` parse path):
1. Parse each line as JSON.
2. If `pairIndex` field is present, use it directly.
3. If `pairIndex` field is absent (legacy file), assign `pairIndex = lineNumber + 1` (1-based) at load time. Never write the derived value back.
4. After loading, scan for duplicate `pairIndex` values. If any duplicate exists, throw — do not silently dedup.

## 6. `pair-index.ts` helpers (new file)

Located at `src/shared/pair-index.ts`. Pure, Node-free, no React.

```ts
/** Minimum width 2; grows to fit n. */
export function padWidth(highestIndex: number): number;

/** Format `Turn 05` or `Pair 042`. */
export function formatPairLabel(prefix: "Turn" | "Pair", idx: number, width: number): string;
```

**Validation**: `formatPairLabel` asserts `idx >= 1` and `width >= 2`. Throws on violation (caller bug, not user input).

## 7. Frontend state additions

| Component | New state | Source |
|-----------|-----------|--------|
| `RawPairsView` | `pendingIndices: Set<number>` | Derived from WS `pair-pending` minus completed |
| `JsonView` | (same) `pendingIndices` | (same) |
| `ConversationView` | (none — Transcript ignores pending) | — |
| `StatsBlock` | (none — `turnCount` already filter-aware after change) | — |

Pending state is reactive and derives from the broadcast stream; no separate persistence.
