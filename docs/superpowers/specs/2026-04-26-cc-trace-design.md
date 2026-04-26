# cc-trace Design Spec
**Date:** 2026-04-26  
**Status:** Approved

## Overview

`cc-trace` is a CLI tool that records all HTTP traffic between Claude Code and the Anthropic API, presenting it in a real-time web UI and a self-contained HTML report. It replaces the `--require` injection approach used by `claude-trace` with a MITM proxy that works with any Claude Code runtime — including compiled Bun binaries.

---

## Decisions

| Question | Decision |
|---|---|
| Frontend viewer | Both: live server during session + self-contained HTML on exit |
| Proxy transport | Option B: HTTPS MITM proxy via `HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS` (no sudo) |
| Platform | macOS only (arm64 + x64) at launch |
| Frontend tech | React |
| Test strategy | Unit (100% coverage) + Integration + E2E |
| Log storage | `.cc-trace/` in CWD by default; `--output-dir` flag for custom location |
| CLI style | Explicit subcommands (`cc-trace attach`, `cc-trace report`) |
| Proxy architecture | Single-process (proxy + live server + claude in one Node process) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  cc-trace attach                                        │
│                                                         │
│  ┌─────────────┐   HTTPS_PROXY    ┌─────────────────┐  │
│  │   Claude    │ ──────────────►  │   MITM Proxy    │  │
│  │  (binary)   │                  │  :random port   │  │
│  └─────────────┘                  └────────┬────────┘  │
│                                            │            │
│                                    ┌───────▼────────┐  │
│                                    │  JSONL Writer  │  │
│                                    │  .cc-trace/    │  │
│                                    └───────┬────────┘  │
│                                            │            │
│                              ┌─────────────▼──────────┐│
│                              │    Live Server :3000   ││
│                              │  WebSocket + React UI  ││
│                              └────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                                            │ on exit
                                    ┌───────▼────────┐
                                    │  HTML Report   │
                                    │ (self-contained)│
                                    └────────────────┘
```

**Startup sequence:**
1. `cc-trace attach` picks a random free port for the MITM proxy
2. On first run, generates CA key + cert stored in `~/.cc-trace/ca.key` + `~/.cc-trace/ca.crt` (Node `crypto`, no `openssl` CLI dependency)
3. Starts MITM proxy server on the chosen port
4. Starts live server on port 3000 (configurable via `--port`)
5. Opens `http://localhost:3000` in the browser
6. Spawns `claude` with env vars local to child process only:
   - `HTTPS_PROXY=http://localhost:<proxy-port>`
   - `NODE_EXTRA_CA_CERTS=~/.cc-trace/ca.crt`
7. Every request/response pair is written to JSONL and pushed via WebSocket to the live UI
8. On claude exit: JSONL is sealed, self-contained HTML is generated, terminal prints paths

---

## Project Structure

```
cc-trace/
├── src/
│   ├── cli/
│   │   ├── index.ts               # Entry point, subcommand router
│   │   ├── commands/
│   │   │   ├── attach.ts          # cc-trace attach
│   │   │   └── report.ts          # cc-trace report <file.jsonl>
│   │   └── options.ts             # Shared CLI option types
│   ├── proxy/
│   │   ├── server.ts              # MITM proxy (HTTP CONNECT handler)
│   │   ├── cert-manager.ts        # CA cert generation + per-domain cert signing
│   │   └── forwarder.ts           # TLS termination + request forwarding to Anthropic
│   ├── logger/
│   │   ├── jsonl-writer.ts        # Atomic append of pairs to .jsonl file
│   │   └── session.ts             # Session lifecycle (start, seal, resolve paths)
│   ├── live-server/
│   │   ├── server.ts              # Express + WebSocket server
│   │   └── broadcaster.ts         # Push new pairs to all WS clients
│   ├── report/
│   │   └── html-generator.ts      # Self-contained HTML from JSONL
│   ├── shared/
│   │   ├── types.ts               # HttpPair, Session, Config types
│   │   └── conversation.ts        # SSE parsing, streaming assembly, tool call extraction
│   └── frontend/
│       ├── index.tsx              # React app entry point
│       ├── App.tsx                # Root component, WebSocket connection
│       ├── components/
│       │   ├── ConversationView.tsx
│       │   ├── RawPairsView.tsx
│       │   └── JsonView.tsx
│       └── hooks/
│           └── useWebSocket.ts    # Real-time pair subscription
├── tests/
│   ├── unit/                      # Pure function tests, 100% coverage required
│   ├── integration/               # Proxy + real HTTPS, no Anthropic API
│   └── e2e/
│       ├── fixtures/
│       │   ├── mock-claude.ts     # Mock claude binary for E2E
│       │   └── mock-api.ts        # Local HTTPS server mimicking Anthropic API
│       └── attach.e2e.ts          # Full session pipeline test
├── .github/
│   └── workflows/
│       ├── ci.yml                 # PR quality gates
│       └── release.yml            # npm publish on version tag
├── docs/
│   └── superpowers/specs/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── biome.json
```

