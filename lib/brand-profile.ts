export function buildBrandProfileContext(description: string | null): string {
  if (!description?.trim()) return '';
  // The Brand Profile sets the brand voice; it never overrides source facts or
  // options the user explicitly chose (context priority, docs/DECISIONS.md
  // "Shared Core + Niche-Specific Configuration").
  return `Brand context for this project — respect this tone, audience, and style in everything you generate, without overriding facts from the provided source or options the user explicitly chose: ${description.trim()}`;
}
