function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object";
}

/** Narrows an unknown value to the `/api/status` response shape. */
export function isStatusMeta(x: unknown): x is { version: string; startedAtIso: string } {
  return isObject(x) && typeof x.version === "string" && typeof x.startedAtIso === "string";
}

/** Narrows an unknown WS payload to a `pair` frame. */
export function isPairWsFrame(x: unknown): x is { type: "pair"; pair: unknown } {
  return isObject(x) && x.type === "pair" && "pair" in x;
}

/** Narrows an unknown request body to one carrying a `messages` array. */
export function isMessagesBody(x: unknown): x is { messages: unknown[] } {
  return isObject(x) && Array.isArray(x.messages);
}

/** Narrows an unknown request body to one optionally carrying `model` + `system`. */
export function isModelBody(x: unknown): x is { model?: string; system?: unknown } {
  return isObject(x);
}

/** Narrows an unknown response body to one carrying a `content` array. */
export function isContentBody(x: unknown): x is { content: unknown[] } {
  return isObject(x) && Array.isArray(x.content);
}

/** Narrows the result of `Server.address()` to the network-socket form (rejects null + UNIX path). */
export function isAddressInfo(x: unknown): x is { port: number } {
  return isObject(x) && typeof x.port === "number";
}

/** Narrows an unknown error to one optionally carrying a `code` string. */
export function isErrorWithCode(x: unknown): x is { code?: string } {
  if (!isObject(x)) return false;
  if (!("code" in x)) return true;
  return typeof x.code === "string";
}

/** Narrows the parsed `package.json` to the slice cc-trace consumes. */
export function isPackageJson(x: unknown): x is { version: string } {
  return isObject(x) && typeof x.version === "string";
}

/** Narrows an SSE `message_start.message` payload. */
export function isStreamMessage(
  x: unknown,
): x is { id: string; model: string; usage: { input_tokens: number } } {
  return (
    isObject(x) &&
    typeof x.id === "string" &&
    typeof x.model === "string" &&
    isObject(x.usage) &&
    typeof x.usage.input_tokens === "number"
  );
}

/** Narrows an SSE `content_block_start.content_block` payload. */
export function isStreamContentBlock(
  x: unknown,
): x is { type: string; id?: string; name?: string } {
  if (!isObject(x) || typeof x.type !== "string") return false;
  if ("id" in x && typeof x.id !== "string") return false;
  if ("name" in x && typeof x.name !== "string") return false;
  return true;
}

/** Narrows an SSE `content_block_delta.delta` payload. */
export function isStreamContentBlockDelta(
  x: unknown,
): x is { type: string; text?: string; partial_json?: string } {
  if (!isObject(x) || typeof x.type !== "string") return false;
  if ("text" in x && typeof x.text !== "string") return false;
  if ("partial_json" in x && typeof x.partial_json !== "string") return false;
  return true;
}

/** Narrows an SSE `message_delta.delta` payload. */
export function isStreamMessageDelta(x: unknown): x is { stop_reason?: string } {
  if (!isObject(x)) return false;
  if ("stop_reason" in x && typeof x.stop_reason !== "string") return false;
  return true;
}

/** Narrows an SSE `message_delta.usage` payload. */
export function isStreamUsage(x: unknown): x is { output_tokens?: number } {
  if (!isObject(x)) return false;
  if ("output_tokens" in x && typeof x.output_tokens !== "number") return false;
  return true;
}

/** Narrows an unknown value to an HttpPair shape (structural check). */
export function isHttpPair(x: unknown): x is import("./types.js").HttpPair {
  return (
    isObject(x) &&
    isObject(x.request) &&
    typeof x.logged_at === "string" &&
    (x.response === null || isObject(x.response))
  );
}

/** Narrows an unknown value to an HttpPair array. */
export function isHttpPairArray(x: unknown): x is import("./types.js").HttpPair[] {
  return Array.isArray(x) && x.every(isHttpPair);
}

/** Narrows an unknown value to a PendingPair shape. */
export function isPendingPair(x: unknown): x is import("./types.js").PendingPair {
  return (
    isObject(x) &&
    typeof x.pairIndex === "number" &&
    isObject(x.request) &&
    typeof x.startedAt === "string"
  );
}

/** Narrows an unknown WebSocket message to the `{ type, data }` envelope shape. */
export function isWsEnvelope(x: unknown): x is { type: string; data: unknown } {
  return isObject(x) && typeof x.type === "string" && "data" in x;
}