---

## Component Specifications

### `proxy/cert-manager.ts`
- Generates CA key + self-signed cert on first run using Node `crypto` (no CLI deps)
- Stores in `~/.cc-trace/ca.key` + `~/.cc-trace/ca.crt`
- Generates per-domain leaf certs signed by the CA on demand
- Caches leaf certs in a `Map<string, tls.SecureContext>` for session lifetime
- Exposes: `ensureCA(): Promise<CA>`, `getCert(hostname: string): Promise<tls.SecureContext>`

### `proxy/server.ts`
- HTTP server listening for CONNECT requests
- On CONNECT: calls `cert-manager` for domain cert, performs TLS termination
- Pipes decrypted traffic to `forwarder.ts`
- Emits `pair` events on the returned EventEmitter for each completed request/response
- Exposes: `startProxy(port: number): Promise<{ emitter: EventEmitter, close(): void }>`

### `proxy/forwarder.ts`
- Takes decrypted HTTP/1.1 request, forwards to original host over fresh TLS connection
- Handles SSE: buffers full `body_raw` string before emitting pair
- Handles JSON: parses body, emits pair
- Redacts `Authorization` headers: keeps `bearer sk-ant-...XXXX` (first 20 + last 4 chars)
- Exposes: `forward(req, res, hostname): Promise<HttpPair>`

### `logger/jsonl-writer.ts`
- Receives `HttpPair`, serialises to JSON, appends to `.jsonl` file
- Atomic writes: write to `<file>.tmp`, then `fs.rename` — avoids corrupt lines on crash
- Exposes: `createWriter(filePath: string): { write(pair: HttpPair): Promise<void>, close(): void }`

### `logger/session.ts`
- Resolves output directory (`.cc-trace/` default, `--output-dir` override)
- Names session files: `session-YYYY-MM-DD-HH-MM-SS.{jsonl,html}`
- Exposes: `startSession(opts: SessionOpts): Session`

### `live-server/server.ts`
- Express app on configurable port (default 3000)
- `GET /` → serves bundled React app (index.html)
- `GET /api/pairs` → returns all pairs so far as JSON (for page reload recovery)
- `WS /ws` → WebSocket endpoint; new pairs pushed as `{ type: 'pair', data: HttpPair }`
- `GET /api/status` → session metadata (start time, pair count, output paths)
- Exposes: `startLiveServer(port: number, broadcaster: Broadcaster): LiveServer`

### `live-server/broadcaster.ts`
- Maintains set of active WebSocket connections
- On new pair: serialises and sends to all connected clients
- Handles client disconnect gracefully
- Exposes: `createBroadcaster(): Broadcaster`

### `shared/types.ts`

```typescript
interface HttpPair {
  request: {
    timestamp: number        // Unix seconds
    method: string
    url: string
    headers: Record<string, string>
    body: unknown | null     // Parsed JSON or null
  }
  response: {
    timestamp: number
    status_code: number
    headers: Record<string, string>
    body: unknown | null     // Parsed JSON or null
    body_raw: string | null  // Raw SSE string for streaming responses
  } | null
  logged_at: string          // ISO timestamp
  note?: string              // e.g. "ORPHANED_REQUEST"
}

interface Session {
  id: string
  startedAt: Date
  jsonlPath: string
  htmlPath: string
  outputDir: string
}

interface Config {
  outputDir: string          // Default: .cc-trace/ in CWD
  livePort: number           // Default: 3000
  includeAllRequests: boolean
  openBrowser: boolean
  claudePath?: string
  claudeArgs: string[]
}
```

### `shared/conversation.ts`
- `parseHttpPairs(pairs: HttpPair[]): Conversation[]` — groups pairs into conversations by system prompt + model
- `assembleStreaming(bodyRaw: string): AssembledMessage` — reconstructs full message from SSE events
- `extractToolCalls(message: AssembledMessage): ToolCall[]`
- Used identically by backend (HTML generation) and frontend React components (via bundler)

### `report/html-generator.ts`
- Reads JSONL file line-by-line, parses pairs
- Base64-encodes pair array, injects into React app HTML template
- Template markers identical to claude-trace for format compatibility
- Exposes: `generateHTML(jsonlPath: string, outputPath: string): Promise<void>`

### `cli/commands/attach.ts`
Full orchestration:
```
ensureCA()
  → startProxy(freePort)
  → startLiveServer(3000, broadcaster)
  → openBrowser('http://localhost:3000')
  → startSession(opts)
  → createWriter(session.jsonlPath)
  → proxy.emitter.on('pair', pair => { writer.write(pair); broadcaster.send(pair) })
  → spawnClaude(claudePath, claudeArgs, { HTTPS_PROXY, NODE_EXTRA_CA_CERTS })
  → await claudeExit
  → writer.close()
  → generateHTML(session.jsonlPath, session.htmlPath)
  → proxy.close()
  → liveServer.close()
  → console.log paths
```

