# Phase 1 Data Model

All entities are in-memory derivations or build-time metadata. No persistence schema changes; no JSONL field additions.

---

## SessionStats

A pure aggregate derived from `HttpPair[]`. Recomputed on render in static mode; recomputed on a 250 ms throttle (with immediate flush on pair completion) in live mode.

**Location**: `src/shared/types.ts` (type) + `src/shared/stats.ts` (derivation function).

```ts
export interface SessionStats {
  /** Number of conversational turns, derived via parseHttpPairs(pairs, { includeAll: true }) */
  turnCount: number;
  /** Total number of captured request/response pairs (all methods, all URLs, including failures) */
  requestCount: number;
  /** Per-method breakdown. POST and GET MUST always be present (zero if absent). Other methods appear when seen. */
  requestsByMethod: Record<string, number>;
  /** Six independent token totals, each summed across all 2xx /v1/messages responses */
  tokens: SessionTokenTotals;
}

export interface SessionTokenTotals {
  /** Sum of usage.cache_read_input_tokens */
  cacheRead: number;
  /** Sum of usage.cache_creation_input_tokens (legacy flat field) */
  cacheCreationInput: number;
  /** Sum of usage.cache_creation.ephemeral_5m_input_tokens */
  cacheCreation5m: number;
  /** Sum of usage.cache_creation.ephemeral_1h_input_tokens */
  cacheCreation1h: number;
  /** Sum of usage.input_tokens */
  input: number;
  /** Sum of usage.output_tokens */
  output: number;
}
```

### Derivation rules

- `turnCount`: `parseHttpPairs(pairs, { includeAll: true }).reduce((acc, conv) => acc + conv.pairs.length, 0)`. Independent of the App-level "Include single-message turns" toggle.
- `requestCount`: `pairs.length`.
- `requestsByMethod`: For each pair, increment `requestsByMethod[pair.request.method]`. Initialize `POST: 0, GET: 0` so the spec's required keys always appear.
- `tokens`: Iterate each pair. Skip if any of: `pair.response === null`, `pair.response.status_code < 200`, `pair.response.status_code >= 300`, or `!pair.request.url.includes("/v1/messages")`. Otherwise sum the six fields. For streaming bodies (`pair.response.body_raw`), parse SSE events line by line, reading `message_start.message.usage.{input_tokens,cache_read_input_tokens,cache_creation_input_tokens,cache_creation.ephemeral_5m_input_tokens,cache_creation.ephemeral_1h_input_tokens}` and `message_delta.usage.output_tokens`. For JSON bodies, read the same fields directly from `pair.response.body.usage`. Missing field → contribute `0`.

### Validation

- All numeric fields MUST be non-negative integers.
- `Object.values(requestsByMethod).reduce((a, b) => a + b, 0) === requestCount`.
- An empty `pairs` array MUST yield `{ turnCount: 0, requestCount: 0, requestsByMethod: { POST: 0, GET: 0 }, tokens: { cacheRead: 0, cacheCreationInput: 0, cacheCreation5m: 0, cacheCreation1h: 0, input: 0, output: 0 } }`.

### State transitions

`SessionStats` is immutable; each derivation produces a new value. There are no in-place mutations.

---

## CcTraceMeta

Build/start-time metadata exposed to the frontend through two delivery paths.

**Location**: `src/shared/types.ts` (type).

```ts
export interface CcTraceMeta {
  /** Value of `version` in package.json at build/serve time */
  version: string;
  /** ISO-8601 UTC timestamp; report-generation time (static) or live-server start time (live) */
  generatedAt: string;
}
```

### Source per mode

| Mode | `version` source | `generatedAt` source | Surface |
|---|---|---|---|
| Static report | `package.json` read by `report/html-generator.ts` at generation time | `new Date().toISOString()` at the moment `generateHTML()` runs | Inlined into `template.html` as `window.ccTraceMeta = { version: "...", generatedAt: "..." }` |
| Live dashboard | `package.json` read by `live-server/server.ts` at module init | `new Date().toISOString()` captured at `startLiveServer()` invocation | Returned by `GET /api/status` as new fields `version` and `startedAtIso`; frontend hydrates `window.ccTraceMeta` from the response on mount |

### Validation

- `version` MUST be the exact `package.json` `version` string (no transformation).
- `generatedAt` MUST match the regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$`.
- Both fields MUST be embedded at generation/start time, not computed at view time (FR-202, FR-204).

---

## JsonViewState (per-tree, transient)

UI-only state, scoped per `<JsonTree>` instance. Not persisted, not exported.

```ts
interface JsonViewState {
  /** Map of node path → expanded boolean. Absent key falls back to default-by-depth (depth < 2 = true). */
  expanded: Record<string, boolean>;
}

type JsonViewAction =
  | { type: "toggle"; path: string }
  | { type: "expandAll" }
  | { type: "collapseAll" };
```

### Reducer rules

- `toggle`: Flip `expanded[path]`. If absent, write the inverse of the depth-default (computed from path segment count).
- `expandAll`: Replace `expanded` with a marker that causes `JsonNode` to treat unspecified paths as `true` (e.g., a sentinel `{ "__all__": true }` checked first by the lookup helper).
- `collapseAll`: Same shape with `{ "__all__": false }`.

### Cross-tree isolation

Two sibling `<JsonTree>` instances each own their own reducer (FR-301). The parent `<JsonView>` does not lift this state; an explicit "expand both" control is out of scope for v1.

### Per-pair isolation (FR-306)

Each pair's `<JsonTree>` is rendered with `key={pairKey}` (e.g., the pair's `logged_at` plus index). Switching pairs unmounts and remounts the tree, naturally clearing `expanded`.

---

## JsonFilterTarget

```ts
type JsonFilterTarget = "both" | "request" | "response";
```

Owned by `<JsonView>` (parent of both `<JsonTree>` instances). The filter string passed to a tree is `target === "both" || target === "<thisSide>" ? filterText : ""`.

---

## CopyPayload (formatter input/output contract)

Pure function in `src/shared/json-path.ts`. No state.

```ts
/** Format a JSON node for clipboard per FR-302 */
export function formatForClipboard(node: unknown): string;
```

Rules (FR-302):

| Input | Output |
|---|---|
| object or array | `JSON.stringify(node, null, 2) + "\n"` |
| string | the raw string value (no surrounding quotes, no escape transformations) |
| number, boolean | `String(value)` |
| `null` | `"null"` |
| `undefined` | not reachable from JSON; if encountered (defensive only at module boundary) → `"null"` |

```ts
/** Format dot/bracket path for breadcrumb / clipboard */
export function formatJsonPath(segments: ReadonlyArray<string | number>): string;
```

Rules:

- Empty segments → `"$"`.
- Numeric segment → `[n]`.
- String segment → `.key` (no quoting; v1 does not handle keys with dots — those render as written, matching current behavior).
- First segment with `"$" + ...` is omitted; output begins with the first non-root segment unless empty.
