import {
  fetchPublishedPostsPage,
  normalizeSiteUrl,
  WordPressApiError,
  type WordPressPostSummary,
  type WordPressSiteCredentials,
} from '@/lib/wordpress/rest-client';
import type { WordPressArticleSize } from '@/types/wordpress';
import { marked } from 'marked';

/**
 * Automatic internal links (TASK-FIX-051). Before a publish, the site's
 * published posts are loaded (summary fields only) and a few relevant ones
 * are linked from the article's body paragraphs. Deterministic — no AI call.
 * Never blocking: any failure leaves the HTML unchanged and reports a
 * warning.
 */

export type InternalLinksStatus = 'inserted' | 'none' | 'skipped' | 'failed';

export interface InternalLink {
  postId: number;
  url: string;
  anchor: string;
}

export interface InternalLinksReport {
  status: InternalLinksStatus;
  insertedCount: number;
  links: InternalLink[];
  warnings: string[];
}

export interface InternalLinkCandidate {
  id: number;
  url: string;
  slug: string;
  title: string;
  excerpt: string;
  categories: number[];
  tags: number[];
}

export interface InternalLinkContext {
  /** Resolved focus keyword (never the Pins title label or a URL placeholder). */
  primaryKeyword: string | null;
  seoKeywords: string[];
  title: string;
  categoryIds: number[];
  tagIds: number[];
  articleSize: WordPressArticleSize | null;
  /** The WP post being updated — never linked to itself. */
  excludePostId: number | null;
  excludeSlug: string | null;
}

export const MAX_LINKS_SHORT_ARTICLE = 3;
export const MAX_LINKS_LONGER_ARTICLE = 5;
/** Word count under which an article without a stored size counts as short. */
export const SHORT_ARTICLE_WORD_LIMIT = 1000;

export const POSTS_PER_PAGE = 100;
export const MAX_POST_PAGES = 5;
const REQUEST_TIMEOUT_MS = 8000;
/** Whole fetch budget — the publish route has a 60s ceiling for uploads + post. */
const TOTAL_FETCH_BUDGET_MS = 15000;

export const INTERNAL_LINKS_FAILED_WARNING =
  'Internal links could not be added: WordPress posts could not be loaded. The post was sent without new internal links.';
export const INTERNAL_LINKS_PARTIAL_WARNING =
  'Some WordPress posts could not be loaded — internal links were chosen from the posts that loaded.';
export const INTERNAL_LINKS_TRUNCATED_WARNING = `Only the ${POSTS_PER_PAGE * MAX_POST_PAGES} most recent WordPress posts were considered for internal links.`;

