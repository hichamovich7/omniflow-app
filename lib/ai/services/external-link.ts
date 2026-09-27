import { z } from 'zod';
import { generateText } from '@/lib/ai/engine';
import type { WebCitation } from '@/lib/ai/services/text';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

const WEB_SEARCH_MAX_RESULTS = 3;
// The model only returns an anchor phrase and a source — never the article
// itself — so the budget only has to cover a short JSON object.
const EXTERNAL_LINK_MAX_TOKENS = 1500;
const URL_VERIFY_TIMEOUT_MS = 8000;
// Only the <title> is read from a verified page — never the whole body.
const TITLE_READ_MAX_BYTES = 64 * 1024;
// Verification requests per source list (candidates, one search) — bounds the
// latency a list of dead URLs can add to a generation.
const MAX_VERIFICATIONS_PER_LIST = 3;
const ANCHOR_MIN_WORDS = 2;
const ANCHOR_MAX_WORDS = 6;
// A browser-like request: many authoritative sites (CDN/WAF-protected) answer
// 403 to a bare `node` fetch, which used to reject perfectly real sources.
const VERIFY_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; OmniFlowLinkCheck/1.0; +https://omniflow.app)',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
};

const externalLinkResponseSchema = z.object({
  linkFound: z.boolean(),
  anchorText: z.string().nullable().optional(),
  source: z.object({ url: z.string().url(), title: z.string().min(1) }).nullable(),
});

export interface ExternalLinkSource {
  url: string;
  title: string;
}

/**
 * Where the outbound link comes from: already in the article (e.g. the user's
 * URL linked by the article step), a real URL given to the pipeline (manual
 * URL, research notes, source URL), or the web search.
 */
export type ExternalLinkOrigin = 'existing' | 'candidate' | 'search';

export interface ExternalLinkResult {
  content: string;
  /** The verified outbound link the article carries — null when none could be verified. */
  source: ExternalLinkSource | null;
  origin: ExternalLinkOrigin | null;
}

export interface ExternalLinkOptions {
  /**
   * Real URLs handed to the pipeline, in priority order: manual External
   * URL(s) first, then URLs of the research notes / the source URL.
   */
  candidateUrls?: (string | null | undefined)[];
  /**
   * Other real URLs the article is allowed to link already (e.g. Pin
   * link_url). An existing link is only kept as the outbound link when its
   * URL is a candidate or one of these — a URL the article model wrote on
   * its own is never trusted, even when it answers 200.
   */
  authorizedUrls?: (string | null | undefined)[];
  /** The project's connected WordPress site — its URLs are internal, never outbound. */
  siteUrl?: string | null;
  /** Primary keyword — only a relevance hint when an anchor has to be chosen. */
  keyword?: string | null;
}

export type OutboundUrlRejection = 'invalid' | 'internal' | 'image' | 'tracking';

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?|heic)$/i;
const TRACKING_PARAM = /^(utm_[a-z]+|gclid|fbclid|msclkid|dclid|yclid|mc_eid|igshid|_hsenc|_hsmi|ref_src)$/i;
// Shorteners, ad/click redirectors and search-result pages hide or proxy the
// real destination — never an acceptable citation.
const BLOCKED_HOSTS = new Set([
  'bit.ly',
  't.co',
  'goo.gl',
  'tinyurl.com',
  'ow.ly',
  'buff.ly',
  'is.gd',
  'rebrand.ly',
  'cutt.ly',
  'lnkd.in',
  'shorturl.at',
  'l.facebook.com',
  'lm.facebook.com',
  'out.reddit.com',
  'doubleclick.net',
  'googleadservices.com',
  'clickbank.net',
]);

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function hostMatches(host: string, blocked: Set<string>): boolean {
  const bare = bareHost(host);
  for (const entry of blocked) if (bare === entry || bare.endsWith(`.${entry}`)) return true;
  return false;
}

