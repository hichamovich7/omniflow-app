import type { FaqItem } from '@/lib/wordpress/faq-section';
import { resolveArticleFaq } from '@/lib/wordpress/faq-data';

/**
 * FAQPage JSON-LD sent with a published WordPress post (TASK-FIX-055).
 *
 * Rank Math only outputs a FAQPage schema for its own "FAQ by Rank Math"
 * block (or a FAQ schema added by hand in its editor). OmniFlow sends plain
 * HTML with the FAQ as H2/H3 + paragraphs and writes only title,
 * description and focus keyword through updateMeta (seo/rank-math.ts), so
 * Rank Math produces no FAQPage for these posts — OmniFlow adds exactly one,
 * built server-side from the saved Q/A only, and none at all when the HTML
 * already carries a FAQ block or FAQPage schema.
 */

export interface FaqPageJsonLd {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: {
    '@type': 'Question';
    name: string;
    acceptedAnswer: { '@type': 'Answer'; text: string };
  }[];
}

/** Markdown answer/question → plain text: links keep their anchor, images and HTML dropped. */
export function faqTextToPlain(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildFaqPageJsonLd(faq: FaqItem[]): FaqPageJsonLd | null {
  const mainEntity = faq
    .map((item) => ({ name: faqTextToPlain(item.question), text: faqTextToPlain(item.answer) }))
    .filter((item) => item.name !== '' && item.text !== '')
    .map((item) => ({
      '@type': 'Question' as const,
      name: item.name,
      acceptedAnswer: { '@type': 'Answer' as const, text: item.text },
    }));
  if (mainEntity.length === 0) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity };
}

/**
 * JSON safe inside a <script> element: `<`, `>` and `&` are \u-escaped so no
 * value can close the tag or open a comment, and U+2028/U+2029 are escaped
 * for older JS parsers. Still valid JSON — parses back to the same data.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderFaqJsonLdScript(faq: FaqItem[]): string | null {
  const jsonLd = buildFaqPageJsonLd(faq);
  return jsonLd ? `<script type="application/ld+json">${serializeJsonLd(jsonLd)}</script>` : null;
}

// Rank Math / Yoast FAQ blocks and any FAQPage schema already in the HTML.
const EXISTING_FAQ_SCHEMA_PATTERN =
  /wp:rank-math\/faq-block|rank-math-faq|wp:yoast\/faq-block|schema-faq|"@type"\s*:\s*"FAQPage"|schema\.org\/FAQPage/i;

export function hasExistingFaqSchema(html: string): boolean {
  return EXISTING_FAQ_SCHEMA_PATTERN.test(html);
}

/** Every question and answer is visible in the article (schema must match the page). */
export function faqIsVisibleIn(content: string, faq: FaqItem[]): boolean {
  const visible = faqTextToPlain(content);
  return faq.every(
    (item) => visible.includes(faqTextToPlain(item.question)) && visible.includes(faqTextToPlain(item.answer))
  );
}

export type FaqSchemaDecision =
  | { status: 'add'; script: string }
  | { status: 'skipped'; reason: 'disabled' | 'no_faq' | 'existing_schema' | 'not_visible' };

/**
 * Whether the post gets a FAQPage JSON-LD, and which one. `content` is the
 * stored Markdown, `html` what is about to be sent to WordPress.
 */
export function decideFaqSchema(input: {
  article: { faq?: unknown; content: string };
  includeFaq: boolean | null | undefined;
  html: string;
}): FaqSchemaDecision {
  if (input.includeFaq === false) return { status: 'skipped', reason: 'disabled' };
  const { items } = resolveArticleFaq(input.article, input.includeFaq);
  if (items.length === 0) return { status: 'skipped', reason: 'no_faq' };
  if (hasExistingFaqSchema(input.html)) return { status: 'skipped', reason: 'existing_schema' };
  if (!faqIsVisibleIn(input.article.content, items)) return { status: 'skipped', reason: 'not_visible' };
  const script = renderFaqJsonLdScript(items);
  return script ? { status: 'add', script } : { status: 'skipped', reason: 'no_faq' };
}
