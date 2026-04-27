# cc-trace

A MITM proxy logger for Claude Code that captures all HTTP traffic between the Claude Code CLI and the Anthropic API. Unlike approaches that patch the Node.js runtime, cc-trace works by routing traffic through a local HTTPS proxy — so it works with compiled binaries (Bun, etc.) too.

## Features

- **The Transcript UI** — three-column editorial layout: turn rail (per-turn token meter, full date + time, fold/unfold), conversation body, right-margin tool call cards (`tool_use #1`, `#2`, …) with linked `tool_result` labels
- **Session stats block** — single-row pill bar at the top of every view: turn count, requests-by-method, and six independent token totals (`cache_read` · `cache_create` · `ephemeral_5m` · `ephemeral_1h` · `input` · `output`) with `en-US` thousands separators. Live mode coalesces in-flight updates via a 250 ms throttle and flushes on settle
- **Version + timestamp** — `<version> · <iso-timestamp>` in the masthead, embedded at generate time for static reports and hydrated from `/api/status` (with WS-reconnect retry) for the live dashboard
- **Live view** — real-time web UI while Claude runs (default `localhost:3000`); pairs stream in over WebSocket
- **HTML report** — self-contained single-file report on session exit; fonts and bundle inlined, opens from `file://`
- **Dual-mode theme** — warm-paper *Bound Transcript* for static reports, graphite + amber *Wire Room* for the live dashboard
- **JSONL archive** — one JSON object per request/response pair
- **JSON tree inspector** — per-pair stacked Request / Response sections with sticky labels, independent expand/collapse per tree, `Both | Request | Response` filter target toggle, hover-revealed copy buttons (subtree → pretty JSON, leaf → raw value), and a click-to-copy breadcrumb
- **Streaming support** — reassembles SSE responses into readable messages with cache-aware token counts (`cache_read` / `cache_creation` / `input` / `output`)
- **Compression aware** — decodes `gzip` / `deflate` / `br` upstream bodies before logging
- **No sudo** — uses `HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS` env vars scoped to the child process
- **Auth redaction** — API keys in request headers are truncated before logging

> macOS only (arm64 + x64). Requires Node.js ≥ 20.

## Installation

Clone and build:

```bash
git clone https://github.com/aurospin/cc-trace
cd cc-trace
npm install
npm run build
```

Then pick one of three ways to make `cc-trace` callable:

**1. `npm link` — development (symlinked, picks up rebuilds):**

```bash
npm link          # registers a global symlink → repo's dist/
cc-trace --help   # available anywhere
# remove later with:
npm unlink -g cc-trace
```

**2. `npm pack` + global install (frozen tarball, mirrors what an `npm publish` consumer gets):**

```bash
npm pack                          # → cc-trace-<version>.tgz
npm install -g ./cc-trace-*.tgz
```

**3. Direct global install from the repo (one-shot):**

```bash
npm install -g .
```

Verify:

```bash
which cc-trace
cc-trace --version
```

Or skip global install entirely and run from the build output:

```bash
node dist/cli/index.js attach
```

On first run, cc-trace generates a local CA certificate at `~/.cc-trace/ca.crt` and signs per-domain leaf certificates in memory. No sudo is required.

## Usage

### `cc-trace attach` — capture a Claude Code session

```bash
cc-trace attach
# or
node dist/cli/index.js attach
```

Spawns Claude Code with the proxy configured, opens a browser tab at `http://localhost:3000`, and writes a JSONL log + HTML report to `.cc-trace/` when done.

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--output-dir <dir>` | `.cc-trace/` | Directory for log and report files |
| `--port <number>` | `3000` | Live server port |
| `--conversations-only` | off | Capture only multi-turn `/v1/messages` requests; default captures everything |
| `--no-open` | — | Don't open the browser automatically |
| `--claude-path <path>` | auto | Path to the `claude` binary |
| `--run-with <args...>` | — | Extra arguments forwarded to Claude |

**Examples:**

```bash
# Basic capture
cc-trace attach

# Pass args to Claude
cc-trace attach --run-with chat --model claude-opus-4-7

# Custom output directory and port
cc-trace attach --output-dir ~/traces --port 4000