/** True when `url` belongs to the connected WordPress site (www-insensitive host). */
export function isInternalUrl(url: string, siteUrl: string | null | undefined): boolean {
  if (!siteUrl) return false;
  try {
    const target = new URL(url.trim());
    const site = new URL(siteUrl.trim());
    return bareHost(target.hostname) === bareHost(site.hostname);
  } catch {
    return false;
  }
}

/**
 * Why a URL can never be the article's outbound link — null when it is
 * acceptable: absolute http(s), not the WordPress site itself, not an image
 * file, not a tracking/redirect/shortener URL. Exported for the offline tests.
 */
export function outboundUrlRejection(url: string, siteUrl?: string | null): OutboundUrlRejection | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return 'invalid';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'invalid';
  if (parsed.username || parsed.password) return 'invalid';
  const host = parsed.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || /^[\d.]+$/.test(host) || host.startsWith('[')) return 'invalid';
  if (isInternalUrl(url, siteUrl)) return 'internal';
  if (IMAGE_EXTENSION.test(parsed.pathname)) return 'image';
  if (hostMatches(host, BLOCKED_HOSTS)) return 'tracking';
  if (/^(www\.)?google\.[a-z.]+$/.test(host) && (parsed.pathname === '/url' || parsed.pathname === '/search')) return 'tracking';
  if ([...parsed.searchParams.keys()].some((key) => TRACKING_PARAM.test(key))) return 'tracking';
  return null;
}

/** http(s) URLs written in free text (research notes), trailing punctuation removed. */
export function extractUrlsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = text.match(/https?:\/\/[^\s<>"'`\])]+/g) ?? [];
  return [...new Set(found.map((url) => url.replace(/[.,;:!?]+$/, '')))];
}

/** Absolute http(s) targets of the Markdown links (never images) already in the article. */
export function findMarkdownLinkUrls(content: string): string[] {
  const withoutImages = content.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  return [...withoutImages.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

async function readTitle(res: Response): Promise<string | null> {
  if (!(res.headers.get('content-type') ?? '').includes('html') || !res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  try {
    while (html.length < TITLE_READ_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/title>/i.test(html)) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match ? decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
  return title || null;
}

interface UrlVerification {
  ok: boolean;
  title: string | null;
}

// The model's own claim of having verified a source is not proof. This
// performs the actual check server-side: a real GET (HEAD as a last resort),
// following redirects, where the final page must still be an external,
// non-image, 2xx page. A redirect onto the site itself or onto an image is
// rejected like the URL itself would be.
async function verifyUrl(url: string, siteUrl: string | null | undefined): Promise<UrlVerification> {
  for (const method of ['GET', 'HEAD'] as const) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_VERIFY_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method, redirect: 'follow', headers: VERIFY_HEADERS, signal: controller.signal });
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        continue;
      }
      const finalUrl = res.url || url;
      const contentType = res.headers.get('content-type') ?? '';
      if (outboundUrlRejection(finalUrl, siteUrl) || contentType.startsWith('image/')) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, title: null };
      }
      return { ok: true, title: method === 'GET' ? await readTitle(res).catch(() => null) : null };
    } catch {
      // fall through to the next method / final failure
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, title: null };
}

// ------------------------------------------------------------ anchor placement

interface Span {
  start: number;
  end: number;
}

/** A line the link may go in: plain prose — never a heading, image, marker line or table row. */
function isProseLine(line: string): boolean {
  const trimmed = line.trim();
  return !(
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('|') ||
    trimmed.startsWith('!') ||
    trimmed.startsWith('<') ||
    /^\{\{[A-Z_0-9]+\}\}$/.test(trimmed)
  );
}

