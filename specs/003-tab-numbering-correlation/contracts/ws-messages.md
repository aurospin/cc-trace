# Contract: WebSocket Message Protocol

The live dashboard's WebSocket endpoint at `ws://localhost:<livePort>/ws` exchanges three message types. This contract defines them, the order they arrive in, and what reconnecting clients can rely on.

## Message types

```ts
type WSMessage =
  | { type: "history";      data: HttpPair[] }
  | { type: "pair-pending"; data: PendingPair }
  | { type: "pair";         data: HttpPair };
```

`HttpPair` and `PendingPair` are defined in [data-model.md](../data-model.md).

## Connection-time guarantees

When a client opens the WebSocket:

1. The server sends exactly one `{ type: "history", data: [...] }` message immediately.
2. `data` contains every **completed** `HttpPair` known to the broadcaster, in `pairIndex` order.
3. `data` does **not** include in-flight pairs (any pair with `pair-pending` emitted but no terminal yet). Rationale: a reconnecting client cannot disambiguate a pending broadcast it missed from one that has since completed; sending only durable state avoids orphaned pending rows.
4. After the `history` message, the server begins streaming `pair-pending` and `pair` for new arrivals.

## Steady-state ordering

For any given `pairIndex`:
- `pair-pending` arrives before `pair`. Always.
- Exactly one `pair` follows each `pair-pending`. Whether the pair completed normally or was aborted is conveyed inside the `HttpPair` payload (`status` field; `response: null` if not completed).

Across different `pairIndex` values:
- `pair-pending` messages arrive in `pairIndex` order (they are emitted in request-receive order — see [proxy-events.md](./proxy-events.md)).
- `pair` messages MAY interleave across indices (a fast pair `5` can complete before a slow streaming pair `4`).

## Client obligations

A correct client MUST:

1. On `history`: replace local pair state with the received array. Reset any pending tracking.
2. On `pair-pending`: append `data.pairIndex` to a pending set. Render the pair row immediately with prefix label only and a pending placeholder body.
3. On `pair`: remove `data.pairIndex` from the pending set; append/replace the row with the full `HttpPair`. Do not assume the prior `pair-pending` was received — the client may have connected after.
4. On reconnect: discard local pending state (it is not authoritative — see Connection-time guarantee 3).

## Server obligations

The broadcaster MUST:

1. Send `history` exactly once per connection, before any `pair-pending` or `pair`.
2. Buffer no more than one `history` payload per client (allocate at send, release after `ws.send` resolves).
3. Drop messages to closed/closing clients silently — do not throw out of the broadcast loop.
4. Convert proxy `'pair-aborted'` events into a `pair` message with `response: null` and `status: "aborted" | "timeout"` — the wire protocol exposes only three message types, not four.

## Out of contract

- No reconnection-resume tokens. A reconnecting client gets the full `history` of completed pairs and starts fresh on pending tracking.
- No back-pressure / flow control beyond what the WebSocket library provides.
- No bidirectional messages. The client never sends; the server only emits.
- No heartbeat in this contract. Reconnect logic is the client's responsibility (`useWebSocket` already handles it).

## Security

- Messages are JSON-serialized and consumed via `JSON.parse` in the frontend. No `eval`, no `dangerouslySetInnerHTML` based on payload content.
- All `data` content has already passed through proxy-side redaction (Constitution Principle I). The WS layer adds no new sensitive surface.
