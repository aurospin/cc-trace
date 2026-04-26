/**
 * Replaces every occurrence of each token in `replacements` with its mapped value.
 * Keys are sorted by length descending so longer tokens are substituted first,
 * preventing crosstalk when one token name is a substring of another.
 * @param template - input string containing literal token markers
 * @param replacements - map of token → replacement string
 * @returns the template with every token replaced
 */
export function substituteTokens(template: string, replacements: Record<string, string>): string {
  let out = template;
  const tokens = Object.keys(replacements).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    out = out.split(token).join(replacements[token] as string);
  }
  return out;
}
