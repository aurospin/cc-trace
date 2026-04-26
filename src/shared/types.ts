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
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
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

/** Six independent token totals summed across all 2xx /v1/messages responses */
export interface SessionTokenTotals {
  cacheRead: number;
  cacheCreationInput: number;
  cacheCreation5m: number;
  cacheCreation1h: number;
  input: number;
  output: number;
}

/** At-a-glance session aggregate derived from HttpPair[] */
export interface SessionStats {
  turnCount: number;
  requestCount: number;
  requestsByMethod: Record<string, number>;
  tokens: SessionTokenTotals;
}

/** Build/start-time metadata exposed to the frontend */
export interface CcTraceMeta {
  /** package.json version at build/serve time */
  version: string;
  /** ISO-8601 UTC timestamp; report-generation time (static) or live-server start time (live) */
  generatedAt: string;
}
