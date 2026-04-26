# Wire Schema Contract — FROZEN by FR-010

The proxy → JSONL writer → HTML report pipeline and the proxy → WebSocket broadcaster pipeline have stable wire shapes. Tests in `tests/integration/` and `tests/e2e/` exercise them. Any structural refactor that changes a field name, adds a required field, removes a field, or reorders a discriminator value breaks these contracts and is rejected.

## JSONL line schema (`HttpPair` — defined in `src/shared/types.ts`)

Each line in `~/.cc-trace/sessions/session-*.jsonl` is one JSON object of the shape:

```jsonc
{
  "request": {
    "timestamp": <number>,        // ms since epoch
    "method": <string>,           // e.g. "POST"
    "url": <string>,              // full URL
    "headers": { ...string keys to string values; Authorization redacted to "bearer sk-ant-...XXXX"... },
    "body": <object|null>         // parsed JSON if Content-Type allowed; else null (raw lives in body_raw on response)
  },
  "response": {
    "timestamp": <number>,
    "status_code": <number>,
    "headers": { ... },
    "body": <object|null>,        // parsed JSON for application/json
    "body_raw": <string|null>     // raw text for SSE (text/event-stream); null otherwise
  },
  "logged_at": <ISO 8601 string>
}
```

**Invariants**:
- Exactly one `body` or `body_raw` is non-null on the response side; both null is permitted only when the upstream returned an empty body.
- `Authorization` header on the request side is always either absent or matches the redacted form `bearer sk-ant-...XXXX` (Principle I).
- `logged_at` is the timestamp the writer flushed the line, not the request or response timestamp.

## WebSocket broadcaster frame schema

Frames pushed to `ws://localhost:<port>/` clients are JSON objects with a `type` discriminator:

| `type` | Payload shape | When sent |
|---|---|---|
| `"pair"` | `{ type: "pair", pair: HttpPair }` (HttpPair as above) | Each captured pair, immediately after JSONL write. |
| `"history"` | `{ type: "history", pairs: HttpPair[] }` | Once per WebSocket connection, on `open`, replays in-memory history. |

No other `type` values are permitted. A future feature adding a frame type goes through its own spec — not this refactor.

## HTTP endpoints (live server, `src/live-server/server.ts`)

| Method | Path | Response shape |
|---|---|---|
| GET | `/api/pairs` | `HttpPair[]` (in-memory history) |
| GET | `/api/status` | `{ id: string, version: string, startedAtIso: string, ... }` (any fields beyond these may be added by US2 if dedup demands; existing fields MUST remain) |
| GET | `/` | Live dashboard HTML |
| WS  | `/`  | Frames per WS schema above |

## What this refactor MAY change

- Where `HttpPair` and the frame types are *defined* in source (US3 may consolidate under `src/shared/types.ts` or a submodule per FR-008).
- The internal type-narrowing mechanism (US4 introduces guards instead of `as` casts).
- The handler functions producing these responses (US1 may split `live-server/server.ts` into route handlers).

## What this refactor MUST NOT change

- Any field name, value type, or discriminator string above.
- The Authorization redaction format (Principle I).
- The HTTP path → handler mapping (e2e + integration suites pin this).