/** Ranges of a line that must never receive a link: existing links, images, inline code, HTML tags. */
function protectedRanges(line: string): Span[] {
  const ranges: Span[] = [];
  for (const m of line.matchAll(/!?\[[^\]]*\]\([^)]*\)|`[^`]*`|<[^>]+>|https?:\/\/\S+/g)) {
    ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return ranges;
}

function overlaps(span: Span, ranges: Span[]): boolean {
  return ranges.some((r) => span.start < r.end && span.end > r.start);
}

/**
 * Walks the prose lines and links the first span `pick` returns. The article
 * is otherwise returned byte-for-byte unchanged; null when nothing was picked.
 */
function linkFirstSpan(content: string, url: string, pick: (line: string, blocked: Span[]) => Span | null): string | null {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isProseLine(line)) continue;
    const span = pick(line, protectedRanges(line));
    if (!span) continue;
    lines[i] = `${line.slice(0, span.start)}[${line.slice(span.start, span.end)}](${url})${line.slice(span.end)}`;
    return lines.join('\n');
  }
  return null;
}

/**
 * Links the first occurrence of `anchorText` found in a plain prose line —
 * never in a heading, an image, an {{IMAGE_N}}/{{FAQ}} marker line, a table
 * row, or inside an existing Markdown link. The article is otherwise
 * returned byte-for-byte unchanged; null when no safe occurrence exists.
 * Exported for the offline tests.
 */
export function insertLinkAtAnchor(content: string, anchorText: string, url: string): string | null {
  const anchor = anchorText.trim();
  if (!anchor) return null;
  return linkFirstSpan(content, url, (line, blocked) => {
    let from = 0;
    while (from <= line.length) {
      const index = line.indexOf(anchor, from);
      if (index === -1) return null;
      const span = { start: index, end: index + anchor.length };
      if (!overlaps(span, blocked)) return span;
      from = span.end;
    }
    return null;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Same as insertLinkAtAnchor, tolerant to what models routinely alter when
 * they copy a phrase: letter case, typographic vs straight apostrophes and
 * quotes, runs of whitespace. The link text is always the article's own
 * characters, never the model's version. Exported for the offline tests.
 */
export function insertLinkAtLooseAnchor(content: string, anchorText: string, url: string): string | null {
  const tokens = anchorText.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const body = tokens
    .map((token) => escapeRegExp(token).replace(/['’‘`´]/g, "['’‘`´]").replace(/["“”«»]/g, '["“”«»]'))
    .join('\\s+');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
  return linkFirstSpan(content, url, (line, blocked) => {
    for (const m of line.matchAll(pattern)) {
      const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
      if (!overlaps(span, blocked)) return span;
    }
    return null;
  });
}

const HINT_STOPWORDS = new Set([
  // en
  'about', 'after', 'also', 'best', 'from', 'guide', 'have', 'here', 'into', 'more', 'most', 'that', 'their', 'there', 'these', 'this', 'what', 'when', 'where', 'which', 'with', 'your', 'html', 'index', 'page', 'www',
  // fr
  'avec', 'cette', 'comment', 'dans', 'elle', 'être', 'leur', 'mais', 'nous', 'pour', 'plus', 'sont', 'tout', 'tous', 'très', 'vous', 'votre', 'guide',
  // de
  'auch', 'dass', 'dein', 'eine', 'einer', 'nicht', 'oder', 'sich', 'sind', 'wenn', 'wird', 'mit', 'für',
  // es
  'como', 'desde', 'este', 'esta', 'para', 'pero', 'sobre', 'todo', 'una', 'guía',
]);

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Significant words of the source (title, URL path) and the topic, accent- and case-folded. */
function hintTokens(hints: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const hint of hints) {
    for (const word of fold(hint).split(/[^\p{L}\p{N}]+/u)) {
      if (word.length >= 4 && !HINT_STOPWORDS.has(word) && !/^\d+$/.test(word)) tokens.add(word);
    }
  }
  return tokens;
}

