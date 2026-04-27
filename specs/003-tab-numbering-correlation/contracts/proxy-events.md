# Contract: Proxy Event Lifecycle

The proxy `EventEmitter` exposed by `src/proxy/server.ts` emits three events per pair. This contract defines their order, payload shapes, and atomicity guarantees.

## Events

```ts
emitter.emit("pair-pending", { pairIndex: number; request: HttpRequest });
emitter.emit("pair", pair: HttpPair);          // pair.pairIndex matches the prior pair-pending
emitter.emit("pair-aborted", { pairIndex: number; request: HttpRequest; status: "aborted" | "timeout" });
```

## Per-pair lifecycle (state machine)

```
        ┌───────────────┐
        │ request enters │
        │ proxy/server.ts│
        └──────┬────────┘
               │ assign pairIndex (monotonic ++)
               ▼
        ┌───────────────┐
        │ 'pair-pending' │  ← fires synchronously, before forwardRequest()
        └──────┬────────┘
               │
   forwarder result?
       ┌───────┴────────┐
       ▼                ▼
┌───────────┐   ┌───────────────┐
│ completes │   │ socket aborts │
│ (any 2xx- │   │ / upstream    │
│  5xx)     │   │ timeout       │
└────┬──────┘   └────────┬──────┘
     │                   │
     ▼                   ▼
┌──────────┐    ┌──────────────────┐
│ 'pair'   │    │ 'pair-aborted'   │
└──────────┘    └──────────────────┘
```

## Invariants

1. **Exactly-once `pair-pending`** — every captured request emits `pair-pending` exactly once, in the order it was received by the proxy. The counter that produces `pairIndex` is per-proxy-instance and starts at 1.
2. **Exactly-one terminal** — every `pair-pending` is followed by exactly one of `pair` or `pair-aborted` for the same `pairIndex`. Never both. Never neither (proxy shutdown handler ensures this — see Decision 3 below).
3. **Order across pairs** — `pair-pending` events fire in request-receive order. `pair` and `pair-aborted` events MAY interleave across `pairIndex` values (a fast non-streaming pair `pair-pending: 6` can complete before a slow streaming `pair-pending: 5` finishes — the index is what carries the order, not the terminal event timing).
4. **No mutation after terminal** — once `pair` or `pair-aborted` fires for a `pairIndex`, no further events for that index will ever fire.

## Shutdown semantics

When the proxy process receives `SIGINT`, `SIGTERM`, or its parent `attach.ts` orchestrator triggers shutdown:

1. Stop accepting new connections.
2. For every `pairIndex` currently in the pending set (started but no terminal event yet):
   - Emit `'pair-aborted'` with `status: "aborted"`.
3. Allow downstream consumers (`jsonl-writer`, `broadcaster`) to flush.
4. Exit.

This guarantees Invariant 2 even when the user kills the process mid-stream.

## Consumer obligations

| Consumer | MUST listen to | Behavior |
|----------|----------------|----------|
| `jsonl-writer.ts` | `pair`, `pair-aborted` | Append one record per terminal event. NEVER append on `pair-pending`. |
| `live-server/broadcaster.ts` | `pair-pending`, `pair`, `pair-aborted` | Broadcast all three; map `pair-aborted` onto the WS `pair` message with `response: null`, `status` set. |
| `attach.ts` lifecycle log | `pair`, `pair-aborted` | Log status line per terminal pair. May log `pair-pending` at debug verbosity only. |

## Out of contract

- The proxy does NOT emit progress events for streaming responses mid-flight.
- The proxy does NOT retry. A 500 from upstream is a `pair` event with `status: "completed"` and `response.status_code === 500`.
- The proxy does NOT distinguish "client disconnected before sending body" from other aborts in this contract version — both surface as `status: "aborted"`.
