# cc-trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Note (v0.3.4):** All references below to `--include-all-requests` and the `includeAllRequests` field describe the original design. In v0.3.4 the flag was renamed to `--conversations-only` with the default inverted (capture-all is now the default; the flag opts *into* the multi-turn `/v1/messages` filter), and the field was renamed `includeAllRequests` → `conversationsOnly`. Inlined code blocks here are historical and not line-edited.

**Goal:** Build cc-trace — a MITM proxy CLI that logs Claude Code API traffic to JSONL, streams it to a live React UI, and generates a self-contained HTML report on exit.

**Architecture:** Single Node.js process runs an HTTPS MITM proxy on a random port, spawns `claude` with `HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS` env vars scoped to that child process only, pipes captured pairs to a live WebSocket server and JSONL file, then generates a self-contained HTML report on exit.

**Tech Stack:** TypeScript 5, Node.js built-ins (http/https/net/tls/crypto), node-forge (cert generation), Express 4 + ws (live server), React 18 + Vite (frontend), Vitest + @vitest/coverage-v8 (tests), Biome (lint/format), Commander (CLI)

---

## File Map

```
src/
  shared/
    types.ts          — HttpPair, Session, Config, Conversation, AssembledMessage, ToolCall
    conversation.ts   — parseHttpPairs, assembleStreaming, extractToolCalls
  proxy/
    cert-manager.ts   — ensureCA, getDomainCert (node-forge, cached)
    forwarder.ts      — forwardRequest: decrypted HTTP → upstream HTTPS → HttpPair
    server.ts         — startProxy: HTTP CONNECT handler, TLS termination, emits 'pair'
  logger/
    jsonl-writer.ts   — createWriter: appendFileSync per pair
    session.ts        — startSession: resolves output dir + file paths
  live-server/
    broadcaster.ts    — createBroadcaster: WebSocket client set, send to all
    server.ts         — startLiveServer: Express + ws, serves React app + REST + WS
  report/
    html-generator.ts — generateHTML: reads JSONL, base64-encodes, injects into template
    index-generator.ts — generateIndex: AI summaries via claude CLI, master index.html
  cli/
    options.ts        — parseArgs: Commander-based subcommand parser
    commands/
      attach.ts       — runAttach: full orchestration
      report.ts       — runReport: HTML from JSONL
      index-cmd.ts    — runIndex: session indexing
    index.ts          — CLI entry point
  frontend/
    index.tsx         — React entry, mounts App
    App.tsx           — root component, WebSocket connection, state
    components/
      ConversationView.tsx
      RawPairsView.tsx
      JsonView.tsx
    hooks/
      useWebSocket.ts
tests/
  unit/
    cert-manager.test.ts
    jsonl-writer.test.ts
    session.test.ts
    forwarder.test.ts
    broadcaster.test.ts
    html-generator.test.ts
    conversation.test.ts
    options.test.ts
  integration/
    proxy.test.ts
    live-server.test.ts
  e2e/
    fixtures/
      mock-claude.ts
      mock-api.ts
    attach.e2e.ts
```

---

## Task 1: Project Scaffold

**Files:** `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `.gitignore`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "cc-trace",
  "version": "0.1.0",
  "description": "MITM proxy logger for Claude Code API traffic",
  "type": "module",
  "bin": { "cc-trace": "dist/cli/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json && npm run build:frontend",
    "build:frontend": "vite build src/frontend --outDir ../../dist/frontend",
    "dev": "tsc --watch",
    "lint": "biome check src/ tests/",
    "lint:fix": "biome check --write src/ tests/",
    "typecheck": "tsc --noEmit",
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "vitest run tests/unit --coverage",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "vitest run tests/e2e",
    "test:watch": "vitest tests/unit"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "express": "^4.19.0",
    "node-forge": "^1.3.1",
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "@types/node-forge": "^1.3.11",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/ws": "^8.5.10",
    "@vitejs/plugin-react": "^4.3.0",
    "@vitest/coverage-v8": "^1.6.0",
    "biome": "^1.8.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "ts-prune": "^0.10.3",
    "typescript": "^5.4.0",
    "vite": "^5.3.0",
    "vitest": "^1.6.0"
  },
  "engines": { "node": ">=20.0.0" },
  "os": ["darwin"]
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitAny": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/frontend/**/*", "tests/**/*", "dist/**/*"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/frontend/**'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
```

- [ ] **Step 4: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.8.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": { "noVar": "error", "useConst": "error" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.cc-trace/
~/.cc-trace/
coverage/
*.tsbuildinfo
```

- [ ] **Step 6: Create CLAUDE.md**

```markdown
# cc-trace

## Quality Gates
- Every new function in src/ must have a unit test — no exceptions
- Unit test coverage must remain at 100% — run `npm run test:unit` before committing
- Never use `any` in TypeScript — use `unknown` and narrow with type guards
- No `console.log` in src/ — use process.stdout.write or structured output only in CLI entry
- All public functions must have JSDoc with @param and @returns
- Biome must pass with zero warnings — run `npm run lint` before committing
- All tests must pass locally before pushing — run `npm test`
- Commits follow Conventional Commits: feat:, fix:, test:, chore:, docs:
- PRs must be single-concern — one feature or fix per PR
- No `@ts-ignore`, no `as unknown as X` escape hatches

## Commands
- `npm run test:unit` — unit tests with 100% coverage enforcement
- `npm run test:integration` — integration tests (no Anthropic API needed)
- `npm run test:e2e` — full pipeline with mock claude + mock API
- `npm run lint` — Biome lint + format check
- `npm run typecheck` — TypeScript type check
- `npm run build` — compile TypeScript + bundle frontend

## Architecture
See docs/superpowers/specs/2026-04-26-cc-trace-design.md
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

- [ ] **Step 8: Commit scaffold**

```bash
git add .
git commit -m "chore: project scaffold — tsconfig, biome, vitest, package.json, CLAUDE.md"
```

---

## Task 2: Shared Types

**Files:** `src/shared/types.ts`

- [ ] **Step 1: Create src/shared/types.ts**

```typescript
/** Raw HTTP request captured by the proxy */
export interface HttpRequest {
  /** Unix timestamp in seconds */
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Parsed JSON body, or null for non-JSON / empty */
  body: unknown;
}

/** Raw HTTP response captured by the proxy */
export interface HttpResponse {
  /** Unix timestamp in seconds */
  timestamp: number;
  status_code: number;
  headers: Record<string, string>;
  /** Parsed JSON body, null for streaming responses */
  body: unknown;
  /** Raw SSE string for streaming responses, null otherwise */
  body_raw: string | null;
}

/** One captured request/response pair — one line in JSONL */
export interface HttpPair {
  request: HttpRequest;
  /** null if the process exited before the response completed */
  response: HttpResponse | null;
  /** ISO timestamp when the pair was logged */
  logged_at: string;
  /** Set when response is null */
  note?: string;
}

/** An active or completed capture session */
export interface Session {
  id: string;
  startedAt: Date;
  jsonlPath: string;
  htmlPath: string;
  outputDir: string;
}

/** CLI configuration resolved from arguments */
export interface Config {
  /** Default: .cc-trace/ in CWD */
  outputDir: string;
  /** Default: 3000 */
  livePort: number;
  includeAllRequests: boolean;
  openBrowser: boolean;
  claudePath?: string;
  claudeArgs: string[];
  outputName?: string;
}

/** A structured conversation assembled from one or more HttpPairs */
export interface Conversation {
  id: string;
  model: string;
  pairs: HttpPair[];
  startedAt: Date;
}

/** A fully assembled message from streaming SSE events */
export interface AssembledMessage {
  id: string;
  role: string;
  model: string;
  content: ContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export type ContentBlock = TextBlock | ToolUseBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

/** A tool invocation extracted from a conversation */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Certificate Manager

**Files:** `src/proxy/cert-manager.ts`, `tests/unit/cert-manager.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/cert-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import forge from 'node-forge';

// We override the home dir for tests
const TEST_DIR = path.join(os.tmpdir(), `cc-trace-test-${Date.now()}`);

// Must set before importing cert-manager
process.env['CC_TRACE_DIR'] = TEST_DIR;

import { ensureCA, getDomainCert } from '../../src/proxy/cert-manager.js';

