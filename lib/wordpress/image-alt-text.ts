import { truncateAtWordBoundary } from '@/lib/utils/text-truncate';

/**
 * Alt text of the images OmniFlow uploads to the WordPress media library
 * (`alt_text` on /wp/v2/media). No AI call and no vision analysis: it is built
 * only from data OmniFlow already has — the article's H1 (in the article's
 * language), the primary keyword, and the internal image's stored alt text
 * (written by the outline step in the article's language). It never claims to
 * describe what the picture shows beyond that subject.
 */

// Accessibility guidance: screen readers handle ~125 characters comfortably.
const ALT_TEXT_MAX_LENGTH = 125;

// Placeholder alt texts that say nothing about the subject, in the four
// supported languages — never sent to WordPress.
const GENERIC_ALT_TEXT =
  /^(featured|generated|ai|hero|header|cover|stock)?\s*(image|img|picture|photo|illustration|bild|foto|imagen|imagem|visuel|visual)?\s*(n[°o.]?\s*)?\d*\s*(generated|générée?|generiert|generada)?$/i;
const GENERIC_PHRASES = [
  'featured image',
  'generated image',
  'ai generated',
  'image générée',
  'image mise en avant',
  'beitragsbild',
  'generiertes bild',
  'imagen destacada',
  'imagen generada',
  'placeholder',
];

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Plain text: Markdown emphasis/links, HTML and control whitespace removed. */
function toPlainText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s:;,.–—-]+$/, '');
}

/** True for empty or placeholder alt texts ("featured image", "image 1", "generated image"...). */
export function isGenericAltText(value: string | null | undefined): boolean {
  const text = toPlainText(value ?? '');
  if (text.length < 3) return true;
  const folded = fold(text);
  if (GENERIC_ALT_TEXT.test(folded)) return true;
  return GENERIC_PHRASES.some((phrase) => folded === fold(phrase) || folded.startsWith(`${fold(phrase)} `));
}

function contains(haystack: string, needle: string): boolean {
  const normalize = (text: string) => fold(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const n = normalize(needle);
  return n.length > 0 && ` ${normalize(haystack)} `.includes(` ${n} `);
}

export interface FeaturedAltTextInput {
  /** The article's H1 — written in the article's language. */
  title: string;
  /** Primary keyword (typed, resolved from the URL, or from the Pins' generation). */
  keyword?: string | null;
}

/**
 * Featured image alt text: the article's subject as a natural caption — its
 * H1, with the primary keyword appended once only when the title does not
 * already contain it (never repeated). Always in the article's language
 * because both come from the article itself; null only when neither exists.
 */
export function buildFeaturedImageAltText({ title, keyword }: FeaturedAltTextInput): string | null {
  const cleanTitle = toPlainText(title);
  const cleanKeyword = toPlainText(keyword ?? '');
  let alt = cleanTitle;
  if (cleanKeyword && !contains(cleanTitle, cleanKeyword)) {
    alt = cleanTitle ? `${cleanTitle} – ${cleanKeyword}` : cleanKeyword;
  }
  if (!alt || isGenericAltText(alt)) return null;
  return truncateAtWordBoundary(alt, ALT_TEXT_MAX_LENGTH);
}

/**
 * Internal image alt text: the image's stored alt text (outline step, article
 * language) when it is a real description, else the featured fallback.
 */
export function resolveInternalImageAltText(storedAltText: string | null | undefined, fallback: FeaturedAltTextInput): string | null {
  const stored = toPlainText(storedAltText ?? '');
  if (stored && !isGenericAltText(stored)) return truncateAtWordBoundary(stored, ALT_TEXT_MAX_LENGTH);
  return buildFeaturedImageAltText(fallback);
}
