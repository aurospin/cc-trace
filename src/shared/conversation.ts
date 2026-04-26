import type {
  AssembledMessage,
  ContentBlock,
  Conversation,
  HttpPair,
  TextBlock,
  ToolUseBlock,
} from "./types.js";

interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Reconstructs a complete AssembledMessage from a raw SSE body_raw string.
 * @param bodyRaw - raw text/event-stream string
 * @returns AssembledMessage with assembled content blocks and usage
 */
export function assembleStreaming(bodyRaw: string): AssembledMessage {
  const events: SSEEvent[] = bodyRaw
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => {
      try {
        return JSON.parse(line.slice(6)) as SSEEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is SSEEvent => e !== null);

  let id = "";
  let model = "";
  let stopReason: string | null = null;
  const usage = { input_tokens: 0, output_tokens: 0 };
  const textByIndex: Record<number, string> = {};
  const toolByIndex: Record<number, { id: string; name: string; inputRaw: string }> = {};
  const blockTypes: Record<number, string> = {};

  for (const event of events) {
    if (event.type === "message_start") {
      const msg = event.message as { id: string; model: string; usage: { input_tokens: number } };
      id = msg.id;
      model = msg.model;
      usage.input_tokens = msg.usage.input_tokens;
    } else if (event.type === "content_block_start") {
      const idx = event.index as number;
      const block = event.content_block as { type: string; id?: string; name?: string };
      blockTypes[idx] = block.type;
      if (block.type === "text") {
        textByIndex[idx] = "";
      } else if (block.type === "tool_use") {
        toolByIndex[idx] = { id: block.id ?? "", name: block.name ?? "", inputRaw: "" };
      }
    } else if (event.type === "content_block_delta") {
      const idx = event.index as number;
      const delta = event.delta as { type: string; text?: string; partial_json?: string };
      if (delta.type === "text_delta" && textByIndex[idx] !== undefined) {
        textByIndex[idx] += delta.text ?? "";
      } else if (delta.type === "input_json_delta" && toolByIndex[idx] !== undefined) {
        const tool = toolByIndex[idx];
        if (tool !== undefined) {
          tool.inputRaw += delta.partial_json ?? "";
        }
      }
    } else if (event.type === "message_delta") {
      const delta = event.delta as { stop_reason?: string };
      const u = event.usage as { output_tokens?: number } | undefined;
      if (delta.stop_reason) stopReason = delta.stop_reason;
      if (u?.output_tokens !== undefined) usage.output_tokens = u.output_tokens;
    }
  }

  const content: ContentBlock[] = [];
  const indices = Object.keys(blockTypes)
    .map(Number)
    .sort((a, b) => a - b);
  for (const idx of indices) {
    const type = blockTypes[idx];
    if (type === "text") {
      /* v8 ignore next */
      const block: TextBlock = { type: "text", text: textByIndex[idx] ?? "" };
      content.push(block);
    } else if (type === "tool_use") {
      const t = toolByIndex[idx];
      /* v8 ignore next */
      if (t === undefined) continue;
      let input: unknown = {};
      try {
        input = JSON.parse(t.inputRaw);
      } catch {
        /* empty */
      }
      const block: ToolUseBlock = { type: "tool_use", id: t.id, name: t.name, input };
      content.push(block);
    }
  }

  return { id, role: "assistant", model, content, stop_reason: stopReason, usage };
}

interface ParseOpts {
  includeAll?: boolean;
}

function getConversationKey(pair: HttpPair): string {
  const body = pair.request.body as { model?: string; system?: unknown } | null;
  const system = body?.system;
  const systemKey =
    typeof system === "string" ? system : system === undefined ? "" : JSON.stringify(system);
  return `${body?.model ?? ""}:${systemKey}`;
}

function getMessageCount(pair: HttpPair): number {
  const body = pair.request.body as { messages?: unknown[] } | null;
  return body?.messages?.length ?? 0;
}

/**
 * Groups HttpPairs into Conversations by model + system prompt.
 * By default, filters out pairs with fewer than 3 messages.
 * @param pairs - raw captured pairs
 * @param opts - parsing options (includeAll: include all pairs regardless of message count)
 * @returns Conversation[]
 */
export function parseHttpPairs(pairs: HttpPair[], opts: ParseOpts = {}): Conversation[] {
  const groups = new Map<string, HttpPair[]>();

  for (const pair of pairs) {
    if (!pair.request.url.includes("/v1/messages")) continue;
    if (!opts.includeAll && getMessageCount(pair) < 3) continue;

    const key = getConversationKey(pair);
    const existing = groups.get(key) ?? [];
    existing.push(pair);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([key, p]) => ({
    id: key,
    /* v8 ignore next */
    model: (p[0]?.request.body as { model?: string } | null)?.model ?? "unknown",
    pairs: p,
    /* v8 ignore next */
    startedAt: new Date((p[0]?.request.timestamp ?? 0) * 1000),
  }));
}
