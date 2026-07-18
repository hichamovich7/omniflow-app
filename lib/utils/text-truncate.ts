/**
 * Cuts `text` down to at most `maxLength` characters at the last complete
 * word boundary — never mid-word, no "..." appended (the result must read as
 * a clean, standalone H1/meta title, not a visibly truncated snippet).
 * If `text` has no space before `maxLength` (a single long token), falls
 * back to a hard cut at `maxLength` since there is no word boundary to cut at.
 */
export function truncateAtWordBoundary(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const sliced = trimmed.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');

  if (lastSpace <= 0) return sliced;
  return sliced.slice(0, lastSpace).trimEnd();
}