# Restrict capture to multi-turn conversation requests only
cc-trace attach --conversations-only
```

### `cc-trace report <jsonlPath>` — convert a log to HTML

```bash
cc-trace report .cc-trace/session-2026-04-26-10-30-00.jsonl
```

Generates a self-contained HTML file from an existing JSONL log.

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--output <path>` | Same name as input, `.html` | Output HTML path |

## The UI

cc-trace ships a single React app served in two modes — the same component tree, themed via a `data-mode` attribute on `<html>`.

| Mode | When | Aesthetic |
|---|---|---|
| **Bound Transcript** (`static`) | Self-contained HTML report opened from `file://` | Warm paper, deep ink, paper-grain overlay; no WebSocket |
| **Wire Room** (`live`) | Express + WebSocket dashboard during `cc-trace attach` | Graphite + phosphor amber, scanline overlay, pulsing heartbeat, fresh-pair sweep |

### Three views

- **Transcript** — the conversation rendered as a printed transcript:
  - Left rail: globally-numbered turn (`Turn 01`, `02`, …), full date + time (`YYYY/MM/DD` over `HH:MM:SS`), and a per-turn token meter (`cache_read` · `cache_creation` · `input` · `output` as a stacked bar). 4xx/5xx turns get a vermillion fore-edge.
  - Center: speaker rules (no chat-bubble cards). Streaming responses are marked `· streamed`.
  - Right margin: tool calls auto-hoisted as numbered cards (`tool_use #1`, `#2`, …). The matching `tool_result` in any later turn is labelled `tool_result #1` so you can scan tool flow at a glance.
  - Fold / unfold: click a conversation header to collapse the entire conversation; click any `Turn NN` label to fold a single turn while keeping its rail visible.
- **Pairs** — compact tabular list of every captured pair (status · method · URL · `MM/DD HH:MM:SS`). Click any row to expand its raw JSON.
- **JSON** — one stacked Request / Response section per pair with sticky labels and per-tree `Expand all` / `Collapse all` controls. Single filter input with a `Both | Request | Response` target toggle, depth-indented hierarchy, type-colored values, live match count. A persistent breadcrumb (e.g. `messages[0].content[1].text`) tracks the last hovered node and copies on click; each row gets a hover-revealed copy button (objects/arrays → pretty JSON, leaves → the raw value).