function urlHints(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname.replace(/[/_.-]+/g, ' ')}`;
  } catch {
    return '';
  }
}

/** A word matches a hint on equality or a shared stem of 5+ letters (plural, gender). */
function matchesHint(word: string, hints: Set<string>): boolean {
  if (hints.has(word)) return true;
  for (const hint of hints) {
    const stem = Math.min(hint.length, word.length) - 1;
    if (stem >= 5 && hint.slice(0, stem) === word.slice(0, stem)) return true;
  }
  return false;
}

/**
 * When the model's anchor is not in the article (or a candidate URL comes
 * without one), picks a natural phrase already present in a prose sentence:
 * the shortest run of 2-6 consecutive words holding the most words shared
 * with the source's title / URL / the topic — never a run crossing
 * punctuation, Markdown, an existing link or a sentence boundary. Null when
 * no sentence shares any significant word with the source (the link would
 * not be relevant there). Exported for the offline tests.
 */
export function insertLinkAtRelevantPhrase(content: string, url: string, hints: string[]): string | null {
  const tokens = hintTokens(hints);
  if (tokens.size === 0) return null;

  let best: { line: number; span: Span; score: number; length: number } | null = null;
  const lines = content.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!isProseLine(line)) continue;
    const blocked = protectedRanges(line);
    // Clauses: word runs never cross punctuation or Markdown emphasis.
    for (const clause of line.matchAll(/[^.!?;:,()[\]*_"“”«»|]+/g)) {
      const offset = clause.index ?? 0;
      const words = [...clause[0].matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)].map((w) => ({
        start: offset + (w.index ?? 0),
        end: offset + (w.index ?? 0) + w[0].length,
        hit: matchesHint(fold(w[0]), tokens),
      }));
      for (let first = 0; first < words.length; first += 1) {
        for (let n = ANCHOR_MIN_WORDS; n <= ANCHOR_MAX_WORDS && first + n <= words.length; n += 1) {
          const window = words.slice(first, first + n);
          const score = window.filter((w) => w.hit).length;
          if (score === 0) continue;
          const span = { start: window[0].start, end: window[n - 1].end };
          if (overlaps(span, blocked)) continue;
          if (!best || score > best.score || (score === best.score && n < best.length)) {
            best = { line: lineIndex, span, score, length: n };
          }
        }
      }
    }
  }

  if (!best) return null;
  const line = lines[best.line];
  lines[best.line] = `${line.slice(0, best.span.start)}[${line.slice(best.span.start, best.span.end)}](${url})${line.slice(best.span.end)}`;
  return lines.join('\n');
}

// --------------------------------------------------------------- web search

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Some models wrap the JSON in a code fence or add a sentence around it
    // when the web plugin is on — keep only the outermost object.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No JSON object in the external-link response');
    return JSON.parse(raw.slice(start, end + 1));
  }
}

function sameUrl(a: string, b: string): boolean {
  const normalize = (url: string) => url.trim().replace(/\/+$/, '').replace(/^http:/, 'https:');
  return normalize(a) === normalize(b);
}

interface SearchAnswer {
  anchorText: string | null;
  source: ExternalLinkSource | null;
  citations: WebCitation[];
}

async function searchSource(
  articleContent: string,
  topic: string,
  language: SupportedLanguage,
  attempt: 'primary' | 'fallback'
): Promise<SearchAnswer> {
  const langName = LANGUAGE_LABELS[language];

  const system = `You are an expert editorial fact-checker. You are given a finished article and must find ONE real, currently accessible, authoritative external source that supports a factual claim already present in the article, and pick the exact phrase of the article that should link to it. You never rewrite the article. You must respond ONLY with valid JSON.`;

  const task =
    attempt === 'primary'
      ? `Use web search to find one authoritative, real external source (a reputable publication, official documentation, government/industry body, or similarly credible site — never a competitor's direct sales page) relevant to a factual point already stated in the article below.`
      : `Use web search to find one authoritative reference page about the article's main subject, "${topic}" — official documentation, a government or standards body, a recognized organization, a university, or a reputable encyclopedia or publication. It does not have to support one precise claim, only to be a genuinely useful further reading on the subject. Never a competitor's direct sales page, a forum, or a social network.`;

  const user = `Article topic: "${topic}"

${task} Copy the source URL exactly as returned by your web search results — do not retype, shorten, "clean up", or reconstruct it from memory. Never invent or guess a URL. Never an image file URL.

Choose the anchor text: a short phrase (2-8 words) copied EXACTLY, character for character, from a prose sentence of the article that discusses that subject — never from a heading, never "click here" or "this article" or similar generic text. Do not return the article, do not rewrite anything: the link is inserted automatically on that exact phrase.

If you cannot find a genuinely relevant, real, verifiable source, set "linkFound": false, "anchorText": null, "source": null.

The anchor text is in ${langName}, the article's language.

Respond with this exact JSON structure:
{
  "linkFound": true,
  "anchorText": "exact phrase from the article",
  "source": { "url": "https://...", "title": "..." }
}

Article:
${articleContent}`;

  let citations: WebCitation[] = [];
  const raw = await generateText({
    role: 'FAST',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: EXTERNAL_LINK_MAX_TOKENS,
    tools: [{ type: 'openrouter:web_search', parameters: { max_results: WEB_SEARCH_MAX_RESULTS } }],
    onFinish: (info) => {
      citations = info.citations;
    },
  });

  const parsed = externalLinkResponseSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success || !parsed.data.linkFound || !parsed.data.source) {
    return { anchorText: null, source: null, citations };
  }
  return { anchorText: parsed.data.anchorText?.trim() || null, source: parsed.data.source, citations };
}