describe('cert-manager', () => {
  beforeEach(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

  describe('ensureCA', () => {
    it('generates CA cert and key files on first call', () => {
      const ca = ensureCA();
      expect(fs.existsSync(ca.certPath)).toBe(true);
      expect(fs.existsSync(ca.keyPath)).toBe(true);
    });

    it('returns valid PEM-encoded CA cert', () => {
      const ca = ensureCA();
      const parsed = forge.pki.certificateFromPem(ca.cert);
      expect(parsed.subject.getField('CN')?.value).toBe('cc-trace CA');
    });

    it('returns existing cert on second call without regenerating', () => {
      const ca1 = ensureCA();
      const ca2 = ensureCA();
      expect(ca1.cert).toBe(ca2.cert);
    });

    it('CA cert has basicConstraints cA=true', () => {
      const ca = ensureCA();
      const parsed = forge.pki.certificateFromPem(ca.cert);
      const bc = parsed.getExtension('basicConstraints') as { cA: boolean } | null;
      expect(bc?.cA).toBe(true);
    });
  });

  describe('getDomainCert', () => {
    it('returns cert with correct hostname in SAN', () => {
      const ca = ensureCA();
      const { cert } = getDomainCert('api.anthropic.com', ca);
      const parsed = forge.pki.certificateFromPem(cert);
      const san = parsed.getExtension('subjectAltName') as { altNames: Array<{ type: number; value: string }> } | null;
      const hasDomain = san?.altNames.some(n => n.value === 'api.anthropic.com');
      expect(hasDomain).toBe(true);
    });

    it('domain cert is signed by CA', () => {
      const ca = ensureCA();
      const { cert } = getDomainCert('api.anthropic.com', ca);
      const caCert = forge.pki.certificateFromPem(ca.cert);
      const domainCert = forge.pki.certificateFromPem(cert);
      expect(() => caCert.verify(domainCert)).not.toThrow();
    });

    it('caches domain certs — same object returned on second call', () => {
      const ca = ensureCA();
      const cert1 = getDomainCert('example.com', ca);
      const cert2 = getDomainCert('example.com', ca);
      expect(cert1.cert).toBe(cert2.cert);
    });

    it('different hostnames get different certs', () => {
      const ca = ensureCA();
      const cert1 = getDomainCert('foo.com', ca);
      const cert2 = getDomainCert('bar.com', ca);
      expect(cert1.cert).not.toBe(cert2.cert);
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:unit -- tests/unit/cert-manager.test.ts
```
Expected: `Error: Cannot find module '../../src/proxy/cert-manager.js'`

- [ ] **Step 3: Implement cert-manager**

Create `src/proxy/cert-manager.ts`:

```typescript
import forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** CA key + certificate (PEM strings + file paths) */
export interface CA {
  cert: string;
  key: string;
  certPath: string;
  keyPath: string;
}

/** Domain-specific leaf certificate (PEM strings) */
export interface DomainCert {
  cert: string;
  key: string;
}

const CC_TRACE_DIR = process.env['CC_TRACE_DIR'] ?? path.join(os.homedir(), '.cc-trace');

/**
 * Ensures a CA certificate exists in ~/.cc-trace/ (or CC_TRACE_DIR in tests).
 * Generates one if not present. Returns the CA on every call.
 * @returns CA cert + key as PEM strings plus file paths
 */
export function ensureCA(): CA {
  const certPath = path.join(CC_TRACE_DIR, 'ca.crt');
  const keyPath = path.join(CC_TRACE_DIR, 'ca.key');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath, 'utf-8'),
      key: fs.readFileSync(keyPath, 'utf-8'),
      certPath,
      keyPath,
    };
  }

  fs.mkdirSync(CC_TRACE_DIR, { recursive: true });

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: 'commonName', value: 'cc-trace CA' },
    { name: 'organizationName', value: 'cc-trace' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  fs.writeFileSync(certPath, certPem, 'utf-8');
  fs.writeFileSync(keyPath, keyPem, { encoding: 'utf-8', mode: 0o600 });

  return { cert: certPem, key: keyPem, certPath, keyPath };
}

const certCache = new Map<string, DomainCert>();

/**
 * Returns a TLS certificate for the given hostname, signed by the CA.
 * Caches results in memory for the process lifetime.
 * @param hostname — the target hostname (e.g. "api.anthropic.com")
 * @param ca — the CA returned by ensureCA()
 * @returns DomainCert with PEM cert and key
 */
export function getDomainCert(hostname: string, ca: CA): DomainCert {
  const cached = certCache.get(hostname);
  if (cached) return cached;

  const caKey = forge.pki.privateKeyFromPem(ca.key);
  const caCert = forge.pki.certificateFromPem(ca.cert);

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  cert.setSubject([{ name: 'commonName', value: hostname }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
  ]);
  cert.sign(caKey, forge.md.sha256.create());

  const domainCert: DomainCert = {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  };

  certCache.set(hostname, domainCert);
  return domainCert;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm run test:unit -- tests/unit/cert-manager.test.ts
```
Expected: all 8 tests pass. Note: RSA generation is slow (~3s per test). This is normal.

- [ ] **Step 5: Commit**

```bash
git add src/proxy/cert-manager.ts tests/unit/cert-manager.test.ts
git commit -m "feat: certificate manager with CA generation and domain cert caching"
```

---

## Task 4: JSONL Writer + Session Manager

**Files:** `src/logger/jsonl-writer.ts`, `src/logger/session.ts`, `tests/unit/jsonl-writer.test.ts`, `tests/unit/session.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/jsonl-writer.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createWriter } from '../../src/logger/jsonl-writer.js';
import type { HttpPair } from '../../src/shared/types.js';

const TMP = path.join(os.tmpdir(), `cc-trace-writer-${Date.now()}`);

const makePair = (url: string): HttpPair => ({
  request: { timestamp: 1000, method: 'POST', url, headers: {}, body: null },
  response: { timestamp: 1001, status_code: 200, headers: {}, body: { ok: true }, body_raw: null },
  logged_at: new Date().toISOString(),
});

describe('jsonl-writer', () => {
  beforeEach(() => fs.mkdirSync(TMP, { recursive: true }));
  afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('creates the file and writes one valid JSON line', () => {
    const filePath = path.join(TMP, 'test.jsonl');
    const writer = createWriter(filePath);
    const pair = makePair('https://api.anthropic.com/v1/messages');
    writer.write(pair);
    writer.close();

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ request: { url: 'https://api.anthropic.com/v1/messages' } });
  });

  it('appends multiple pairs as separate lines', () => {
    const filePath = path.join(TMP, 'multi.jsonl');
    const writer = createWriter(filePath);
    writer.write(makePair('https://a.com'));
    writer.write(makePair('https://b.com'));
    writer.close();

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).request.url).toBe('https://a.com');
    expect(JSON.parse(lines[1]!).request.url).toBe('https://b.com');
  });

  it('each line is terminated with a newline', () => {
    const filePath = path.join(TMP, 'newline.jsonl');
    const writer = createWriter(filePath);
    writer.write(makePair('https://x.com'));
    writer.close();

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
  });
});
```

Create `tests/unit/session.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startSession } from '../../src/logger/session.js';

const TMP = path.join(os.tmpdir(), `cc-trace-session-${Date.now()}`);