The "Include single-message turns" toggle in the tab bar controls whether bootstrap/single-turn requests appear in the Transcript view (they're always present in Pairs and JSON).

## Output

Each session produces two files in the output directory:

- **`session-YYYY-MM-DD-HH-MM-SS.jsonl`** — raw log; one `HttpPair` JSON object per line
- **`session-YYYY-MM-DD-HH-MM-SS.html`** — self-contained report; open in any browser

### JSONL format

One JSON object per line — the file is plain text, append-only, and crash-safe (each line is written atomically via tmp + rename). No header, no footer, no array wrapper, so you can `tail -f` it live or stream-process with `jq`:

```bash
# Total pairs captured
wc -l session-*.jsonl

# Just the streaming responses
jq -r 'select(.response.body_raw != null) | .request.url' session-*.jsonl

# All 4xx/5xx errors
jq -c 'select(.response.status_code >= 400)' session-*.jsonl
```

Each line is a single `HttpPair` with three top-level fields: `request`, `response`, `logged_at`. The `request.body` and `response.body` are parsed JSON objects when the upstream content-type is JSON; for streaming SSE responses, `response.body` is `null` and the raw event stream is preserved verbatim in `response.body_raw`. Compressed upstream bodies (`gzip` / `deflate` / `br`) are decoded before logging, so you never see binary blobs. The `Authorization` header value is truncated to `bearer sk-ant-...XXXX` before the line is written, so the JSONL is safe to share for debugging without leaking API keys.

### JSONL schema

```jsonc
{
  "request": {
    "timestamp": 1714123456.789,   // Unix seconds
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "headers": { "anthropic-version": "2023-06-01" },
    "body": { "model": "claude-sonnet-4-6", "messages": [...] }
  },
  "response": {
    "timestamp": 1714123457.123,
    "status_code": 200,
    "headers": {},
    "body": null,                  // null for streaming responses
    "body_raw": "data: {...}\n\n..." // raw SSE for streaming
  },
  "logged_at": "2026-04-26T10:31:00.000Z"
}
```

## How it works

1. **CA generation** — on first run, a self-signed CA is written to `~/.cc-trace/ca.{crt,key}` using `node-forge` (no `openssl` CLI required).
2. **Proxy startup** — a local HTTPS MITM proxy starts on a random port.
3. **Claude spawn** — Claude Code is spawned with `HTTPS_PROXY` pointing at the local proxy and `NODE_EXTRA_CA_CERTS` pointing at the local CA. Both vars are scoped to the child process only.
4. **TLS termination** — when Claude connects via HTTP CONNECT, the proxy performs TLS termination using a per-domain leaf certificate signed by the local CA.
5. **Forwarding** — the decrypted request is forwarded to `api.anthropic.com`. The auth header value is truncated before logging.
6. **Pair capture** — the response (streaming or JSON) is captured and emitted as an `HttpPair` event.
7. **Persistence** — each pair is appended to the JSONL file atomically and broadcast over WebSocket to the live UI.
8. **Report** — on Claude exit, the JSONL is compiled into a self-contained HTML file.

## Development

```bash
npm run build          # compile TypeScript + Vite frontend
npm run test           # unit + integration + E2E (100% coverage enforced)
npm run test:unit      # unit tests with coverage report
npm run test:watch     # watch mode for unit tests
npm run lint           # Biome lint + format check
npm run lint:fix       # auto-fix lint/format issues
npm run typecheck      # type-check without emitting
```

### Project structure

```
src/
├── cli/
│   ├── index.ts              # entry point
│   ├── options.ts            # CLI parsing (Commander)
│   └── commands/
│       ├── attach.ts         # proxy + Claude orchestration
│       └── report.ts         # JSONL → HTML
├── proxy/
│   ├── server.ts             # HTTP CONNECT MITM server
│   ├── cert-manager.ts       # CA + per-domain cert generation
│   └── forwarder.ts          # HTTPS forwarding + capture
├── logger/
│   ├── jsonl-writer.ts       # atomic JSONL append
│   └── session.ts            # session naming + directory setup
├── live-server/
│   ├── server.ts             # Express + WebSocket server
│   └── broadcaster.ts        # WebSocket client management
├── report/
│   ├── html-generator.ts     # self-contained HTML builder
│   ├── template.ts           # token-substitution helper
│   └── template.html         # report template
├── shared/
│   ├── types.ts              # HttpPair, Session, Conversation, etc.
│   ├── version.ts            # PKG_VERSION (read from package.json once)
│   └── guards.ts             # type guards used at every module boundary
└── frontend/                 # React UI (Vite-bundled into one IIFE)
    ├── index.html
    ├── index.tsx             # entry: imports fonts + styles + App
    ├── styles.css            # dual-mode theme via [data-mode] CSS vars
    ├── window.d.ts           # global Window augmentation (ccTraceData / ccTraceMeta)
    ├── App.tsx               # masthead, stats block, version label, tabs, mode switch
    ├── conversation/         # ConversationView, TurnRow, ToolCallList, TokenMeter + conversation.ts (SSE assembly, grouping)
    ├── jsonView/             # JsonView, JsonTree, JsonNode, JsonBreadcrumb, jsonViewReducer + json-path.ts
    ├── stats/                # StatsBlock, useThrottledStats + stats.ts, throttle.ts
    ├── rawPairs/             # RawPairsView (tabular pair list)
    └── versionLabel/         # VersionLabel, useWebSocket, useWsReconnects
```

Pure logic colocated with each frontend feature: `conversation/conversation.ts` (SSE assembly + grouping), `jsonView/json-path.ts` (clipboard + breadcrumb formatting), `stats/stats.ts` (`computeStats` + `formatNumber`), `stats/throttle.ts` (pure scheduler). `src/shared/` is reserved for modules imported by both backend and frontend, OR by ≥2 backend feature folders.

### Theming

All colors live in CSS variables under `:root[data-mode="static"]` and `:root[data-mode="live"]` in `src/frontend/styles.css`. Components reference only variable names (`var(--ink-deep)`, `var(--accent)`, etc.), so a third skin is a CSS-only change. The mode is set once at boot in `App.tsx` based on `window.ccTraceData`:

- `ccTraceData` present → static report → `data-mode="static"` and the WebSocket hook is short-circuited (no-op when `wsUrl === null`).
- `ccTraceData` absent → live dashboard → `data-mode="live"` and the hook connects to `ws://${window.location.host}`.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE) for the full text.