export function ignoredUrlsWarning(count: number): string {
  return `${count} WordPress post URL${count === 1 ? ' was' : 's were'} ignored for internal links (outside the configured site or invalid).`;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

/** Lowercase, accents removed — comparison key only, never displayed. */
function fold(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

function toWords(value: string): string[] {
  return fold(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function htmlToWords(value: string): string[] {
  return toWords(decodeEntities(stripTags(value)));
}

function containsPhrase(haystack: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > haystack.length) return false;
  return ` ${haystack.join(' ')} `.includes(` ${phrase.join(' ')} `);
}

const STOPWORDS = new Set(
  (
    // en
    'a an and are as at be by for from how in into is it its of on or that the their this to was what when where which why with your you ' +
    // fr
    'au aux avec ce ces cette dans de des du elle en est et il la le les leur mais ou par pour qui que quoi sa se ses son sur un une vos votre comment pourquoi ' +
    // de
    'am an auf aus bei das dem den der des die ein eine einem einen einer es fur im in ist mit so und vom von wie zu zum zur ihr ihre sie ' +
    // es
    'al como con de del el en es la las lo los para por que se su sus un una y o'
  ).split(' ')
);

const BANNED_ANCHORS = new Set(
  [
    'click here',
    'here',
    'read more',
    'learn more',
    'this article',
    'cliquez ici',
    'clique ici',
    'ici',
    'en savoir plus',
    'lire la suite',
    'cet article',
    'hier klicken',
    'klicken sie hier',
    'hier',
    'mehr erfahren',
    'weiterlesen',
    'haz clic aqui',
    'haga clic aqui',
    'aqui',
    'leer mas',
    'este articulo',
  ].map((a) => toWords(a).join(' '))
);

function isUsableAnchor(words: string[]): boolean {
  if (words.length === 0) return false;
  if (BANNED_ANCHORS.has(words.join(' '))) return false;
  if (words.every((w) => STOPWORDS.has(w))) return false;
  if (STOPWORDS.has(words[0]) || STOPWORDS.has(words[words.length - 1])) return false;
  // A single word must be a specific term, not a generic one.
  if (words.length === 1 && words[0].length < 5) return false;
  return true;
}

// ---------------------------------------------------------------------------
// URL policy
// ---------------------------------------------------------------------------

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * The canonical `link` WP returned, kept only when it points into the
 * configured site (same host, www-insensitive, same port, under the site's
 * base path). Returns the normalized href, or null for anything external,
 * relative, malformed or non-http(s). URLs are never built from a slug.
 */
export function toAllowedInternalUrl(link: string, siteUrl: string): string | null {
  let url: URL;
  let base: URL;
  try {
    url = new URL(link.trim());
    base = new URL(normalizeSiteUrl(siteUrl));
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (bareHost(url.hostname) !== bareHost(base.hostname) || url.port !== base.port) return null;
  const basePath = base.pathname.replace(/\/+$/, '');
  if (basePath && url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return null;
  return url.href;
}

function urlKey(href: string): string {
  try {
    const url = new URL(decodeEntities(href));
    return `${bareHost(url.hostname)}${url.port ? `:${url.port}` : ''}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return decodeEntities(href).trim();
  }
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export interface CandidateFetchResult {
  candidates: InternalLinkCandidate[];
  warnings: string[];
}

/**
 * Loads published posts page by page (at most MAX_POST_PAGES), keeping only
 * published, allowed, non-current posts. A failure on the first page throws
 * (the caller reports `failed`); a later page failing keeps what loaded.
 */
export async function fetchInternalLinkCandidates(
  site: WordPressSiteCredentials,
  exclude: { postId: number | null; slug: string | null }
): Promise<CandidateFetchResult> {
  const posts: WordPressPostSummary[] = [];
  const warnings: string[] = [];
  let totalPages = 1;
  const deadline = Date.now() + TOTAL_FETCH_BUDGET_MS;

  for (let page = 1; page <= Math.min(totalPages, MAX_POST_PAGES); page++) {
    const remaining = deadline - Date.now();
    if (page > 1 && remaining <= 0) {
      warnings.push(INTERNAL_LINKS_PARTIAL_WARNING);
      break;
    }
    try {
      const result = await fetchPublishedPostsPage(site, page, POSTS_PER_PAGE, Math.min(REQUEST_TIMEOUT_MS, Math.max(remaining, 1000)));
      posts.push(...result.posts);
      totalPages = result.totalPages;
      if (result.posts.length < POSTS_PER_PAGE) break;
    } catch (err) {
      if (page === 1) throw err;
      warnings.push(INTERNAL_LINKS_PARTIAL_WARNING);
      break;
    }
  }
  if (totalPages > MAX_POST_PAGES) warnings.push(INTERNAL_LINKS_TRUNCATED_WARNING);

  const candidates: InternalLinkCandidate[] = [];
  const seen = new Set<string>();
  let ignored = 0;

  for (const post of posts) {
    if (post.status !== 'publish') continue;
    if (exclude.postId !== null && post.id === exclude.postId) continue;
    if (exclude.slug && post.slug === exclude.slug) continue;
    const url = toAllowedInternalUrl(post.link, site.siteUrl);
    if (!url) {
      ignored++;
      continue;
    }
    const key = urlKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      id: post.id,
      url,
      slug: post.slug,
      title: decodeEntities(stripTags(post.title)).replace(/\s+/g, ' ').trim(),
      excerpt: decodeEntities(stripTags(post.excerpt)).replace(/\s+/g, ' ').trim(),
      categories: post.categories,
      tags: post.tags,
    });
  }
  if (ignored > 0) warnings.push(ignoredUrlsWarning(ignored));

  return { candidates, warnings };
}

// ---------------------------------------------------------------------------
// HTML tokenizer — tags vs text, attribute values with quotes kept intact.
// ---------------------------------------------------------------------------

type Token =
  | { type: 'tag'; raw: string; name: string; closing: boolean; selfClosing: boolean }
  | { type: 'text'; raw: string };

const TOKEN_PATTERN = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/** No link is ever inserted inside these (headings, existing links, code, quotes, media, tables). */
const FORBIDDEN_CONTAINERS = new Set([
  'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'script', 'style', 'figure', 'figcaption',
  'blockquote', 'button', 'table', 'svg', 'picture', 'video', 'audio', 'noscript', 'textarea', 'select', 'label',
]);
const BLOCK_ELEMENTS = new Set(['p', 'li']);

// Same headings insertFaqSection recognises (lib/wordpress/faq-section.ts).
const FAQ_HEADING_PATTERN =
  /^\s*(FAQ\b|Frequently Asked Questions|Häufig gestellte Fragen|Preguntas frecuentes|Questions fréquentes|Foire aux questions)/i;

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of html.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ type: 'text', raw: html.slice(last, index) });
    const raw = match[0];
    if (raw.startsWith('<!')) {
      tokens.push({ type: 'tag', raw, name: '!', closing: false, selfClosing: true });
    } else {
      const name = /^<\/?([A-Za-z][^\s/>]*)/.exec(raw)?.[1].toLowerCase() ?? '';
      tokens.push({
        type: 'tag',
        raw,
        name,
        closing: raw.startsWith('</'),
        selfClosing: raw.endsWith('/>') || VOID_ELEMENTS.has(name),
      });
    }
    last = index + raw.length;
  }
  if (last < html.length) tokens.push({ type: 'text', raw: html.slice(last) });
  return tokens;
}

interface TextSlot {
  /** Index in LinkableDocument.pieces of the text this slot may link. */
  pieceIndex: number;
  /** Enclosing paragraph / list item block ids, innermost last. Empty = not body text. */
  blocks: number[];
  eligible: boolean;
}

/**
 * A document split into pieces (joined back verbatim) where only the pieces
 * named by an eligible slot may receive a link. Shared by HTML and Markdown
 * so both formats go through the exact same selection and placement.
 */
interface LinkableDocument {
  pieces: string[];
  slots: TextSlot[];
  blocksWithLinks: Set<number>;
  existingHrefKeys: Set<string>;
  headings: string[];
  wordCount: number;
}

function analyze(html: string): LinkableDocument {
  const tokens = tokenize(html);
  const stack: { name: string; block: number | null }[] = [];
  const slots: TextSlot[] = [];
  const blocksWithLinks = new Set<number>();
  const existingHrefKeys = new Set<string>();
  const headings: string[] = [];
  let nextBlock = 0;
  let inFaq = false;
  let headingText: string | null = null;
  let headingLevel = 0;
  let wordCount = 0;

  tokens.forEach((token, tokenIndex) => {
    if (token.type === 'text') {
      wordCount += htmlToWords(token.raw).length;
      if (headingText !== null) headingText += token.raw;
      const blocks = stack.filter((e) => e.block !== null).map((e) => e.block as number);
      const forbidden = stack.some((e) => FORBIDDEN_CONTAINERS.has(e.name));
      slots.push({ pieceIndex: tokenIndex, blocks, eligible: blocks.length > 0 && !forbidden && !inFaq });
      return;
    }
    if (token.name === '!') return;

    if (!token.closing) {
      if (token.name === 'a') {
        for (const e of stack) if (e.block !== null) blocksWithLinks.add(e.block);
        const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(token.raw);
        const value = href?.[1] ?? href?.[2] ?? href?.[3];
        if (value) existingHrefKeys.add(urlKey(value));
      }
      if (token.name === 'h2' || token.name === 'h3') {
        headingText = '';
        headingLevel = token.name === 'h2' ? 2 : 3;
        // A new H2 always closes a previous FAQ section.
        if (headingLevel === 2) inFaq = false;
      }
      if (!token.selfClosing) {
        stack.push({ name: token.name, block: BLOCK_ELEMENTS.has(token.name) ? nextBlock++ : null });
      }
      return;
    }

    if ((token.name === 'h2' || token.name === 'h3') && headingText !== null) {
      const text = decodeEntities(stripTags(headingText)).replace(/\s+/g, ' ').trim();
      if (FAQ_HEADING_PATTERN.test(text)) inFaq = true;
      else if (text) headings.push(text);
      headingText = null;
    }
    // Pop up to the matching open element; stray closers are ignored.
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name === token.name) {
        stack.length = i;
        break;
      }
    }
  });

  return { pieces: tokens.map((t) => t.raw), slots, blocksWithLinks, existingHrefKeys, headings, wordCount };
}

// ---------------------------------------------------------------------------
// Markdown analysis — line-based block scan (fences, headings, quotes,
// tables, HTML blocks, lists, paragraphs) + inline protected spans (code,
// images, links, autolinks, bare URLs, inline HTML, escapes). Only plain text
// segments of paragraphs / list items become slots.
// ---------------------------------------------------------------------------

const MD_FENCE = /^ {0,3}(`{3,}|~{3,})/;
const MD_ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/;
const MD_SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const MD_BLOCKQUOTE = /^ {0,3}>/;
const MD_HTML_BLOCK = /^ {0,3}<[A-Za-z!/?]/;
const MD_THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const MD_LIST_ITEM = /^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)(.*)$/;
const MD_INDENTED_CODE = /^(?: {4}|\t)/;
const MD_TABLE_SEPARATOR = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

// Protected inline spans, in priority order. Group names mark link-like
// spans (a paragraph holding one is never linked again).
const MD_INLINE_PROTECTED = new RegExp(
  [
    '(?<code>(`+)[\\s\\S]*?\\2)',
    '(?<image>!\\[[^\\]]*\\](?:\\([^)]*\\)|\\[[^\\]]*\\]))',
    '(?<link>\\[[^\\]]*\\](?:\\((?<href>[^)\\s]*)[^)]*\\)|\\[[^\\]]*\\]))',
    '(?<autolink><(?:https?:|mailto:)[^>\\s]*>)',
    '(?<htmlTag><\\/?[A-Za-z][^>]*>)',
    '(?<bareUrl>(?:https?:\\/\\/|www\\.)[^\\s<>()]+)',
    '(?<escape>\\\\[\\s\\S])',
  ].join('|'),
  'g'
);

function splitLines(markdown: string): string[] {
  return markdown.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function stripEol(line: string): string {
  return line.replace(/\r?\n$/, '');
}

function analyzeMarkdown(markdown: string): LinkableDocument {
  const lines = splitLines(markdown);
  const texts = lines.map(stripEol);
  const isBlank = (i: number) => i >= texts.length || texts[i].trim() === '';

  // Pre-pass: setext headings (single text line + underline) and tables
  // (a separator row with a pipe marks its whole block).
  const setextLevel = new Map<number, number>();
  const tableLines = new Set<number>();
  let fence: string | null = null;
  for (let i = 0; i < texts.length; i++) {
    const fenceMatch = MD_FENCE.exec(texts[i]);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }
    const underline = MD_SETEXT_UNDERLINE.exec(texts[i]);
    if (
      underline &&
      i > 0 &&
      !isBlank(i - 1) &&
      (i === 1 || isBlank(i - 2)) &&
      !MD_ATX_HEADING.test(texts[i - 1]) &&
      !MD_LIST_ITEM.test(texts[i - 1]) &&
      !MD_BLOCKQUOTE.test(texts[i - 1]) &&
      !MD_HTML_BLOCK.test(texts[i - 1])
    ) {
      setextLevel.set(i - 1, underline[1][0] === '=' ? 1 : 2);
      setextLevel.set(i, 0);
    }
    if (texts[i].includes('|') && MD_TABLE_SEPARATOR.test(texts[i])) {
      let start = i;
      while (start > 0 && !isBlank(start - 1)) start--;
      let end = i;
      while (end + 1 < texts.length && !isBlank(end + 1)) end++;
      for (let j = start; j <= end; j++) tableLines.add(j);
    }
  }

  const pieces: string[] = [];
  const slots: TextSlot[] = [];
  const blocksWithLinks = new Set<number>();
  const existingHrefKeys = new Set<string>();
  let nextBlock = 0;
  let block: { id: number; kind: 'text' | 'other' } | null = null;
  let inFaq = false;
  fence = null;

  const pushPlain = (raw: string) => {
    if (raw) pieces.push(raw);
  };

  const pushInline = (content: string, blockId: number, eligible: boolean) => {
    let last = 0;
    for (const match of content.matchAll(MD_INLINE_PROTECTED)) {
      const index = match.index ?? 0;
      if (index > last) {
        slots.push({ pieceIndex: pieces.length, blocks: [blockId], eligible });
        pieces.push(content.slice(last, index));
      }
      const groups = match.groups ?? {};
      const isLink =
        groups.link !== undefined ||
        groups.autolink !== undefined ||
        groups.bareUrl !== undefined ||
        (groups.htmlTag !== undefined && /^<a[\s>]/i.test(groups.htmlTag));
      if (isLink) {
        blocksWithLinks.add(blockId);
        const href =
          groups.href ??
          (groups.autolink ? groups.autolink.slice(1, -1) : undefined) ??
          groups.bareUrl ??
          /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(groups.htmlTag ?? '')?.slice(1).find(Boolean);
        if (href) existingHrefKeys.add(urlKey(href.startsWith('www.') ? `https://${href}` : href));
      }
      pieces.push(match[0]);
      last = index + match[0].length;
    }
    if (last < content.length) {
      slots.push({ pieceIndex: pieces.length, blocks: [blockId], eligible });
      pieces.push(content.slice(last));
    }
  };

  lines.forEach((line, i) => {
    const text = texts[i];
    const eol = line.slice(text.length);

    const fenceMatch = MD_FENCE.exec(text);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      pushPlain(line);
      return;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      block = null;
      pushPlain(line);
      return;
    }
    if (text.trim() === '') {
      block = null;
      pushPlain(line);
      return;
    }

    const atx = MD_ATX_HEADING.exec(text);
    const setext = setextLevel.get(i);
    if (atx || setext !== undefined) {
      block = null;
      pushPlain(line);
      const level = atx ? atx[1].length : setext;
      if (!level) return; // setext underline line
      const headingText = (atx ? atx[2] ?? '' : text).trim();
      // A new H2 always closes a previous FAQ section.
      if (level === 2) inFaq = false;
      if (level === 2 || level === 3) {
        if (FAQ_HEADING_PATTERN.test(headingText)) inFaq = true;
      }
      return;
    }

    if (
      tableLines.has(i) ||
      MD_BLOCKQUOTE.test(text) ||
      MD_THEMATIC_BREAK.test(text) ||
      (MD_HTML_BLOCK.test(text) && block?.kind !== 'text') ||
      (MD_INDENTED_CODE.test(text) && block === null)
    ) {
      if (MD_THEMATIC_BREAK.test(text) && !tableLines.has(i)) block = null;
      else if (block?.kind !== 'other') block = { id: nextBlock++, kind: 'other' };
      pushPlain(line);
      return;
    }

    if (block?.kind === 'other') {
      // Lazy continuation of a quote / HTML / code block.
      pushPlain(line);
      return;
    }

    const listItem = MD_LIST_ITEM.exec(text);
    let content = text;
    if (listItem) {
      block = { id: nextBlock++, kind: 'text' };
      pushPlain(listItem[1]);
      content = listItem[2];
    } else if (block === null) {
      block = { id: nextBlock++, kind: 'text' };
    }
    pushInline(content, block.id, !inFaq);
    pushPlain(eol);
  });

  // Headings and word count exactly as the HTML path sees them, so the
  // scoring and the short/long limit are identical for both formats.
  const rendered = analyze(marked.parse(markdown, { async: false }) as string);
  return {
    pieces,
    slots,
    blocksWithLinks,
    existingHrefKeys,
    headings: rendered.headings,
    wordCount: rendered.wordCount,
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export function maxInternalLinks(articleSize: WordPressArticleSize | null, wordCount: number): number {
  if (articleSize === 'small') return MAX_LINKS_SHORT_ARTICLE;
  if (articleSize === 'medium' || articleSize === 'large') return MAX_LINKS_LONGER_ARTICLE;
  return wordCount < SHORT_ARTICLE_WORD_LIMIT ? MAX_LINKS_SHORT_ARTICLE : MAX_LINKS_LONGER_ARTICLE;
}

const MIN_LEXICAL_SCORE = 2;
const MIN_TOTAL_SCORE = 4;

interface ScoredCandidate {
  candidate: InternalLinkCandidate;
  score: number;
  /** Article keywords found in the candidate — preferred anchors. */
  keywordAnchors: string[][];
}

function significantWords(words: string[]): string[] {
  return words.filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/**
 * Deterministic relevance score:
 *   primary keyword in the candidate title/slug +6, else excerpt +3;
 *   each SEO keyword in title/slug +4, else excerpt +2 (capped at 8);
 *   shared significant words between the article title + H2/H3 and the
 *   candidate title +1 each (capped at 4);
 *   shared category +2; shared tags +2 each (capped at 4).
 * A candidate needs a lexical signal (keywords/words, ≥2) and a total ≥4 —
 * a shared category alone never makes a link.
 */
export function scoreCandidates(
  context: InternalLinkContext,
  headings: string[],
  candidates: InternalLinkCandidate[]
): ScoredCandidate[] {
  const primary = context.primaryKeyword ? toWords(context.primaryKeyword) : [];
  const seoKeywords = context.seoKeywords
    .map(toWords)
    .filter((w) => w.length > 0 && w.join(' ') !== primary.join(' '));
  const topicWords = new Set(significantWords([context.title, ...headings].flatMap(toWords)));

  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const titleWords = [...toWords(candidate.title), '|', ...toWords(candidate.slug.replace(/-/g, ' '))];
    const excerptWords = toWords(candidate.excerpt);
    const keywordAnchors: string[][] = [];
    let lexical = 0;

    if (primary.length > 0) {
      if (containsPhrase(titleWords, primary)) {
        lexical += 6;
        keywordAnchors.push(primary);
      } else if (containsPhrase(excerptWords, primary)) {
        lexical += 3;
        keywordAnchors.push(primary);
      }
    }

    let seoScore = 0;
    for (const keyword of seoKeywords) {
      if (containsPhrase(titleWords, keyword)) {
        seoScore += 4;
        keywordAnchors.push(keyword);
      } else if (containsPhrase(excerptWords, keyword)) {
        seoScore += 2;
        keywordAnchors.push(keyword);
      }
    }
    lexical += Math.min(seoScore, 8);

    const candidateTitleWords = new Set(significantWords(toWords(candidate.title)));
    let shared = 0;
    for (const word of topicWords) if (candidateTitleWords.has(word)) shared++;
    lexical += Math.min(shared, 4);

    let taxonomy = 0;
    if (candidate.categories.some((id) => context.categoryIds.includes(id))) taxonomy += 2;
    taxonomy += Math.min(candidate.tags.filter((id) => context.tagIds.includes(id)).length * 2, 4);

    const score = lexical + taxonomy;
    if (lexical >= MIN_LEXICAL_SCORE && score >= MIN_TOTAL_SCORE) {
      scored.push({ candidate, score, keywordAnchors });
    }
  }

  // Highest score first; newer post (higher id) breaks ties — deterministic.
  return scored.sort((a, b) => b.score - a.score || b.candidate.id - a.candidate.id);
}

/** Candidate anchor phrases, most descriptive first. */
function anchorPhrases(scored: ScoredCandidate): string[][] {
  const phrases: string[][] = [...scored.keywordAnchors];
  const title = toWords(scored.candidate.title);
  for (let size = Math.min(6, title.length); size >= 2; size--) {
    for (let start = 0; start + size <= title.length; start++) phrases.push(title.slice(start, start + size));
  }
  const seen = new Set<string>();
  return phrases
    .filter((p) => {
      const key = p.join(' ');
      if (seen.has(key) || !isUsableAnchor(p)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.length - a.length);
}

// Folded view of a text node with, per folded char, the raw [start, end)
// unit it comes from — an entity (&amp;) is one unit, never split.
function foldWithMap(raw: string): { folded: string; starts: number[]; ends: number[] } {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  const unit = /&(?:#x[0-9a-f]+|#\d+|[a-z]+);|[\s\S]/giu;
  for (const match of raw.matchAll(unit)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const piece = fold(match[0].startsWith('&') && match[0].length > 1 ? decodeEntities(match[0]) : match[0]);
    for (let i = 0; i < piece.length; i++) {
      folded += piece[i];
      starts.push(start);
      ends.push(end);
    }
  }
  return { folded, starts, ends };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findPhrase(raw: string, phrase: string[]): { start: number; end: number } | null {
  const { folded, starts, ends } = foldWithMap(raw);
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${phrase.map(escapeRegExp).join('[\\s\\u00a0-]+')}(?![\\p{L}\\p{N}])`,
    'u'
  );
  const match = pattern.exec(folded);
  if (!match || match[0].length === 0) return null;
  return { start: starts[match.index], end: ends[match.index + match[0].length - 1] };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Markdown link destination: parentheses, spaces and angle brackets encoded
// so `[anchor](url)` can never be broken by the URL.
function escapeMarkdownUrl(value: string): string {
  return value.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20').replace(/</g, '%3C').replace(/>/g, '%3E');
}

export type InternalLinkFormat = 'html' | 'markdown';

const RENDER_LINK: Record<InternalLinkFormat, (url: string, anchorRaw: string) => string> = {
  html: (url, anchorRaw) => `<a href="${escapeAttribute(url)}">${anchorRaw}</a>`,
  markdown: (url, anchorRaw) => `[${anchorRaw}](${escapeMarkdownUrl(url)})`,
};

export interface InsertResult {
  html: string;
  links: InternalLink[];
}

/**
 * Selection + placement shared by both formats: highest score first, at most
 * maxInternalLinks(), one link per block, per post and per URL, most
 * descriptive anchor first, first eligible occurrence in document order.
 */
function placeLinks(
  doc: LinkableDocument,
  context: InternalLinkContext,
  candidates: InternalLinkCandidate[],
  format: InternalLinkFormat
): { content: string | null; links: InternalLink[] } {
  const limit = maxInternalLinks(context.articleSize, doc.wordCount);
  const scored = scoreCandidates(context, doc.headings, candidates);
  if (scored.length === 0) return { content: null, links: [] };

  const usedBlocks = new Set(doc.blocksWithLinks);
  const usedUrls = new Set(doc.existingHrefKeys);
  const usedPosts = new Set<number>();
  const links: InternalLink[] = [];
  const pieces = [...doc.pieces];

  for (const entry of scored) {
    if (links.length >= limit) break;
    const { candidate } = entry;
    const key = urlKey(candidate.url);
    if (usedPosts.has(candidate.id) || usedUrls.has(key)) continue;

    let placed = false;
    for (const phrase of anchorPhrases(entry)) {
      for (const slot of doc.slots) {
        if (!slot.eligible || slot.blocks.some((b) => usedBlocks.has(b))) continue;
        const raw = pieces[slot.pieceIndex];
        const found = findPhrase(raw, phrase);
        if (!found) continue;
        const anchorRaw = raw.slice(found.start, found.end);
        pieces[slot.pieceIndex] =
          `${raw.slice(0, found.start)}${RENDER_LINK[format](candidate.url, anchorRaw)}${raw.slice(found.end)}`;
        for (const b of slot.blocks) usedBlocks.add(b);
        usedUrls.add(key);
        usedPosts.add(candidate.id);
        links.push({ postId: candidate.id, url: candidate.url, anchor: decodeEntities(anchorRaw) });
        placed = true;
        break;
      }
      if (placed) break;
    }
  }

  return { content: links.length > 0 ? pieces.join('') : null, links };
}

/**
 * Inserts at most maxInternalLinks() links into eligible body text: inside a
 * <p>/<li>, never in a heading, existing link, image, code, quote, table or
 * the FAQ section, never in a paragraph that already holds a link, one link
 * per paragraph, one per target post/URL. Only text nodes are touched — tags
 * and attributes are copied byte for byte. No match → HTML returned as is.
 */
export function insertInternalLinks(
  html: string,
  context: InternalLinkContext,
  candidates: InternalLinkCandidate[]
): InsertResult {
  const result = placeLinks(analyze(html), context, candidates, 'html');
  return { html: result.content ?? html, links: result.links };
}

/**
 * Markdown twin of insertInternalLinks(): same selection, limits and anchors,
 * links written as `[anchor](url)` — never HTML. Never inside a heading,
 * fenced/indented code, quote, table, HTML block, image, existing link or
 * the FAQ section. No match → Markdown returned as is.
 */
export function insertInternalLinksInMarkdown(
  markdown: string,
  context: InternalLinkContext,
  candidates: InternalLinkCandidate[]
): { markdown: string; links: InternalLink[] } {
  const result = placeLinks(analyzeMarkdown(markdown), context, candidates, 'markdown');
  return { markdown: result.content ?? markdown, links: result.links };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function skippedInternalLinks(): InternalLinksReport {
  return { status: 'skipped', insertedCount: 0, links: [], warnings: [] };
}

export interface LinkedContent {
  content: string;
  report: InternalLinksReport;
  /** Published, allowed, non-current posts considered — 0 on a new blog or a failure. */
  availablePosts: number;
}

/**
 * Fetch → select → insert, for either format. Never throws: a WordPress
 * failure returns the content unchanged with status `failed` and a warning.
 * Logs step and HTTP status only — never the content, never credentials.
 */
export async function linkContent(
  site: WordPressSiteCredentials,
  content: string,
  context: InternalLinkContext,
  format: InternalLinkFormat,
  logPrefix = '[wordpress publish]'
): Promise<LinkedContent> {
  if (!content.trim()) return { content, report: skippedInternalLinks(), availablePosts: 0 };

  let fetched: CandidateFetchResult;
  try {
    fetched = await fetchInternalLinkCandidates(site, { postId: context.excludePostId, slug: context.excludeSlug });
  } catch (err) {
    const status = err instanceof WordPressApiError ? err.status : undefined;
    console.warn(
      `${logPrefix} step=internal_links_fetch http=${status ?? 'none'} ` +
        `message=${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`
    );
    return {
      content,
      report: { status: 'failed', insertedCount: 0, links: [], warnings: [INTERNAL_LINKS_FAILED_WARNING] },
      availablePosts: 0,
    };
  }

  try {
    const result =
      format === 'html'
        ? (({ html, links }) => ({ content: html, links }))(insertInternalLinks(content, context, fetched.candidates))
        : (({ markdown, links }) => ({ content: markdown, links }))(
            insertInternalLinksInMarkdown(content, context, fetched.candidates)
          );
    return {
      content: result.content,
      report: {
        status: result.links.length > 0 ? 'inserted' : 'none',
        insertedCount: result.links.length,
        links: result.links,
        warnings: fetched.warnings,
      },
      availablePosts: fetched.candidates.length,
    };
  } catch (err) {
    console.warn(
      `${logPrefix} step=internal_links_insert message=${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`
    );
    return {
      content,
      report: { status: 'failed', insertedCount: 0, links: [], warnings: [...fetched.warnings, INTERNAL_LINKS_FAILED_WARNING] },
      availablePosts: fetched.candidates.length,
    };
  }
}

/** HTML publish path (TASK-FIX-051) — see linkContent(). */
export async function addInternalLinks(
  site: WordPressSiteCredentials,
  html: string,
  context: InternalLinkContext
): Promise<{ html: string; report: InternalLinksReport }> {
  const linked = await linkContent(site, html, context, 'html');
  return { html: linked.content, report: linked.report };
}