---

## CLI Reference

```bash
# Start Claude Code with traffic logging
cc-trace attach

# Custom output directory
cc-trace attach --output-dir ~/traces

# Custom live server port
cc-trace attach --port 4000

# Include all requests (not just v1/messages with >2 messages)
cc-trace attach --include-all-requests

# Don't open browser automatically
cc-trace attach --no-open

# Pass args to claude
cc-trace attach --run-with chat --model claude-sonnet-4-6

# Use specific claude binary
cc-trace attach --claude-path /usr/local/bin/claude

# Generate HTML from existing JSONL
cc-trace report session.jsonl
cc-trace report session.jsonl --output report.html
```

---

## JSONL Format

One JSON object per line. Format is backward-compatible with claude-trace:

```json
{
  "request": {
    "timestamp": 1745539200,
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "headers": { "content-type": "application/json" },
    "body": { "model": "claude-sonnet-4-6", "messages": [...] }
  },
  "response": {
    "timestamp": 1745539201,
    "status_code": 200,
    "headers": { "content-type": "application/json" },
    "body": { "id": "msg_...", "content": [...] },
    "body_raw": null
  },
  "logged_at": "2026-04-26T04:00:00.000Z"
}
```

Streaming responses use `body_raw` (raw SSE string) and `body: null`.

---

## Testing Strategy

### Unit tests (`tests/unit/`) — 100% line coverage, CI blocks on any gap
- `cert-manager`: CA generation, leaf cert verification against CA, caching behaviour
- `jsonl-writer`: serialisation, atomic write, handles malformed pair
- `conversation.ts`: SSE assembly, tool call extraction, conversation grouping
  - **Must cover real-world Claude Code request shapes:** array-form `system` with `cache_control`, user messages whose `content` is a content-block array (`tool_result`)
- `html-generator`: template injection, base64 encoding, empty/large JSONL
- `cli/options`: all subcommands and flag combinations parsed correctly
- `session.ts`: path resolution, output-dir override, timestamp naming

### Integration tests (`tests/integration/`)
- Proxy intercepts HTTPS to local test server and logs pair correctly
- Proxy handles SSE streaming without truncation
- Proxy handles 10 concurrent requests without mixing pairs
- Live server WebSocket broadcasts to 3 simultaneous clients
- `cc-trace report` on fixture JSONL produces valid HTML

### E2E tests (`tests/e2e/`)
- `mock-api.ts`: local HTTPS server returning Anthropic-shaped responses
  - JSON for non-streaming requests, SSE event stream for `stream: true` requests
- `mock-claude.ts`: standalone script (used as `--claude-path`) that exercises a realistic Claude Code session through `HTTPS_PROXY`:
  1. Initial 1-message request (filtered by default; captured with `--include-all-requests`)
  2. Tool-use turn with **array-form `tool_result` user content** (real Claude Code shape)
  3. Streaming request (`stream: true`) producing an SSE response
- Full pipeline test asserts:
  - All three turn shapes are captured to JSONL without crash
  - Array-form `system` and array-form user `content` round-trip intact
  - SSE responses are captured into `body_raw` (not `body`)
  - `parseHttpPairs` groups pairs across array-form system prompts without crashing
  - `generateHTML` produces a self-contained file with all template markers replaced
- Live server smoke test: a real `ws` client connects to `startLiveServer`, receives a `history` message on connect, and a `pair` message after a request flows through the proxy

### Coverage config
```json
// vitest.config.ts
coverage: {
  include: ['src/**'],
  exclude: ['src/frontend/**'],  // Frontend tested separately via component tests
  thresholds: { lines: 100, functions: 100, branches: 100 }
}
```

---

## Quality Gates (CI)

```yaml
# .github/workflows/ci.yml
- tsc --noEmit                        # Type check
- biome check src/ tests/             # Lint + format
- vitest run tests/unit --coverage    # Unit tests, 100% coverage
- vitest run tests/integration        # Integration tests
- vitest run tests/e2e                # E2E tests
- npm run build                       # Build succeeds
- ts-prune                            # No unused exports
- npm audit --audit-level=high        # No high/critical CVEs
```

All gates block merge. Release (`release.yml`) runs all CI gates + `npm publish` on `v*.*.*` tag.

---

## CLAUDE.md Rules

```markdown
## Quality Gates
- Every new function in src/ must have a unit test — no exceptions
- Unit test coverage must remain at 100% — run `npm run test:unit` before committing
- Never use `any` in TypeScript — use `unknown` and narrow with type guards
- No `console.log` in src/ — use the structured logger utility
- All public functions must have JSDoc with @param and @returns
- Biome must pass with zero warnings — run `npm run lint` before committing
- All integration and E2E tests must pass locally before pushing
- Commits follow Conventional Commits: feat:, fix:, test:, chore:, docs:
- PRs must be single-concern — one feature or fix per PR
- No `any` casts, no `@ts-ignore`, no `as unknown as X` escape hatches
```
