import { FAQ_PLACEMENT_MARKER } from '@/lib/ai/prompts/wordpress-article-prompt';
import type { SupportedLanguage } from '@/types/pinterest';

export interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_HEADINGS: Record<SupportedLanguage, string> = {
  en: 'Frequently Asked Questions',
  de: 'Häufig gestellte Fragen',
  es: 'Preguntas frecuentes',
  fr: 'Questions fréquentes',
};

// Any H2/H3 the model might have written for an FAQ despite the prompt —
// used to guarantee the article never ends up with two FAQ sections.
const EXISTING_FAQ_HEADING_PATTERN =
  /^#{2,3}\s*(FAQ\b|Frequently Asked Questions|Häufig gestellte Fragen|Preguntas frecuentes|Questions fréquentes|Foire aux questions)/im;

const MARKER_LINE_PATTERN = new RegExp(`^[ \\t]*${FAQ_PLACEMENT_MARKER.replace(/[{}]/g, '\\$&')}[ \\t]*$\\n?`, 'gm');

interface InsertFaqOptions {
  language: SupportedLanguage;
  /** false renders questions as plain paragraphs instead of H3 (includeH3 = "Non" bans H3). */
  useH3: boolean;
}

export function renderFaqSection(faq: FaqItem[], opts: InsertFaqOptions): string {
  const items = faq.map((item) => {
    const question = item.question.trim();
    const answer = item.answer.trim();
    return opts.useH3 ? `### ${question}\n\n${answer}` : `${question}\n\n${answer}`;
  });
  return `## ${FAQ_HEADINGS[opts.language]}\n\n${items.join('\n\n')}`;
}

/**
 * Renders the structured FAQ into the article Markdown as a single visible
 * section. Placed at the {{FAQ}} marker when the model wrote it (after Common
 * Mistakes, before the Conclusion), otherwise appended at the end. An empty
 * FAQ (toggle "Non") only strips any stray marker. Never adds a second FAQ
 * when the body already has one.
 */
export function insertFaqSection(content: string, faq: FaqItem[], opts: InsertFaqOptions): string {
  const hasMarker = MARKER_LINE_PATTERN.test(content);
  MARKER_LINE_PATTERN.lastIndex = 0;

  if (faq.length === 0 || EXISTING_FAQ_HEADING_PATTERN.test(content)) {
    return hasMarker ? tidy(content.replace(MARKER_LINE_PATTERN, '')) : content;
  }

  const section = renderFaqSection(faq, opts);

  if (!hasMarker) {
    return `${content.trimEnd()}\n\n${section}\n`;
  }

  // First marker becomes the section, any duplicate marker is dropped.
  let placed = false;
  const replaced = content.replace(MARKER_LINE_PATTERN, () => {
    if (placed) return '';
    placed = true;
    return `${section}\n`;
  });
  return tidy(replaced);
}

function tidy(content: string): string {
  return content.replace(/\n{3,}/g, '\n\n');
}
