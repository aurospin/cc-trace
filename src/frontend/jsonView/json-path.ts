/**
 * Format a JSON-tree node for clipboard copy.
 *
 * - Objects and arrays → pretty-printed JSON (2-space indent) with trailing newline.
 * - Strings → raw value (no surrounding quotes, no escape transformation).
 * - Numbers, booleans, null → JSON literal via `String(value)` / `"null"`.
 *
 * @param node - any JSON-shaped value
 * @returns clipboard-ready text
 */
export function formatForClipboard(node: unknown): string {
  if (node === null) return "null";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (typeof node === "object") return `${JSON.stringify(node, null, 2)}\n`;
  return String(node);
}

/**
 * Render a JSON path from a tuple of segments.
 *
 * Rules:
 * - Empty segments → `"$"` (root sentinel).
 * - Numeric segment → `[N]` (concatenated to previous segment, no leading dot).
 * - String segment → `key`, joined by `.` to the previous string segment.
 *
 * @param segments - ordered key/index tuple
 * @returns dot-and-bracket path expression
 */
export function formatJsonPath(segments: ReadonlyArray<string | number>): string {
  if (segments.length === 0) return "$";
  let out = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] as string | number;
    if (typeof seg === "number") {
      out += `[${seg}]`;
    } else if (i === 0) {
      out += seg;
    } else {
      out += `.${seg}`;
    }
  }
  return out;
}
