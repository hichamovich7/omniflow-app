/**
 * File name for the Medium summary's "Download Markdown" (TASK-062), from its
 * title. Client-safe: no server import.
 */
export function mediumSummaryFilename(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `medium-summary${slug ? `-${slug}` : ''}.md`;
}
