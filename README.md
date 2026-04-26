# cc-trace

A MITM proxy logger for Claude Code that captures all HTTP traffic between the Claude Code CLI and the Anthropic API. Unlike approaches that patch the Node.js runtime, cc-trace works by routing traffic through a local HTTPS proxy — so it works with compiled binaries (Bun, etc.) too.

## Features

- **The Transcript UI** — three-column editorial layout: turn rail (with per-turn token meter), conversation body, right-margin "Exhibits" for hoisted tool calls
- **Live view** — real-time web UI while Claude runs (default `localhost:3000`); pairs stream in over WebSocket
- **HTML report** — self-contained single-file report on session exit; fonts and bundle inlined, opens from `file://`
- **Dual-mode theme** — warm-paper *Bound Transcript* for static reports, graphite + amber *Wire Room* for the live dashboard
- **JSONL archive** — one JSON object per request/response pair
- **JSON tree inspector** — collapsible, filterable, click-to-copy paths
- **Streaming support** — reassembles SSE responses into readable messages with cache-aware token counts (`cache_read` / `cache_creation` / `input` / `output`)
- **Compression aware** — decodes `gzip` / `deflate` / `br` upstream bodies before logging
- **No sudo** — uses `HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS` env vars scoped to the child process
- **Auth redaction** — API keys in request headers are truncated before logging

> macOS only (arm64 + x64). Requires Node.js ≥ 20.

## Installation

```bash
git clone https://github.com/your-org/cc-trace
cd cc-trace
npm install
npm run build
```

Run directly without polluting your `PATH`:

```bash
node dist/cli/index.js attach
```

…or `npm link` if you prefer a global `cc-trace` command.

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
| `--include-all-requests` | off | Log all API requests, not just multi-turn conversations |
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

# Log every request (not just conversations)
cc-trace attach --include-all-requests
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

### `cc-trace index` — list captured sessions

```bash
cc-trace index
```

Lists `.jsonl` session files found in the output directory.

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--output-dir <dir>` | `.cc-trace/` | Directory to scan |

## The UI

cc-trace ships a single React app served in two modes — the same component tree, themed via a `data-mode` attribute on `<html>`.

| Mode | When | Aesthetic |
|---|---|---|
| **Bound Transcript** (`static`) | Self-contained HTML report opened from `file://` | Warm paper, deep ink, paper-grain overlay; no WebSocket |
| **Wire Room** (`live`) | Express + WebSocket dashboard during `cc-trace attach` | Graphite + phosphor amber, scanline overlay, pulsing heartbeat, fresh-pair sweep |

### Three views

- **Transcript** — the conversation rendered as a printed transcript:
  - Left rail: turn number, timestamp, per-turn token meter (cache_read · cache_creation · input · output as a stacked bar). 4xx/5xx turns get a vermillion fore-edge.
  - Center: speaker rules (no chat-bubble cards). Streaming responses are marked `· streamed`.
  - Right margin: tool calls auto-hoisted as numbered Exhibits ("Exhibit A", "B", …). The matching `tool_result` in a later turn is linked back as `re: Exhibit A` so you can scan tool flow at a glance.
- **Pairs** — compact tabular list of every captured pair (status · method · URL · time). Click to expand the raw JSON.
- **JSON** — collapsible tree of the entire capture: type-colored values, live filter with match count, hover-reveals the JS path (e.g. `pairs[7].response.body.usage.cache_read_input_tokens`), click to copy.

The "Include single-message turns" toggle in the tab bar controls whether bootstrap/single-turn requests appear in the Transcript view (they're always present in Pairs and JSON).

## Output

Each session produces two files in the output directory:

- **`session-YYYY-MM-DD-HH-MM-SS.jsonl`** — raw log; one `HttpPair` JSON object per line
- **`session-YYYY-MM-DD-HH-MM-SS.html`** — self-contained report; open in any browser

The JSONL format is compatible with [claude-trace](https://github.com/anthropics/claude-code/tree/main/packages/claude-trace).

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
│       ├── report.ts         # JSONL → HTML
│       └── index-cmd.ts      # session listing
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
│   └── template.html         # report template
├── shared/
│   ├── types.ts              # HttpPair, Session, Conversation, etc.
│   └── conversation.ts       # SSE assembly, conversation grouping
└── frontend/                 # React UI (Vite-bundled into one IIFE)
    ├── index.html
    ├── index.tsx             # entry: imports fonts + styles + App
    ├── styles.css            # dual-mode theme via [data-mode] CSS vars
    ├── App.tsx               # masthead, tabs, error boundary, mode switch
    ├── components/
    │   ├── ConversationView.tsx  # three-column transcript + Exhibits
    │   ├── TokenMeter.tsx        # stacked cache/input/output bar
    │   ├── RawPairsView.tsx      # tabular pair list
    │   └── JsonView.tsx          # collapsible/filterable JSON tree
    └── hooks/
        └── useWebSocket.ts       # null-safe live stream hook
```

### Theming

All colors live in CSS variables under `:root[data-mode="static"]` and `:root[data-mode="live"]` in `src/frontend/styles.css`. Components reference only variable names (`var(--ink-deep)`, `var(--accent)`, etc.), so a third skin is a CSS-only change. The mode is set once at boot in `App.tsx` based on `window.ccTraceData`:

- `ccTraceData` present → static report → `data-mode="static"` and the WebSocket hook is short-circuited (no-op when `wsUrl === null`).
- `ccTraceData` absent → live dashboard → `data-mode="live"` and the hook connects to `ws://${window.location.host}`.

## License

MIT
