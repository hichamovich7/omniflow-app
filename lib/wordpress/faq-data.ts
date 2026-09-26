import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FaqItem } from '@/lib/wordpress/faq-section';

/**
 * Structured FAQ of a WordPress article (TASK-FIX-055) on
 * wordpress_articles.faq (jsonb, migration 039). The items are the ones
 * applyFaqSection() rendered into `content` at generation time — the visible
 * section and this column come from the same validated array.
 */

export const MAX_FAQ_ITEMS = 20;

export const faqItemSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(5000),
});

export const storedFaqSchema = z.array(faqItemSchema).max(MAX_FAQ_ITEMS);

/**
 * Reads a stored faq value. null/undefined (article generated before
 * migration 039, or column not applied yet) stays null so callers can fall
 * back to the content; anything malformed becomes [] — never rendered, never
 * turned into a schema.
 */
export function parseStoredFaq(value: unknown): FaqItem[] | null {
  if (value === null || value === undefined) return null;
  const parsed = storedFaqSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

// Same headings insertFaqSection() writes / recognises (faq-section.ts).
const FAQ_H2_PATTERN =
  /^##[ \t]+(FAQ\b|Frequently Asked Questions|Häufig gestellte Fragen|Preguntas frecuentes|Questions fréquentes|Foire aux questions)/i;

/**
 * Read-only fallback for articles without a stored FAQ: the FAQ section of
 * the Markdown (from its H2 to the next H1/H2), when it is strictly H3
 * questions each followed by an answer. Anything else (no section, plain
 * paragraph questions, a question without answer) → null. Never writes back.
 */
export function extractFaqFromContent(content: string): FaqItem[] | null {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => FAQ_H2_PATTERN.test(line.trim()));
  if (start === -1) return null;

  const items: FaqItem[] = [];
  let current: { question: string; answer: string[] } | null = null;
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (/^#{1,2}\s/.test(trimmed)) break;
    const h3 = /^###\s+(.+)$/.exec(trimmed);
    if (h3) {
      if (current) items.push({ question: current.question, answer: current.answer.join('\n').trim() });
      current = { question: h3[1].trim(), answer: [] };
    } else if (current) {
      current.answer.push(line);
    } else if (trimmed !== '') {
      // Text before the first question: not a Q/A structure we can trust.
      return null;
    }
  }
  if (current) items.push({ question: current.question, answer: current.answer.join('\n').trim() });

  const parsed = storedFaqSchema.min(1).safeParse(items);
  return parsed.success ? parsed.data : null;
}

export type ResolvedFaqSource = 'stored' | 'content' | 'none';

/**
 * The FAQ of an article for schema purposes. includeFaq "Non" → nothing.
 * A stored array (even empty) wins; only a missing column/value falls back
 * to the content.
 */
export function resolveArticleFaq(
  article: { faq?: unknown; content: string },
  includeFaq: boolean | null | undefined
): { items: FaqItem[]; source: ResolvedFaqSource } {
  if (includeFaq === false) return { items: [], source: 'none' };
  const stored = parseStoredFaq(article.faq);
  if (stored !== null) return { items: stored, source: stored.length > 0 ? 'stored' : 'none' };
  const fromContent = extractFaqFromContent(article.content);
  return fromContent ? { items: fromContent, source: 'content' } : { items: [], source: 'none' };
}

/**
 * Best-effort write right after the article insert, same approach as
 * saveQualityReport(): if the column is missing (migration 039 not applied
 * yet) or the write fails, the article is kept as is and only the structured
 * FAQ is lost — logged without content, never thrown.
 */
export async function saveArticleFaq(
  supabase: SupabaseClient,
  articleId: string,
  faq: FaqItem[],
  logTag: string
): Promise<void> {
  const parsed = storedFaqSchema.safeParse(faq);
  if (!parsed.success) {
    console.warn(`[${logTag}] faq not saved: invalid structure (${faq.length} items)`);
    return;
  }
  try {
    const { error } = await supabase.from('wordpress_articles').update({ faq: parsed.data }).eq('id', articleId);
    if (error) console.warn(`[${logTag}] faq not saved:`, error.message);
  } catch (err) {
    console.warn(`[${logTag}] faq not saved:`, err instanceof Error ? err.message : err);
  }
}