interface LinkAttempt {
  url: string;
  title: string;
  anchorText: string | null;
}

/**
 * Tries each source in order — acceptable URL, real 2xx page, then a natural
 * anchor: the model's phrase (exact, then tolerant), else the most relevant
 * phrase of the article. First success wins.
 */
async function linkFirstVerified(
  content: string,
  attempts: LinkAttempt[],
  siteUrl: string | null | undefined,
  topicHints: string[],
  logTag: string
): Promise<{ content: string; source: ExternalLinkSource } | null> {
  let verifications = 0;
  const alreadyLinked = findMarkdownLinkUrls(content);
  for (const attempt of attempts) {
    if (verifications >= MAX_VERIFICATIONS_PER_LIST) break;
    const rejection = outboundUrlRejection(attempt.url, siteUrl);
    if (rejection) {
      console.warn(`[wordpress-external-link] ${logTag} URL rejected (${rejection}): ${attempt.url}`);
      continue;
    }
    // Never a second link to a URL the article already links.
    if (alreadyLinked.some((url) => sameUrl(url, attempt.url))) continue;

    verifications += 1;
    const verification = await verifyUrl(attempt.url, siteUrl);
    if (!verification.ok) {
      console.warn(`[wordpress-external-link] ${logTag} URL failed verification (unreachable/non-2xx): ${attempt.url}`);
      continue;
    }

    const title = attempt.title || verification.title || '';
    const linked =
      (attempt.anchorText && insertLinkAtAnchor(content, attempt.anchorText, attempt.url)) ||
      (attempt.anchorText && insertLinkAtLooseAnchor(content, attempt.anchorText, attempt.url)) ||
      insertLinkAtRelevantPhrase(content, attempt.url, [title, verification.title ?? '', urlHints(attempt.url), ...topicHints]);
    if (!linked) {
      console.warn(`[wordpress-external-link] ${logTag} no natural anchor for ${attempt.url} in the article, not linked.`);
      continue;
    }
    return { content: linked, source: { url: attempt.url, title: title || attempt.url } };
  }
  return null;
}