describe('session', () => {
  afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('creates outputDir if it does not exist', () => {
    const dir = path.join(TMP, 'newdir');
    startSession({ outputDir: dir });
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('returns jsonlPath and htmlPath inside outputDir', () => {
    const session = startSession({ outputDir: TMP });
    expect(session.jsonlPath.startsWith(TMP)).toBe(true);
    expect(session.htmlPath.startsWith(TMP)).toBe(true);
    expect(session.jsonlPath.endsWith('.jsonl')).toBe(true);
    expect(session.htmlPath.endsWith('.html')).toBe(true);
  });

  it('uses custom name when provided', () => {
    const session = startSession({ outputDir: TMP, name: 'my-session' });
    expect(path.basename(session.jsonlPath)).toBe('my-session.jsonl');
    expect(path.basename(session.htmlPath)).toBe('my-session.html');
  });

  it('default name contains session- prefix', () => {
    const session = startSession({ outputDir: TMP });
    expect(path.basename(session.jsonlPath)).toMatch(/^session-/);
  });

  it('startedAt is a Date', () => {
    const session = startSession({ outputDir: TMP });
    expect(session.startedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm run test:unit -- tests/unit/jsonl-writer.test.ts tests/unit/session.test.ts
```

- [ ] **Step 3: Implement jsonl-writer**

Create `src/logger/jsonl-writer.ts`:

```typescript
import * as fs from 'fs';
import type { HttpPair } from '../shared/types.js';

export interface JsonlWriter {
  /** Append one pair as a JSON line */
  write(pair: HttpPair): void;
  /** Flush and close (no-op for sync writer, here for interface compatibility) */
  close(): void;
}

/**
 * Creates a writer that appends HttpPair records as JSON lines to the given file.
 * @param filePath — absolute path to the .jsonl file
 * @returns JsonlWriter
 */
export function createWriter(filePath: string): JsonlWriter {
  return {
    write(pair: HttpPair): void {
      fs.appendFileSync(filePath, JSON.stringify(pair) + '\n', 'utf-8');
    },
    close(): void {
      // synchronous writes need no explicit flush
    },
  };
}
```

Create `src/logger/session.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import type { Session } from '../shared/types.js';

export interface SessionOpts {
  /** Defaults to .cc-trace/ in process.cwd() */
  outputDir?: string;
  /** Defaults to session-YYYY-MM-DD-HH-MM-SS */
  name?: string;
}

/**
 * Starts a new capture session by resolving output paths and creating the output directory.
 * @param opts — optional outputDir and session name
 * @returns Session with resolved paths
 */
export function startSession(opts: SessionOpts = {}): Session {
  const outputDir = opts.outputDir ?? path.join(process.cwd(), '.cc-trace');
  fs.mkdirSync(outputDir, { recursive: true });

  const now = new Date();
  const ts = now.toISOString().replace('T', '-').replace(/:/g, '-').slice(0, 19);
  const baseName = opts.name ?? `session-${ts}`;

  return {
    id: baseName,
    startedAt: now,
    jsonlPath: path.join(outputDir, `${baseName}.jsonl`),
    htmlPath: path.join(outputDir, `${baseName}.html`),
    outputDir,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:unit -- tests/unit/jsonl-writer.test.ts tests/unit/session.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/logger/ tests/unit/jsonl-writer.test.ts tests/unit/session.test.ts
git commit -m "feat: JSONL writer and session manager"
```

---

## Task 5: Proxy Forwarder

**Files:** `src/proxy/forwarder.ts`, `tests/unit/forwarder.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/forwarder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { redactHeaders } from '../../src/proxy/forwarder.js';

describe('forwarder — redactHeaders', () => {
  it('leaves non-sensitive headers unchanged', () => {
    const result = redactHeaders({ 'content-type': 'application/json' });
    expect(result['content-type']).toBe('application/json');
  });

  it('redacts Authorization header', () => {
    const result = redactHeaders({ authorization: 'Bearer sk-ant-api03-verylongsecretkey1234' });
    expect(result['authorization']).not.toContain('verylongsecretkey');
    expect(result['authorization']?.endsWith('1234')).toBe(true);
  });

  it('redacts x-api-key header', () => {
    const result = redactHeaders({ 'x-api-key': 'sk-ant-api03-anotherlongkey5678' });
    expect(result['x-api-key']).not.toContain('anotherlongkey');
    expect(result['x-api-key']?.endsWith('5678')).toBe(true);
  });

  it('handles short sensitive header values gracefully', () => {
    const result = redactHeaders({ authorization: 'abc' });
    expect(typeof result['authorization']).toBe('string');
  });

  it('preserves all header keys', () => {
    const headers = { 'content-type': 'application/json', authorization: 'Bearer tok' };
    const result = redactHeaders(headers);
    expect(Object.keys(result)).toEqual(['content-type', 'authorization']);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:unit -- tests/unit/forwarder.test.ts
```

- [ ] **Step 3: Implement forwarder**

Create `src/proxy/forwarder.ts`:

```typescript
import * as https from 'https';
import * as http from 'http';
import type { HttpPair } from '../shared/types.js';

const SENSITIVE = new Set(['authorization', 'x-api-key', 'cookie', 'set-cookie']);

/**
 * Redacts sensitive header values while preserving the first 20 and last 4 characters.
 * @param headers — raw header map
 * @returns redacted header map
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => {
      if (!SENSITIVE.has(k.toLowerCase())) return [k, v];
      if (v.length <= 8) return [k, '***'];
      return [k, `${v.slice(0, 20)}...${v.slice(-4)}`];
    }),
  );
}

function headersToRecord(raw: http.IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v as string)]),
  );
}

/**
 * Forwards a decrypted HTTP request to the upstream HTTPS host and returns the captured pair.
 * @param req — incoming HTTP request from the proxy TLS socket
 * @param res — outgoing HTTP response to send back to Claude
 * @param hostname — upstream hostname (e.g. "api.anthropic.com")
 * @param port — upstream port (default 443)
 * @returns Promise<HttpPair>
 */
export async function forwardRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  hostname: string,
  port: number,
): Promise<HttpPair> {
  return new Promise((resolve, reject) => {
    const requestTimestamp = Date.now() / 1000;

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('error', reject);

    req.on('end', () => {
      const bodyBuf = Buffer.concat(chunks);
      let requestBody: unknown = null;
      try {
        requestBody = JSON.parse(bodyBuf.toString('utf-8'));
      } catch {
        // non-JSON body stays null
      }

      const forwardOptions: https.RequestOptions = {
        hostname,
        port,
        path: req.url ?? '/',
        method: req.method ?? 'GET',
        headers: { ...req.headers, host: hostname },
        rejectUnauthorized: true,
      };

      const upstreamReq = https.request(forwardOptions, upstreamRes => {
        const responseTimestamp = Date.now() / 1000;
        const isSSE = (upstreamRes.headers['content-type'] ?? '').includes('text/event-stream');

        const responseHeaders = headersToRecord(upstreamRes.headers);
        res.writeHead(upstreamRes.statusCode ?? 200, responseHeaders);

        const responseChunks: Buffer[] = [];
        upstreamRes.on('data', (chunk: Buffer) => {
          res.write(chunk);
          responseChunks.push(chunk);
        });

        upstreamRes.on('error', reject);

        upstreamRes.on('end', () => {
          res.end();
          const responseText = Buffer.concat(responseChunks).toString('utf-8');

          let parsedBody: unknown = null;
          let bodyRaw: string | null = null;

          if (isSSE) {
            bodyRaw = responseText;
          } else {
            try {
              parsedBody = JSON.parse(responseText);
            } catch {
              parsedBody = responseText || null;
            }
          }

          resolve({
            request: {
              timestamp: requestTimestamp,
              method: req.method ?? 'GET',
              url: `https://${hostname}${req.url ?? '/'}`,
              headers: redactHeaders(headersToRecord(req.headers)),
              body: requestBody,
            },
            response: {
              timestamp: responseTimestamp,
              status_code: upstreamRes.statusCode ?? 0,
              headers: responseHeaders,
              body: parsedBody,
              body_raw: bodyRaw,
            },
            logged_at: new Date().toISOString(),
          });
        });
      });

      upstreamReq.on('error', reject);
      if (bodyBuf.length > 0) upstreamReq.write(bodyBuf);
      upstreamReq.end();
    });
  });
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm run test:unit -- tests/unit/forwarder.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/proxy/forwarder.ts tests/unit/forwarder.test.ts
git commit -m "feat: proxy forwarder with header redaction and SSE support"
```

---

## Task 6: Proxy Server

**Files:** `src/proxy/server.ts`, `tests/integration/proxy.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/proxy.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import forge from 'node-forge';

const TEST_DIR = path.join(os.tmpdir(), `cc-trace-proxy-test-${Date.now()}`);
process.env['CC_TRACE_DIR'] = TEST_DIR;

import { ensureCA } from '../../src/proxy/cert-manager.js';
import { startProxy } from '../../src/proxy/server.js';
import type { HttpPair } from '../../src/shared/types.js';

// Create a local HTTPS server to act as upstream
let targetServer: https.Server;
let targetPort: number;
let proxyInstance: { port: number; emitter: EventEmitter; close(): Promise<void> };

beforeAll(async () => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const ca = ensureCA();

  // Create a self-signed cert for the local target server
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  cert.setSubject([{ name: 'commonName', value: 'localhost' }]);
  cert.setIssuer([{ name: 'commonName', value: 'localhost' }]);
  cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  targetServer = https.createServer(
    {
      key: forge.pki.privateKeyToPem(keys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    },
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ hello: 'world' }));
    },
  );

  await new Promise<void>(resolve => targetServer.listen(0, resolve));
  targetPort = (targetServer.address() as { port: number }).port;

  proxyInstance = await startProxy(0, ca);
});

afterAll(async () => {
  await proxyInstance.close();
  await new Promise<void>(resolve => targetServer.close(() => resolve()));
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('proxy server', () => {
  it('intercepts HTTPS CONNECT and emits an HttpPair', async () => {
    const pairPromise = new Promise<HttpPair>(resolve => {
      proxyInstance.emitter.once('pair', resolve);
    });

    // Make a request through the proxy
    await new Promise<void>((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: proxyInstance.port,
        method: 'CONNECT',
        path: `localhost:${targetPort}`,
      });

      req.on('connect', (_res, socket) => {
        // Now make an HTTPS request through the tunnel
        const tlsSocket = require('tls').connect({
          socket,
          servername: 'localhost',
          rejectUnauthorized: false, // test CA not trusted by default
        });

        tlsSocket.on('secureConnect', () => {
          tlsSocket.write(
            `GET /test HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`,
          );
        });

        tlsSocket.on('data', () => {});
        tlsSocket.on('end', () => resolve());
        tlsSocket.on('error', reject);
      });

      req.on('error', reject);
      req.end();
    });

    const pair = await pairPromise;
    expect(pair.request.method).toBe('GET');
    expect(pair.request.url).toContain('localhost');
    expect(pair.response?.status_code).toBe(200);
    expect(pair.response?.body).toMatchObject({ hello: 'world' });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:integration -- tests/integration/proxy.test.ts
```

- [ ] **Step 3: Implement proxy server**

Create `src/proxy/server.ts`:

```typescript
import * as http from 'http';
import * as tls from 'tls';
import * as net from 'net';
import { EventEmitter } from 'events';
import type { CA } from './cert-manager.js';
import { getDomainCert } from './cert-manager.js';
import { forwardRequest } from './forwarder.js';
import type { HttpPair } from '../shared/types.js';

/** Extended socket that carries routing metadata set during CONNECT */
interface ProxySocket extends tls.TLSSocket {
  _proxyHostname?: string;
  _proxyPort?: number;
}

export interface ProxyServer {
  port: number;
  emitter: EventEmitter;
  /** Gracefully close the proxy server */
  close(): Promise<void>;
}

/**
 * Starts an HTTP CONNECT proxy server that performs TLS termination and emits
 * 'pair' events for each captured request/response.
 * @param port — 0 for random available port
 * @param ca — CA from ensureCA(), used to sign per-domain leaf certs
 * @returns ProxyServer with port, emitter, and close()
 */
export async function startProxy(port: number, ca: CA): Promise<ProxyServer> {
  const emitter = new EventEmitter();

  // Single internal HTTP server that handles all decrypted traffic
  const interceptServer = http.createServer((req, res) => {
    const socket = req.socket as ProxySocket;
    const hostname = socket._proxyHostname ?? 'unknown';
    const targetPort = socket._proxyPort ?? 443;

    forwardRequest(req, res, hostname, targetPort)
      .then((pair: HttpPair) => emitter.emit('pair', pair))
      .catch(() => {
        if (!res.headersSent) {
          res.writeHead(502);
          res.end('Bad Gateway');
        }
      });
  });

  const proxyServer = http.createServer();

  proxyServer.on('connect', (req: http.IncomingMessage, clientSocket: net.Socket) => {
    const [hostname = '', portStr = '443'] = (req.url ?? '').split(':');
    const targetPort = parseInt(portStr, 10);

    // Acknowledge the CONNECT tunnel
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    const domainCert = getDomainCert(hostname, ca);

    // Wrap the client socket in TLS (we are the "server" speaking to Claude)
    const tlsSocket: ProxySocket = new tls.TLSSocket(clientSocket, {
      isServer: true,
      key: domainCert.key,
      cert: domainCert.cert,
    });

    // Store routing info for use in the request handler
    tlsSocket._proxyHostname = hostname;
    tlsSocket._proxyPort = targetPort;

    tlsSocket.on('secure', () => {
      interceptServer.emit('connection', tlsSocket);
    });

    tlsSocket.on('error', () => { /* ignore client-side disconnects */ });
  });

  return new Promise((resolve, reject) => {
    proxyServer.listen(port, '127.0.0.1', () => {
      const addr = proxyServer.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        emitter,
        close: () =>
          new Promise<void>((res, rej) =>
            proxyServer.close(err => (err ? rej(err) : res())),
          ),
      });
    });
    proxyServer.on('error', reject);
  });
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm run test:integration -- tests/integration/proxy.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/proxy/server.ts tests/integration/proxy.test.ts
git commit -m "feat: MITM proxy server with CONNECT handling and TLS termination"
```

---

## Task 7: WebSocket Broadcaster + Live Server

**Files:** `src/live-server/broadcaster.ts`, `src/live-server/server.ts`, `tests/unit/broadcaster.test.ts`, `tests/integration/live-server.test.ts`

- [ ] **Step 1: Write broadcaster unit test**

Create `tests/unit/broadcaster.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createBroadcaster } from '../../src/live-server/broadcaster.js';
import type { HttpPair } from '../../src/shared/types.js';

const makePair = (): HttpPair => ({
  request: { timestamp: 1, method: 'POST', url: 'https://a.com', headers: {}, body: null },
  response: { timestamp: 2, status_code: 200, headers: {}, body: null, body_raw: null },
  logged_at: new Date().toISOString(),
});

const makeClient = (readyState = 1) => ({
  readyState,
  send: vi.fn(),
});

describe('broadcaster', () => {
  it('sends pair to all OPEN clients', () => {
    const b = createBroadcaster();
    const c1 = makeClient(1); // OPEN
    const c2 = makeClient(1);
    b.addClient(c1 as never);
    b.addClient(c2 as never);

    b.send(makePair());

    expect(c1.send).toHaveBeenCalledOnce();
    expect(c2.send).toHaveBeenCalledOnce();
  });

  it('skips clients that are not OPEN', () => {
    const b = createBroadcaster();
    const c = makeClient(3); // CLOSED
    b.addClient(c as never);
    b.send(makePair());
    expect(c.send).not.toHaveBeenCalled();
  });

  it('removeClient prevents future sends', () => {
    const b = createBroadcaster();
    const c = makeClient(1);
    b.addClient(c as never);
    b.removeClient(c as never);
    b.send(makePair());
    expect(c.send).not.toHaveBeenCalled();
  });

  it('send payload is valid JSON with type=pair', () => {
    const b = createBroadcaster();
    const c = makeClient(1);
    b.addClient(c as never);
    const pair = makePair();
    b.send(pair);

    const payload = JSON.parse((c.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string);
    expect(payload.type).toBe('pair');
    expect(payload.data).toMatchObject({ request: { url: 'https://a.com' } });
  });

  it('getPairs returns all sent pairs in order', () => {
    const b = createBroadcaster();
    const p1 = makePair();
    const p2 = makePair();
    b.send(p1);
    b.send(p2);
    expect(b.getPairs()).toEqual([p1, p2]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:unit -- tests/unit/broadcaster.test.ts
```

- [ ] **Step 3: Implement broadcaster**

Create `src/live-server/broadcaster.ts`:

```typescript
import type WebSocket from 'ws';
import type { HttpPair } from '../shared/types.js';

export interface Broadcaster {
  addClient(ws: WebSocket): void;
  removeClient(ws: WebSocket): void;
  send(pair: HttpPair): void;
  /** Returns all pairs sent so far, for page-reload recovery */
  getPairs(): HttpPair[];
}

/**
 * Creates a broadcaster that fans out captured pairs to all connected WebSocket clients.
 * @returns Broadcaster
 */
export function createBroadcaster(): Broadcaster {
  const clients = new Set<WebSocket>();
  const history: HttpPair[] = [];

  return {
    addClient(ws: WebSocket): void {
      clients.add(ws);
    },
    removeClient(ws: WebSocket): void {
      clients.delete(ws);
    },
    send(pair: HttpPair): void {
      history.push(pair);
      const message = JSON.stringify({ type: 'pair', data: pair });
      for (const client of clients) {
        if (client.readyState === 1 /* OPEN */) {
          client.send(message);
        }
      }
    },
    getPairs(): HttpPair[] {
      return [...history];
    },
  };
}
```

- [ ] **Step 4: Run broadcaster test — expect PASS**

```bash
npm run test:unit -- tests/unit/broadcaster.test.ts
```

- [ ] **Step 5: Implement live server**

Create `src/live-server/server.ts`:

```typescript
import express from 'express';
import { WebSocketServer } from 'ws';
import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import type { Broadcaster } from './broadcaster.js';
import type { Session } from '../shared/types.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'dist', 'frontend');

export interface LiveServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Starts an Express + WebSocket server serving the React UI and streaming pairs in real time.
 * @param port — TCP port (0 for random)
 * @param broadcaster — receives pairs to push to WebSocket clients
 * @param session — current session metadata for /api/status
 * @returns LiveServer with port and close()
 */
export async function startLiveServer(
  port: number,
  broadcaster: Broadcaster,
  session: Session,
): Promise<LiveServer> {
  const app = express();

  // Serve bundled React app
  app.use(express.static(FRONTEND_DIR));

  // REST: all captured pairs (for page-reload recovery)
  app.get('/api/pairs', (_req, res) => {
    res.json(broadcaster.getPairs());
  });

  // REST: session metadata
  app.get('/api/status', (_req, res) => {
    res.json({
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      pairCount: broadcaster.getPairs().length,
      jsonlPath: session.jsonlPath,
      htmlPath: session.htmlPath,
    });
  });

  // Fallback: serve index.html for React router
  app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on('connection', ws => {
    broadcaster.addClient(ws);
    // Send all captured pairs so far on connect (page-reload recovery)
    ws.send(JSON.stringify({ type: 'history', data: broadcaster.getPairs() }));
    ws.on('close', () => broadcaster.removeClient(ws));
    ws.on('error', () => broadcaster.removeClient(ws));
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const addr = server.address() as { port: number };
      resolve({
        port: addr.port,
        close: () => new Promise<void>((res, rej) => server.close(err => (err ? rej(err) : res()))),
      });
    });
    server.on('error', reject);
  });
}
```

- [ ] **Step 6: Write live-server integration test**

Create `tests/integration/live-server.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBroadcaster } from '../../src/live-server/broadcaster.js';
import { startLiveServer } from '../../src/live-server/server.js';
import type { Session } from '../../src/shared/types.js';
import type { HttpPair } from '../../src/shared/types.js';
import WebSocket from 'ws';

const session: Session = {
  id: 'test',
  startedAt: new Date(),
  jsonlPath: '/tmp/test.jsonl',
  htmlPath: '/tmp/test.html',
  outputDir: '/tmp',
};

const makePair = (): HttpPair => ({
  request: { timestamp: 1, method: 'POST', url: 'https://a.com', headers: {}, body: null },
  response: { timestamp: 2, status_code: 200, headers: {}, body: { ok: true }, body_raw: null },
  logged_at: new Date().toISOString(),
});

let liveServer: { port: number; close(): Promise<void> };
let broadcaster: ReturnType<typeof createBroadcaster>;

beforeAll(async () => {
  broadcaster = createBroadcaster();
  liveServer = await startLiveServer(0, broadcaster, session);
});

afterAll(async () => { await liveServer.close(); });

describe('live server', () => {
  it('GET /api/pairs returns empty array initially', async () => {
    const res = await fetch(`http://localhost:${liveServer.port}/api/pairs`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it('GET /api/status returns session metadata', async () => {
    const res = await fetch(`http://localhost:${liveServer.port}/api/status`);
    const data = await res.json() as { id: string };
    expect(data.id).toBe('test');
  });

  it('WebSocket receives pair pushed via broadcaster', async () => {
    const received = await new Promise<unknown>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${liveServer.port}`);
      ws.on('message', (msg: Buffer) => {
        const payload = JSON.parse(msg.toString()) as { type: string };
        if (payload.type === 'pair') {
          ws.close();
          resolve(payload);
        }
      });
      ws.on('open', () => broadcaster.send(makePair()));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    expect((received as { type: string }).type).toBe('pair');
  });
});
```

- [ ] **Step 7: Run all tests — expect PASS**

```bash
npm run test:unit -- tests/unit/broadcaster.test.ts
npm run test:integration -- tests/integration/live-server.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/live-server/ tests/unit/broadcaster.test.ts tests/integration/live-server.test.ts
git commit -m "feat: WebSocket broadcaster and live Express server"
```

---

## Task 8: Conversation Parser + HTML Generator

**Files:** `src/shared/conversation.ts`, `src/report/html-generator.ts`, `tests/unit/conversation.test.ts`, `tests/unit/html-generator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/conversation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assembleStreaming, parseHttpPairs } from '../../src/shared/conversation.js';
import type { HttpPair } from '../../src/shared/types.js';

const SSE = `data: {"type":"message_start","message":{"id":"msg_1","role":"assistant","model":"claude-sonnet-4-6","content":[],"usage":{"input_tokens":10,"output_tokens":0}}}\n\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\ndata: {"type":"content_block_stop","index":0}\n\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\ndata: {"type":"message_stop"}\n\n`;

describe('assembleStreaming', () => {
  it('assembles text blocks from SSE deltas', () => {
    const msg = assembleStreaming(SSE);
    expect(msg.content[0]).toMatchObject({ type: 'text', text: 'Hello world' });
  });

  it('captures model from message_start', () => {
    const msg = assembleStreaming(SSE);
    expect(msg.model).toBe('claude-sonnet-4-6');
  });

  it('merges token usage from message_start and message_delta', () => {
    const msg = assembleStreaming(SSE);
    expect(msg.usage.input_tokens).toBe(10);
    expect(msg.usage.output_tokens).toBe(2);
  });

  it('sets stop_reason from message_delta', () => {
    const msg = assembleStreaming(SSE);
    expect(msg.stop_reason).toBe('end_turn');
  });
});

const makePair = (model: string, system: string, msgs: number): HttpPair => ({
  request: {
    timestamp: Date.now() / 1000,
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    headers: {},
    body: {
      model,
      system,
      messages: Array.from({ length: msgs }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `msg ${i}`,
      })),
    },
  },
  response: { timestamp: Date.now() / 1000, status_code: 200, headers: {}, body: { content: [] }, body_raw: null },
  logged_at: new Date().toISOString(),
});

describe('parseHttpPairs', () => {
  it('groups pairs by model + system prompt into conversations', () => {
    const pairs = [
      makePair('claude-sonnet-4-6', 'You are helpful', 3),
      makePair('claude-sonnet-4-6', 'You are helpful', 3),
      makePair('claude-opus-4-5', 'Different system', 3),
    ];
    const convos = parseHttpPairs(pairs);
    expect(convos).toHaveLength(2);
  });

  it('filters out pairs with fewer than 3 messages by default', () => {
    const pairs = [makePair('claude-sonnet-4-6', 'sys', 1)];
    const convos = parseHttpPairs(pairs);
    expect(convos).toHaveLength(0);
  });

  it('includes all pairs when includeAll=true', () => {
    const pairs = [makePair('claude-sonnet-4-6', 'sys', 1)];
    const convos = parseHttpPairs(pairs, { includeAll: true });
    expect(convos).toHaveLength(1);
  });
});
```

Create `tests/unit/html-generator.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateHTML } from '../../src/report/html-generator.js';
import type { HttpPair } from '../../src/shared/types.js';

const TMP = path.join(os.tmpdir(), `cc-trace-html-${Date.now()}`);

const pair: HttpPair = {
  request: { timestamp: 1, method: 'POST', url: 'https://api.anthropic.com/v1/messages', headers: {}, body: { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }] } },
  response: { timestamp: 2, status_code: 200, headers: {}, body: { id: 'msg_1', content: [{ type: 'text', text: 'Hello' }] }, body_raw: null },
  logged_at: '2026-04-26T00:00:00.000Z',
};

beforeEach(() => fs.mkdirSync(TMP, { recursive: true }));
afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('html-generator', () => {
  it('generates an HTML file at the specified path', async () => {
    const jsonlPath = path.join(TMP, 'test.jsonl');
    const htmlPath = path.join(TMP, 'test.html');
    fs.writeFileSync(jsonlPath, JSON.stringify(pair) + '\n', 'utf-8');

    await generateHTML(jsonlPath, htmlPath);
    expect(fs.existsSync(htmlPath)).toBe(true);
  });

  it('HTML file contains base64-encoded pair data', async () => {
    const jsonlPath = path.join(TMP, 'test.jsonl');
    const htmlPath = path.join(TMP, 'test.html');
    fs.writeFileSync(jsonlPath, JSON.stringify(pair) + '\n', 'utf-8');

    await generateHTML(jsonlPath, htmlPath);
    const html = fs.readFileSync(htmlPath, 'utf-8');
    // Data is base64-encoded in a script tag
    expect(html).toContain('<script');
    expect(html).toContain('window.ccTraceData');
  });

  it('skips invalid JSON lines with a warning', async () => {
    const jsonlPath = path.join(TMP, 'bad.jsonl');
    const htmlPath = path.join(TMP, 'bad.html');
    fs.writeFileSync(jsonlPath, 'NOT JSON\n' + JSON.stringify(pair) + '\n', 'utf-8');

    await generateHTML(jsonlPath, htmlPath);
    expect(fs.existsSync(htmlPath)).toBe(true);
  });

  it('throws if JSONL file does not exist', async () => {
    await expect(generateHTML('/nonexistent/path.jsonl', '/tmp/out.html'))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm run test:unit -- tests/unit/conversation.test.ts tests/unit/html-generator.test.ts
```

- [ ] **Step 3: Implement conversation parser**

Create `src/shared/conversation.ts`:

```typescript
import type {
  HttpPair,
  Conversation,
  AssembledMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
} from './types.js';

interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Reconstructs a complete AssembledMessage from a raw SSE body_raw string.
 * @param bodyRaw — raw text/event-stream string
 * @returns AssembledMessage
 */
export function assembleStreaming(bodyRaw: string): AssembledMessage {
  const events: SSEEvent[] = bodyRaw
    .split('\n')
    .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map(line => {
      try {
        return JSON.parse(line.slice(6)) as SSEEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is SSEEvent => e !== null);

  let id = '';
  let model = '';
  let stopReason: string | null = null;
  const usage = { input_tokens: 0, output_tokens: 0 };
  const textByIndex: Record<number, string> = {};
  const toolByIndex: Record<number, { id: string; name: string; inputRaw: string }> = {};
  const blockTypes: Record<number, string> = {};

  for (const event of events) {
    if (event.type === 'message_start') {
      const msg = event.message as { id: string; model: string; usage: { input_tokens: number } };
      id = msg.id;
      model = msg.model;
      usage.input_tokens = msg.usage.input_tokens;
    } else if (event.type === 'content_block_start') {
      const idx = event.index as number;
      const block = event.content_block as { type: string; id?: string; name?: string };
      blockTypes[idx] = block.type;
      if (block.type === 'text') {
        textByIndex[idx] = '';
      } else if (block.type === 'tool_use') {
        toolByIndex[idx] = { id: block.id ?? '', name: block.name ?? '', inputRaw: '' };
      }
    } else if (event.type === 'content_block_delta') {
      const idx = event.index as number;
      const delta = event.delta as { type: string; text?: string; partial_json?: string };
      if (delta.type === 'text_delta' && textByIndex[idx] !== undefined) {
        textByIndex[idx] += delta.text ?? '';
      } else if (delta.type === 'input_json_delta' && toolByIndex[idx] !== undefined) {
        toolByIndex[idx]!.inputRaw += delta.partial_json ?? '';
      }
    } else if (event.type === 'message_delta') {
      const delta = event.delta as { stop_reason?: string };
      const u = event.usage as { output_tokens?: number } | undefined;
      if (delta.stop_reason) stopReason = delta.stop_reason;
      if (u?.output_tokens !== undefined) usage.output_tokens = u.output_tokens;
    }
  }

  const content: ContentBlock[] = [];
  const indices = Object.keys(blockTypes).map(Number).sort((a, b) => a - b);
  for (const idx of indices) {
    const type = blockTypes[idx];
    if (type === 'text') {
      const block: TextBlock = { type: 'text', text: textByIndex[idx] ?? '' };
      content.push(block);
    } else if (type === 'tool_use') {
      const t = toolByIndex[idx]!;
      let input: unknown = {};
      try { input = JSON.parse(t.inputRaw); } catch { /* empty */ }
      const block: ToolUseBlock = { type: 'tool_use', id: t.id, name: t.name, input };
      content.push(block);
    }
  }

  return { id, role: 'assistant', model, content, stop_reason: stopReason, usage };
}

interface ParseOpts {
  includeAll?: boolean;
}

function getConversationKey(pair: HttpPair): string {
  const body = pair.request.body as { model?: string; system?: string } | null;
  return `${body?.model ?? ''}:${body?.system ?? ''}`;
}

function getMessageCount(pair: HttpPair): number {
  const body = pair.request.body as { messages?: unknown[] } | null;
  return body?.messages?.length ?? 0;
}

/**
 * Groups HttpPairs into Conversations by model + system prompt.
 * By default, filters out pairs with fewer than 3 messages.
 * @param pairs — raw captured pairs
 * @param opts — parsing options
 * @returns Conversation[]
 */
export function parseHttpPairs(pairs: HttpPair[], opts: ParseOpts = {}): Conversation[] {
  const groups = new Map<string, HttpPair[]>();

  for (const pair of pairs) {
    if (!pair.request.url.includes('/v1/messages')) continue;
    if (!opts.includeAll && getMessageCount(pair) < 3) continue;

    const key = getConversationKey(pair);
    const existing = groups.get(key) ?? [];
    existing.push(pair);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([key, p]) => ({
    id: key,
    model: (p[0]?.request.body as { model?: string } | null)?.model ?? 'unknown',
    pairs: p,
    startedAt: new Date((p[0]?.request.timestamp ?? 0) * 1000),
  }));
}
```

- [ ] **Step 4: Create HTML template and implement html-generator**

Create `src/report/template.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>cc-trace — __CC_TRACE_TITLE__</title>
  <script>
    window.ccTraceData = JSON.parse(decodeURIComponent(escape(atob('__CC_TRACE_DATA__'))));
  </script>
</head>
<body>
  <div id="root"></div>
  <script>
__CC_TRACE_BUNDLE__
  </script>
</body>
</html>
```

Create `src/report/html-generator.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import type { HttpPair } from '../shared/types.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'template.html');
const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'frontend', 'index.js');

/**
 * Generates a self-contained HTML report from a JSONL log file.
 * Skips invalid JSON lines with a warning. Embeds all data and JS in one file.
 * @param jsonlPath — path to the .jsonl session log
 * @param outputPath — path to write the .html report
 */
export async function generateHTML(jsonlPath: string, outputPath: string): Promise<void> {
  if (!fs.existsSync(jsonlPath)) {
    throw new Error(`JSONL file not found: ${jsonlPath}`);
  }

  const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
  const pairs: HttpPair[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      pairs.push(JSON.parse(lines[i]!) as HttpPair);
    } catch {
      process.stderr.write(`Warning: skipping invalid JSON on line ${i + 1}\n`);
    }
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Use split/join to avoid issues with special chars in replace()
  const dataB64 = Buffer.from(unescape(encodeURIComponent(JSON.stringify(pairs)))).toString('base64');

  let bundle = '';
  if (fs.existsSync(BUNDLE_PATH)) {
    bundle = fs.readFileSync(BUNDLE_PATH, 'utf-8');
  }

  const title = path.basename(jsonlPath, '.jsonl');
  const html = template
    .split('__CC_TRACE_DATA__').join(dataB64)
    .split('__CC_TRACE_BUNDLE__').join(bundle)
    .split('__CC_TRACE_TITLE__').join(title);

  fs.writeFileSync(outputPath, html, 'utf-8');
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm run test:unit -- tests/unit/conversation.test.ts tests/unit/html-generator.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/conversation.ts src/report/html-generator.ts src/report/template.html \
        tests/unit/conversation.test.ts tests/unit/html-generator.test.ts
git commit -m "feat: conversation parser and HTML report generator"
```

---

## Task 9: CLI Option Parser

**Files:** `src/cli/options.ts`, `tests/unit/options.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/options.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/cli/options.js';

describe('parseArgs', () => {
  it('attach subcommand sets command=attach', () => {
    const result = parseArgs(['attach']);
    expect(result.command).toBe('attach');
  });

  it('report subcommand with file sets command=report and jsonlPath', () => {
    const result = parseArgs(['report', 'session.jsonl']);
    expect(result.command).toBe('report');
    expect(result.jsonlPath).toBe('session.jsonl');
  });

  it('index subcommand sets command=index', () => {
    const result = parseArgs(['index']);
    expect(result.command).toBe('index');
  });

  it('--output-dir sets outputDir', () => {
    const result = parseArgs(['attach', '--output-dir', '/tmp/traces']);
    expect(result.outputDir).toBe('/tmp/traces');
  });

  it('--port sets livePort', () => {
    const result = parseArgs(['attach', '--port', '4000']);
    expect(result.livePort).toBe(4000);
  });

  it('--include-all-requests sets includeAllRequests', () => {
    const result = parseArgs(['attach', '--include-all-requests']);
    expect(result.includeAllRequests).toBe(true);
  });

  it('--no-open sets openBrowser=false', () => {
    const result = parseArgs(['attach', '--no-open']);
    expect(result.openBrowser).toBe(false);
  });

  it('--claude-path sets claudePath', () => {
    const result = parseArgs(['attach', '--claude-path', '/usr/local/bin/claude']);
    expect(result.claudePath).toBe('/usr/local/bin/claude');
  });

  it('--run-with captures remaining args as claudeArgs', () => {
    const result = parseArgs(['attach', '--run-with', 'chat', '--model', 'claude-sonnet-4-6']);
    expect(result.claudeArgs).toEqual(['chat', '--model', 'claude-sonnet-4-6']);
  });

  it('defaults: openBrowser=true, livePort=3000, includeAllRequests=false', () => {
    const result = parseArgs(['attach']);
    expect(result.openBrowser).toBe(true);
    expect(result.livePort).toBe(3000);
    expect(result.includeAllRequests).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:unit -- tests/unit/options.test.ts
```

- [ ] **Step 3: Implement options parser**

Create `src/cli/options.ts`:

```typescript
import { Command } from 'commander';

export interface ParsedArgs {
  command: 'attach' | 'report' | 'index';
  outputDir?: string;
  livePort: number;
  includeAllRequests: boolean;
  openBrowser: boolean;
  claudePath?: string;
  claudeArgs: string[];
  jsonlPath?: string;
  reportOutput?: string;
}

/**
 * Parses CLI arguments into a structured ParsedArgs object.
 * @param argv — argument array (typically process.argv.slice(2))
 * @returns ParsedArgs
 */
export function parseArgs(argv: string[]): ParsedArgs {
  let result: ParsedArgs = {
    command: 'attach',
    livePort: 3000,
    includeAllRequests: false,
    openBrowser: true,
    claudeArgs: [],
  };

  const program = new Command();
  program.exitOverride(); // throw instead of process.exit in tests

  // attach subcommand
  program
    .command('attach')
    .option('--output-dir <dir>', 'output directory for logs')
    .option('--port <number>', 'live server port', '3000')
    .option('--include-all-requests', 'log all requests, not just conversations')
    .option('--no-open', 'do not open browser automatically')
    .option('--claude-path <path>', 'path to claude binary')
    .option('--run-with <args...>', 'arguments to pass to claude')
    .action((opts: {
      outputDir?: string;
      port: string;
      includeAllRequests?: boolean;
      open: boolean;
      claudePath?: string;
      runWith?: string[];
    }) => {
      result = {
        command: 'attach',
        outputDir: opts.outputDir,
        livePort: parseInt(opts.port, 10),
        includeAllRequests: opts.includeAllRequests ?? false,
        openBrowser: opts.open,
        claudePath: opts.claudePath,
        claudeArgs: opts.runWith ?? [],
      };
    });

  // report subcommand
  program
    .command('report <jsonlPath>')
    .option('--output <path>', 'output HTML path')
    .action((jsonlPath: string, opts: { output?: string }) => {
      result = {
        command: 'report',
        livePort: 3000,
        includeAllRequests: false,
        openBrowser: false,
        claudeArgs: [],
        jsonlPath,
        reportOutput: opts.output,
      };
    });

  // index subcommand
  program
    .command('index')
    .option('--output-dir <dir>', 'directory to scan for .jsonl files')
    .action((opts: { outputDir?: string }) => {
      result = {
        command: 'index',
        livePort: 3000,
        includeAllRequests: false,
        openBrowser: false,
        claudeArgs: [],
        outputDir: opts.outputDir,
      };
    });

  try {
    program.parse(['node', 'cc-trace', ...argv]);
  } catch {
    // Commander throws on --help or unknown commands; return defaults
  }

  return result;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm run test:unit -- tests/unit/options.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/options.ts tests/unit/options.test.ts
git commit -m "feat: CLI option parser with attach/report/index subcommands"
```

---

## Task 10: CLI Commands + Entry Point

**Files:** `src/cli/commands/attach.ts`, `src/cli/commands/report.ts`, `src/cli/commands/index-cmd.ts`, `src/cli/index.ts`

- [ ] **Step 1: Implement attach command**

Create `src/cli/commands/attach.ts`:

```typescript
import * as child_process from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { ensureCA } from '../../proxy/cert-manager.js';
import { startProxy } from '../../proxy/server.js';
import { startLiveServer } from '../../live-server/server.js';
import { createBroadcaster } from '../../live-server/broadcaster.js';
import { startSession } from '../../logger/session.js';
import { createWriter } from '../../logger/jsonl-writer.js';
import { generateHTML } from '../../report/html-generator.js';
import type { ParsedArgs } from '../options.js';

function findClaudePath(custom?: string): string {
  if (custom) return custom;
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    process.stderr.write('Error: claude binary not found in PATH. Install Claude Code or use --claude-path.\n');
    process.exit(1);
  }
}

function openBrowser(url: string): void {
  try {
    execSync(`open ${url}`, { stdio: 'ignore' });
  } catch {
    process.stdout.write(`Open your browser at: ${url}\n`);
  }
}

/**
 * Orchestrates a full cc-trace capture session:
 * starts proxy + live server, spawns claude, captures pairs, generates report.
 * @param args — resolved CLI arguments
 */
export async function runAttach(args: ParsedArgs): Promise<void> {
  const ca = ensureCA();
  process.stdout.write(`CA certificate: ${ca.certPath}\n`);

  const proxy = await startProxy(0, ca);
  process.stdout.write(`Proxy listening on port ${proxy.port}\n`);

  const session = startSession({ outputDir: args.outputDir, name: args.outputName });
  process.stdout.write(`\nLogs:\n  JSONL: ${session.jsonlPath}\n  HTML:  ${session.htmlPath}\n\n`);

  const broadcaster = createBroadcaster();
  const liveServer = await startLiveServer(args.livePort, broadcaster, session);
  process.stdout.write(`Live UI: http://localhost:${liveServer.port}\n`);

  if (args.openBrowser) {
    openBrowser(`http://localhost:${liveServer.port}`);
  }

  const writer = createWriter(session.jsonlPath);

  proxy.emitter.on('pair', pair => {
    const body = pair.request.body as { messages?: unknown[] } | null;
    const messageCount = body?.messages?.length ?? 0;
    const shouldLog = args.includeAllRequests || (
      pair.request.url.includes('/v1/messages') && messageCount > 2
    );
    if (shouldLog) {
      writer.write(pair);
      broadcaster.send(pair);
    }
  });

  const claudePath = findClaudePath(args.claudePath);
  const claudeEnv = {
    ...process.env,
    HTTPS_PROXY: `http://127.0.0.1:${proxy.port}`,
    NODE_EXTRA_CA_CERTS: ca.certPath,
  };

  await new Promise<void>(resolve => {
    const child = child_process.spawn(claudePath, args.claudeArgs, {
      env: claudeEnv,
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('exit', (code) => {
      process.stdout.write(`\nClaude exited with code ${code ?? 0}\n`);
      resolve();
    });

    child.on('error', (err) => {
      process.stderr.write(`Failed to spawn claude: ${err.message}\n`);
      resolve();
    });
  });

  writer.close();
  process.stdout.write('Generating HTML report…\n');
  await generateHTML(session.jsonlPath, session.htmlPath);
  process.stdout.write(`Report: ${session.htmlPath}\n`);

  if (args.openBrowser) {
    openBrowser(session.htmlPath);
  }

  await proxy.close();
  await liveServer.close();
}
```

- [ ] **Step 2: Implement report command**

Create `src/cli/commands/report.ts`:

```typescript
import * as path from 'path';
import { generateHTML } from '../../report/html-generator.js';
import type { ParsedArgs } from '../options.js';

/**
 * Generates an HTML report from an existing JSONL file.
 * @param args — resolved CLI arguments, must have jsonlPath set
 */
export async function runReport(args: ParsedArgs): Promise<void> {
  const jsonlPath = args.jsonlPath!;
  const outputPath = args.reportOutput ?? jsonlPath.replace(/\.jsonl$/, '.html');

  process.stdout.write(`Generating HTML from ${jsonlPath}…\n`);
  await generateHTML(jsonlPath, outputPath);
  process.stdout.write(`Report written to ${outputPath}\n`);
}
```

- [ ] **Step 3: Implement index command**

Create `src/cli/commands/index-cmd.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import type { ParsedArgs } from '../options.js';

/**
 * Scans the output directory for .jsonl files and generates AI-powered summaries.
 * @param args — resolved CLI arguments
 */
export async function runIndex(args: ParsedArgs): Promise<void> {
  const dir = args.outputDir ?? path.join(process.cwd(), '.cc-trace');

  if (!fs.existsSync(dir)) {
    process.stderr.write(`Directory not found: ${dir}\n`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl') && f.startsWith('session-'));

  if (files.length === 0) {
    process.stdout.write('No session files found.\n');
    return;
  }

  process.stdout.write(`Found ${files.length} session(s). Indexing is not yet implemented.\n`);
  process.stdout.write('Run cc-trace attach to capture sessions first.\n');
}
```

- [ ] **Step 4: Implement CLI entry point**

Create `src/cli/index.ts`:

```typescript
#!/usr/bin/env node
import { parseArgs } from './options.js';
import { runAttach } from './commands/attach.js';
import { runReport } from './commands/report.js';
import { runIndex } from './commands/index-cmd.js';

const args = parseArgs(process.argv.slice(2));

switch (args.command) {
  case 'attach':
    runAttach(args).catch((err: Error) => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    });
    break;
  case 'report':
    runReport(args).catch((err: Error) => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    });
    break;
  case 'index':
    runIndex(args).catch((err: Error) => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    });
    break;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/
git commit -m "feat: CLI entry point and attach/report/index commands"
```

---

## Task 11: React Frontend

**Files:** `src/frontend/index.tsx`, `src/frontend/App.tsx`, `src/frontend/hooks/useWebSocket.ts`, `src/frontend/components/ConversationView.tsx`, `src/frontend/components/RawPairsView.tsx`, `src/frontend/components/JsonView.tsx`, `vite.config.ts`

- [ ] **Step 1: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/frontend',
  build: {
    outDir: path.resolve(__dirname, 'dist/frontend'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
```

- [ ] **Step 2: Create useWebSocket hook**

Create `src/frontend/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useState } from 'react';

interface WsMessage<T> {
  type: string;
  data: T;
}

/**
 * Connects to the cc-trace WebSocket server and returns accumulated pairs.
 * Reconnects on disconnect.
 */
export function useWebSocket<T>(url: string): T[] {
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    let ws: WebSocket;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(url);

      ws.onmessage = (event: MessageEvent<string>) => {
        const msg = JSON.parse(event.data) as WsMessage<T | T[]>;
        if (msg.type === 'history') {
          setItems(msg.data as T[]);
        } else if (msg.type === 'pair') {
          setItems(prev => [...prev, msg.data as T]);
        }
      };

      ws.onclose = () => {
        if (!cancelled) setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [url]);

  return items;
}
```

- [ ] **Step 3: Create ConversationView**

Create `src/frontend/components/ConversationView.tsx`:

```tsx
import React from 'react';
import type { HttpPair } from '../../shared/types.js';
import { assembleStreaming, parseHttpPairs } from '../../shared/conversation.js';

interface Props {
  pairs: HttpPair[];
  includeAll: boolean;
}

function renderBody(pair: HttpPair): React.ReactNode {
  const resp = pair.response;
  if (!resp) return <em style={{ color: '#888' }}>No response (orphaned)</em>;
  if (resp.body_raw) {
    const msg = assembleStreaming(resp.body_raw);
    return (
      <div>
        {msg.content.map((block, i) =>
          block.type === 'text'
            ? <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{block.text}</p>
            : <pre key={i} style={{ background: '#1e1e1e', padding: 8, borderRadius: 4 }}>
                {`[tool: ${block.name}]\n${JSON.stringify(block.input, null, 2)}`}
              </pre>
        )}
        <small style={{ color: '#888' }}>
          {`↑ ${msg.usage.input_tokens} tokens  ↓ ${msg.usage.output_tokens} tokens`}
        </small>
      </div>
    );
  }
  return <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(resp.body, null, 2)}</pre>;
}

export function ConversationView({ pairs, includeAll }: Props) {
  const conversations = parseHttpPairs(pairs, { includeAll });

  if (conversations.length === 0) {
    return <p style={{ color: '#888', padding: 16 }}>No conversations captured yet.</p>;
  }

  return (
    <div>
      {conversations.map(conv => (
        <div key={conv.id} style={{ marginBottom: 32, borderBottom: '1px solid #333', paddingBottom: 16 }}>
          <h3 style={{ color: '#569cd6', marginBottom: 8 }}>{conv.model}</h3>
          {conv.pairs.map((pair, i) => {
            const reqBody = pair.request.body as { messages?: Array<{ role: string; content: string }> } | null;
            const messages = reqBody?.messages ?? [];
            const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
            return (
              <div key={i} style={{ marginBottom: 16 }}>
                {lastUserMsg && (
                  <div style={{ background: '#252526', padding: 8, borderRadius: 4, marginBottom: 8 }}>
                    <strong style={{ color: '#9cdcfe' }}>User: </strong>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{lastUserMsg.content}</span>
                  </div>
                )}
                <div style={{ padding: 8 }}>
                  <strong style={{ color: '#4ec9b0' }}>Assistant: </strong>
                  {renderBody(pair)}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create RawPairsView**

Create `src/frontend/components/RawPairsView.tsx`:

```tsx
import React, { useState } from 'react';
import type { HttpPair } from '../../shared/types.js';

interface Props { pairs: HttpPair[] }

export function RawPairsView({ pairs }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (pairs.length === 0) {
    return <p style={{ color: '#888', padding: 16 }}>No requests captured yet.</p>;
  }

  return (
    <div>
      {pairs.map((pair, i) => (
        <div key={i} style={{ borderBottom: '1px solid #333', padding: '8px 0' }}>
          <button
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{ background: 'none', border: 'none', color: '#569cd6', cursor: 'pointer', textAlign: 'left', width: '100%' }}
          >
            [{pair.response?.status_code ?? '—'}] {pair.request.method} {pair.request.url}
            <small style={{ color: '#888', marginLeft: 8 }}>{pair.logged_at}</small>
          </button>
          {expanded === i && (
            <pre style={{ background: '#1e1e1e', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' }}>
              {JSON.stringify(pair, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create JsonView**

Create `src/frontend/components/JsonView.tsx`:

```tsx
import React from 'react';
import type { HttpPair } from '../../shared/types.js';

interface Props { pairs: HttpPair[] }

export function JsonView({ pairs }: Props) {
  return (
    <pre style={{ background: '#1e1e1e', padding: 16, borderRadius: 4, fontSize: 11, overflow: 'auto', maxHeight: '80vh' }}>
      {JSON.stringify(pairs, null, 2)}
    </pre>
  );
}
```

- [ ] **Step 6: Create App.tsx**

Create `src/frontend/App.tsx`:

```tsx
import React, { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket.js';
import { ConversationView } from './components/ConversationView.js';
import { RawPairsView } from './components/RawPairsView.js';
import { JsonView } from './components/JsonView.js';
import type { HttpPair } from '../shared/types.js';

type View = 'conversations' | 'raw' | 'json';

const WS_URL = typeof window !== 'undefined'
  ? `ws://${window.location.host}`
  : 'ws://localhost:3000';

// For static HTML report, data is injected at build time
const STATIC_DATA: HttpPair[] | null =
  typeof window !== 'undefined' && (window as { ccTraceData?: HttpPair[] }).ccTraceData
    ? (window as { ccTraceData: HttpPair[] }).ccTraceData
    : null;

export function App() {
  const livePairs = useWebSocket<HttpPair>(WS_URL);
  const pairs = STATIC_DATA ?? livePairs;
  const [view, setView] = useState<View>('conversations');
  const [includeAll, setIncludeAll] = useState(false);

  const tabs: { id: View; label: string }[] = [
    { id: 'conversations', label: 'Conversations' },
    { id: 'raw', label: `Raw (${pairs.length})` },
    { id: 'json', label: 'JSON' },
  ];

  return (
    <div style={{ fontFamily: 'monospace', background: '#1e1e1e', color: '#d4d4d4', minHeight: '100vh', padding: 16 }}>
      <h1 style={{ color: '#569cd6', marginBottom: 16 }}>cc-trace</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            style={{
              padding: '6px 12px',
              background: view === tab.id ? '#569cd6' : '#2d2d2d',
              color: view === tab.id ? '#fff' : '#d4d4d4',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
        <label style={{ marginLeft: 'auto', color: '#888', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={includeAll}
            onChange={e => setIncludeAll(e.target.checked)}
            style={{ marginRight: 4 }}
          />
          Show all requests
        </label>
      </div>

      {view === 'conversations' && <ConversationView pairs={pairs} includeAll={includeAll} />}
      {view === 'raw' && <RawPairsView pairs={pairs} />}
      {view === 'json' && <JsonView pairs={pairs} />}
    </div>
  );
}
```

- [ ] **Step 7: Create index.tsx**

Create `src/frontend/index.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
```

Create `src/frontend/index.html` (Vite entry):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>cc-trace</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./index.tsx"></script>
</body>
</html>
```

- [ ] **Step 8: Build frontend and verify**

```bash
npm run build:frontend
ls dist/frontend/
```
Expected: `index.js`, `index.html`, possibly `index.css`

- [ ] **Step 9: Commit**

```bash
git add src/frontend/ vite.config.ts dist/frontend/
git commit -m "feat: React frontend with live WebSocket and static HTML modes"
```

---

## Task 12: E2E Tests

**Files:** `tests/e2e/fixtures/mock-api.ts`, `tests/e2e/fixtures/mock-claude.ts`, `tests/e2e/attach.e2e.ts`

- [ ] **Step 1: Create mock API server**

Create `tests/e2e/fixtures/mock-api.ts`:

```typescript
import * as https from 'https';
import forge from 'node-forge';

/** Start a local HTTPS server that returns Anthropic-shaped responses */
export async function startMockApi(): Promise<{ url: string; close(): Promise<void> }> {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '10';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  cert.setSubject([{ name: 'commonName', value: 'localhost' }]);
  cert.setIssuer([{ name: 'commonName', value: 'localhost' }]);
  cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const server = https.createServer(
    {
      key: forge.pki.privateKeyToPem(keys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    },
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello from mock API' }],
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }));
    },
  );

  return new Promise(resolve => {
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      resolve({
        url: `https://localhost:${port}`,
        close: () => new Promise<void>(res => server.close(() => res())),
      });
    });
  });
}
```

- [ ] **Step 2: Create mock claude binary**

Create `tests/e2e/fixtures/mock-claude.ts`:

```typescript
#!/usr/bin/env node
/**
 * Simulates Claude Code making 3 API calls then exiting.
 * Used in E2E tests as the --claude-path target.
 */
import * as https from 'https';

const PROXY = process.env['HTTPS_PROXY'];
const CA_CERT = process.env['NODE_EXTRA_CA_CERTS'];

if (!PROXY) {
  process.stderr.write('mock-claude: HTTPS_PROXY not set\n');
  process.exit(1);
}

const [proxyHost, proxyPortStr] = PROXY.replace('http://', '').split(':');
const proxyPort = parseInt(proxyPortStr ?? '0', 10);

async function makeRequest(path: string, messageCount: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // CONNECT to proxy
    const req = require('http').request({
      host: proxyHost,
      port: proxyPort,
      method: 'CONNECT',
      path: `api.anthropic.com:443`,
    });

    req.on('connect', (_res: unknown, socket: import('net').Socket) => {
      const tlsSocket = require('tls').connect({
        socket,
        servername: 'api.anthropic.com',
        rejectUnauthorized: false,
      });

      const body = JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: Array.from({ length: messageCount }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `message ${i}`,
        })),
      });

      tlsSocket.on('secureConnect', () => {
        tlsSocket.write([
          `POST ${path} HTTP/1.1`,
          `Host: api.anthropic.com`,
          `Content-Type: application/json`,
          `Content-Length: ${Buffer.byteLength(body)}`,
          `Connection: close`,
          '',
          body,
        ].join('\r\n'));
      });

      tlsSocket.on('data', () => {});
      tlsSocket.on('end', resolve);
      tlsSocket.on('error', reject);
    });

    req.on('error', reject);
    req.end();
  });
}

(async () => {
  // 3 requests: 2 with enough messages to be logged, 1 too short
  await makeRequest('/v1/messages', 4);
  await makeRequest('/v1/messages', 4);
  await makeRequest('/v1/messages', 1); // filtered by default
  process.exit(0);
})();
```

- [ ] **Step 3: Write E2E test**

Create `tests/e2e/attach.e2e.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as url from 'url';

const TEST_DIR = path.join(os.tmpdir(), `cc-trace-e2e-${Date.now()}`);
const MOCK_CLAUDE = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  'fixtures/mock-claude.ts'
);

process.env['CC_TRACE_DIR'] = path.join(TEST_DIR, 'ca');

import { ensureCA } from '../../src/proxy/cert-manager.js';
import { startProxy } from '../../src/proxy/server.js';
import { startSession } from '../../src/logger/session.js';
import { createWriter } from '../../src/logger/jsonl-writer.js';
import { createBroadcaster } from '../../src/live-server/broadcaster.js';
import type { HttpPair } from '../../src/shared/types.js';
import { execSync } from 'child_process';

beforeAll(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

describe('full attach pipeline (E2E)', () => {
  it('captures pairs from mock-claude and writes JSONL', async () => {
    const ca = ensureCA();
    const proxy = await startProxy(0, ca);
    const session = startSession({ outputDir: TEST_DIR, name: 'e2e-test' });
    const broadcaster = createBroadcaster();
    const writer = createWriter(session.jsonlPath);
    const captured: HttpPair[] = [];

    proxy.emitter.on('pair', (pair: HttpPair) => {
      const body = pair.request.body as { messages?: unknown[] } | null;
      if (pair.request.url.includes('/v1/messages') && (body?.messages?.length ?? 0) > 2) {
        writer.write(pair);
        broadcaster.send(pair);
        captured.push(pair);
      }
    });

    // Run mock-claude via tsx
    await new Promise<void>((resolve, reject) => {
      const { spawn } = require('child_process');
      const child = spawn('npx', ['tsx', MOCK_CLAUDE], {
        env: {
          ...process.env,
          HTTPS_PROXY: `http://127.0.0.1:${proxy.port}`,
          NODE_EXTRA_CA_CERTS: ca.certPath,
        },
        stdio: 'pipe',
      });
      child.on('exit', resolve);
      child.on('error', reject);
      setTimeout(() => reject(new Error('mock-claude timeout')), 15000);
    });

    writer.close();
    await proxy.close();

    // Assertions
    expect(fs.existsSync(session.jsonlPath)).toBe(true);
    expect(captured.length).toBeGreaterThanOrEqual(2);

    const lines = fs.readFileSync(session.jsonlPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const firstPair = JSON.parse(lines[0]!) as HttpPair;
    expect(firstPair.request.method).toBe('POST');
    expect(firstPair.request.url).toContain('/v1/messages');
    expect(firstPair.response?.status_code).toBeDefined();
  }, 20000);
});
```

- [ ] **Step 4: Run E2E test**

```bash
npm run test:e2e -- tests/e2e/attach.e2e.ts
```

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/
git commit -m "test: E2E test with mock-claude and full proxy pipeline"
```

---

## Task 13: GitHub Actions CI

**Files:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: macos-latest
    strategy:
      matrix:
        node-version: [20.x, 22.x]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Unit tests (100% coverage)
        run: npm run test:unit

      - name: Integration tests
        run: npm run test:integration

      - name: E2E tests
        run: npm run test:e2e

      - name: Check for unused exports
        run: npx ts-prune

      - name: Dependency audit
        run: npm audit --audit-level=high
```

- [ ] **Step 2: Create release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  release:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22.x
          cache: npm
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Unit tests
        run: npm run test:unit

      - name: Integration tests
        run: npm run test:integration

      - name: E2E tests
        run: npm run test:e2e

      - name: Publish to npm
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: GitHub Actions CI and release workflows"
```

---

## Task 14: Full Test Run + Coverage Check

- [ ] **Step 1: Run full test suite**

```bash
npm run typecheck && npm run lint && npm run build && npm test
```

Expected: all passes, 100% unit coverage.

- [ ] **Step 2: Fix any coverage gaps**

If coverage < 100% for any file in `src/` (excluding `src/frontend/`):
- Read the coverage report output
- Add tests for the uncovered branches
- Re-run until 100%

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "chore: full test suite passing at 100% unit coverage"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| MITM proxy via HTTPS_PROXY + NODE_EXTRA_CA_CERTS | Tasks 3, 6, 7, 10 |
| CA cert generation (no openssl CLI) | Task 3 |
| Per-domain cert signing + caching | Task 3 |
| Atomic JSONL writes | Task 4 |
| Session path resolution + --output-dir | Task 4 |
| Header redaction | Task 5 |
| SSE streaming buffer | Task 5 |
| HTTP CONNECT handler | Task 6 |
| TLS termination | Task 6 |
| 'pair' EventEmitter | Task 6 |
| WebSocket broadcaster | Task 7 |
| Live server /api/pairs, /api/status, /ws | Task 7 |
| Page-reload recovery via history message | Task 7 |
| SSE assembly from body_raw | Task 8 |
| Conversation grouping by model+system | Task 8 |
| HTML self-contained report | Task 8 |
| CLI attach/report/index subcommands | Tasks 9, 10 |
| --include-all-requests flag | Tasks 9, 10 |
| --run-with passes args to claude | Tasks 9, 10 |
| React frontend with 3 views | Task 11 |
| WebSocket live updates in browser | Task 11 |
| Static HTML mode via window.ccTraceData | Task 11 |
| Unit tests 100% coverage | All tasks + Task 14 |
| Integration tests | Tasks 6, 7 |
| E2E tests with mock-claude | Task 12 |
| GitHub Actions CI | Task 13 |
| Release workflow | Task 13 |
| CLAUDE.md quality gates | Task 1 |
