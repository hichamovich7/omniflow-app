export function buildBrandProfileContext(description: string | null): string {
  if (!description?.trim()) return '';
  return `Brand context for this project — respect this tone, audience, and style in everything you generate: ${description.trim()}`;
}
