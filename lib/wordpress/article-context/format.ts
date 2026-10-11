import type { ArticleSection, WordPressArticleContext } from './types';

/** Article body budget sent to the text model (characters). */
export const ARTICLE_PROMPT_MAX_LENGTH = 9000;
/** Text kept for a section a Pin is built from. */
const FOCUS_SECTION_MAX_LENGTH = 1100;
/** Text kept for every other section, so the whole structure stays visible. */
const OTHER_SECTION_MAX_LENGTH = 260;

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return `${(lastStop > max * 0.6 ? cut.slice(0, lastStop + 1) : cut).trimEnd()}…`;
}

function sectionBlock(section: ArticleSection, max: number): string {
  const label = section.kind === 'intro' ? 'Introduction' : section.heading;
  const images = section.images
    .map((image) => [image.alt, image.caption].filter(Boolean).join(' — '))
    .filter(Boolean)
    .map((text) => `  [image] ${text}`);
  return [`[${section.id}] (${section.kind}) ${label}`, clip(section.text, max), ...images].filter(Boolean).join('\n');
}

/**
 * The article as structured text for a prompt: every section keeps its id,
 * kind and heading; the sections Pins are built from keep most of their
 * text, the others a short opening. Bounded by `maxLength` without ever
 * dropping a section heading — the structure is the important part.
 */
export function formatArticleSectionsForPrompt(
  context: WordPressArticleContext,
  options: { focusSectionIds?: readonly string[]; maxLength?: number } = {}
): string {
  const focus = new Set(options.focusSectionIds ?? []);
  const maxLength = options.maxLength ?? ARTICLE_PROMPT_MAX_LENGTH;
  const headingsLength = context.sections.reduce((total, section) => total + section.heading.length + 24, 0);
  const focusCount = context.sections.filter((section) => focus.has(section.id)).length;
  const otherCount = context.sections.length - focusCount;
  const room = Math.max(maxLength - headingsLength, 0);
  // Focus sections get most of the room; the share shrinks evenly when the
  // article is long so that every section still fits.
  const focusMax = focusCount ? Math.min(FOCUS_SECTION_MAX_LENGTH, Math.floor((room * 0.75) / focusCount)) : 0;
  const otherMax = otherCount
    ? Math.min(focusCount ? OTHER_SECTION_MAX_LENGTH : FOCUS_SECTION_MAX_LENGTH, Math.floor((room - focusMax * focusCount) / otherCount))
    : 0;

  return context.sections
    .map((section) => sectionBlock(section, Math.max(focus.has(section.id) ? focusMax : otherMax, 60)))
    .join('\n\n');
}