/**
 * Makes sure the article carries one verified outbound link whenever possible,
 * never a hard dependency. In priority order:
 * 1. an external link the article already has (verified, kept as-is — never duplicated);
 * 2. a real URL given to the pipeline (manual External URL, research notes, source URL);
 * 3. the web search (model names the anchor and the source, the URL must be a
 *    real search result and a real page), with at most ONE fallback search
 *    when the first gives no reliable source.
 * The model never rewrites or echoes the article: the link is inserted
 * deterministically on a phrase already in it. URLs of the WordPress site,
 * images, trackers and shorteners are never used. On any failure the article
 * is returned unchanged with `source: null` — never an invented URL.
 */
export async function addExternalLink(
  articleContent: string,
  topic: string,
  language: SupportedLanguage,
  options: ExternalLinkOptions = {}
): Promise<ExternalLinkResult> {
  const { siteUrl, keyword } = options;
  const topicHints = [topic, keyword ?? ''];
  const candidates = [...new Set((options.candidateUrls ?? []).map((url) => url?.trim()).filter((url): url is string => !!url))];
  const authorized = [...candidates, ...(options.authorizedUrls ?? []).map((url) => url?.trim()).filter((url): url is string => !!url)];

  // 1. Already linked (e.g. the user's External URL placed by the article step).
  const existing = findMarkdownLinkUrls(articleContent).filter(
    (url) => !outboundUrlRejection(url, siteUrl) && authorized.some((allowed) => allowed === url)
  );
  for (const url of existing.slice(0, 2)) {
    const verification = await verifyUrl(url, siteUrl);
    if (verification.ok) {
      console.info(`[wordpress-external-link] Existing outbound link kept: ${url}`);
      return { content: articleContent, source: { url, title: verification.title ?? url }, origin: 'existing' };
    }
  }

  // 2. Real URLs handed to the pipeline — no search needed.
  if (candidates.length > 0) {
    const linked = await linkFirstVerified(
      articleContent,
      candidates.map((url) => ({ url, title: '', anchorText: null })),
      siteUrl,
      topicHints,
      'candidate'
    );
    if (linked) {
      console.info(`[wordpress-external-link] Source used (provided URL): ${linked.source.url}`);
      return { ...linked, origin: 'candidate' };
    }
  }

  // 3. Web search, then at most one fallback search.
  for (const attempt of ['primary', 'fallback'] as const) {
    try {
      const answer = await searchSource(articleContent, topic, language, attempt);
      const searchUrls = answer.citations.map((c) => c.url);
      const attempts: LinkAttempt[] = [];
      if (answer.source) {
        // When the search reports its results, the model's URL must be one of
        // them, copied exactly — anything else is an invented/retyped URL.
        if (searchUrls.length === 0 || searchUrls.some((url) => url === answer.source!.url)) {
          attempts.push({ url: answer.source.url, title: answer.source.title, anchorText: answer.anchorText });
        } else {
          console.warn(`[wordpress-external-link] ${attempt} search: URL not among the search results, refused: ${answer.source.url}`);
        }
      }
      // The search's own results are real URLs too — tried after the model's pick.
      for (const citation of answer.citations) {
        if (!attempts.some((a) => a.url === citation.url)) attempts.push({ url: citation.url, title: citation.title, anchorText: null });
      }

      const linked = await linkFirstVerified(articleContent, attempts, siteUrl, topicHints, `${attempt} search`);
      if (linked) {
        // Audit trail, kept separate from the returned content on purpose — the
        // source that got linked into a generated article should be traceable
        // even though it isn't persisted as its own column (see DECISIONS.md).
        console.info(`[wordpress-external-link] Source used: "${linked.source.title}" (${linked.source.url})`);
        return { ...linked, origin: 'search' };
      }
    } catch (err) {
      console.warn(
        `[wordpress-external-link] ${attempt} search unavailable or model incompatible with openrouter:web_search:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.warn('[wordpress-external-link] No reliable source found — article delivered without an outbound link.');
  return { content: articleContent, source: null, origin: null };
}
