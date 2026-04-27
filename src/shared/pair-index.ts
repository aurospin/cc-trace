/**
 * Returns the minimum label width for a session with the given highest pair index.
 * @param highestIndex - the largest pairIndex in the current session (must be >= 1)
 * @returns minimum padding width, always >= 2
 */
export function padWidth(highestIndex: number): number {
  if (highestIndex < 1) throw new Error(`padWidth: highestIndex must be >= 1, got ${highestIndex}`);
  return Math.max(2, String(highestIndex).length);
}

/**
 * Computes the label width for a collection of pairs from their pairIndex values.
 * @param pairs - array of objects carrying an optional pairIndex field
 * @returns minimum padding width for consistent column alignment, always >= 2
 */
export function labelWidthForPairs(pairs: ReadonlyArray<{ pairIndex?: number }>): number {
  return padWidth(Math.max(1, ...pairs.map((p) => p.pairIndex ?? 1)));
}

/**
 * Formats a pair label for display in any tab.
 * @param prefix - "Turn" for Transcript tab, "Pair" for Pairs and JSON tabs
 * @param idx - 1-based pair index (must be >= 1)
 * @param width - minimum label width (must be >= 2)
 * @returns formatted label e.g. "Turn 03" or "Pair 042"
 */
export function formatPairLabel(prefix: "Turn" | "Pair", idx: number, width: number): string {
  if (idx < 1) throw new Error(`formatPairLabel: idx must be >= 1, got ${idx}`);
  if (width < 2) throw new Error(`formatPairLabel: width must be >= 2, got ${width}`);
  return `${prefix} ${String(idx).padStart(width, "0")}`;
}
