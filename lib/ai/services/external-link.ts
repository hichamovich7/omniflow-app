import { z } from 'zod';
import { generateText } from '@/lib/ai/engine';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

const WEB_SEARCH_MAX_RESULTS = 3;
// Has to be large enough to echo the full article back (see prompt below) —
// sized like ARTICLE_MAX_TOKENS (lib/wordpress/generate-article.ts) plus
// headroom for the wrapping JSON and source fields.
const EXTERNAL_LINK_MAX_TOKENS = 9000;
const URL_VERIFY_TIMEOUT_MS = 8000;

const externalLinkResponseSchema = z.object({
  linkFound: z.boolean(),
  content: z.string().min(1),
  source: z.object({ url: z.string().url(), title: z.string().min(1) }).nullable(),
});

export interface ExternalLinkSource {
  url: string;
  title: string;
}

export interface ExternalLinkResult {
  content: string;
  source: ExternalLinkSource | null;
}

// The model was told to "verify via web search" but nothing stopped it from
// mistyping a real URL or citing a page that has since moved — the model's
// own claim of having verified a source is not proof. This performs the
// actual check server-side: HEAD first (cheap), falling back to GET for
// servers that reject HEAD (405/403 on HEAD is common), before the link is
// ever shown to a reader.
async function isUrlReachable(url: string): Promise<boolean> {
  for (const method of ['HEAD', 'GET'] as const) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_VERIFY_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: controller.signal });
      if (res.ok) return true;
    } catch {
      // fall through to the next method / final `false`
    } finally {
      clearTimeout(timeout);
    }
  }
  return false;
}

// Removes just the one `[anchor](url)` markdown link for a URL that failed
// verification, keeping the anchor text in place — safer than discarding the
// model's whole rewritten article over a single bad link.
function stripMarkdownLink(content: string, url: string): string {
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkPattern = new RegExp(`\\[([^\\]]+)\\]\\(${escapedUrl}\\)`, 'g');
  return content.replace(linkPattern, '$1');
}

/**
 * Best-effort enhancement, never a hard dependency: finds one real, web-search-
 * verified external source for a factual claim already in the article and
 * inserts a single natural Markdown link. On any failure — the configured
 * FAST model rejecting the `openrouter:web_search` plugin, a network error, an
 * invalid response, or the model simply not finding a relevant source — the
 * article is returned unchanged. Callers never need to branch on success/failure.
 */
export async function addExternalLink(
  articleContent: string,
  topic: string,
  language: SupportedLanguage
): Promise<ExternalLinkResult> {
  const langName = LANGUAGE_LABELS[language];

  const system = `You are an expert editorial fact-checker. You are given a finished article and must find ONE real, currently accessible, authoritative external source that supports a factual claim already present in the article, then insert a single natural Markdown link to it. You must respond ONLY with valid JSON.`;

  const user = `Article topic: "${topic}"

Use web search to find one authoritative, real external source (a reputable publication, official documentation, government/industry body, or similarly credible site — never a competitor's direct sales page) relevant to a factual point already stated in the article below. Copy the source URL exactly as returned by your web search results — do not retype, shorten, "clean up", or reconstruct it from memory. Never invent or guess a URL.

Insert the link as Markdown (\`[relevant anchor text](url)\`) naturally into an existing sentence that discusses that fact — the anchor text must be a relevant phrase from that sentence, never "click here" or "this article" or similar generic text. Do not add a new sentence or paragraph just to hold the link. Do not change anything else in the article — same wording, same structure, same {{IMAGE_N}} markers untouched.

If you cannot find a genuinely relevant, real, verifiable source, do not insert any link — return the article completely unchanged and set "linkFound": false, "source": null.

Anchor text must be in ${langName}, matching the article's language.

Respond with this exact JSON structure:
{
  "linkFound": true,
  "content": "...the full article markdown, unchanged except for the one inserted link...",
  "source": { "url": "https://...", "title": "..." }
}

Article:
${articleContent}`;

  try {
    const raw = await generateText({
      role: 'FAST',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: EXTERNAL_LINK_MAX_TOKENS,
      tools: [{ type: 'openrouter:web_search', parameters: { max_results: WEB_SEARCH_MAX_RESULTS } }],
    });

    const parsed = externalLinkResponseSchema.safeParse(JSON.parse(raw));

    if (!parsed.success || !parsed.data.linkFound || !parsed.data.source) {
      return { content: articleContent, source: null };
    }

    const { url, title } = parsed.data.source;
    const reachable = await isUrlReachable(url);

    if (!reachable) {
      console.warn(`[wordpress-external-link] Source URL failed verification (unreachable/404), link stripped: ${url}`);
      return { content: stripMarkdownLink(parsed.data.content, url), source: null };
    }

    // Audit trail, kept separate from the returned content on purpose — the
    // source that got linked into a generated article should be traceable
    // even though it isn't persisted as its own column (see DECISIONS.md).
    console.info(`[wordpress-external-link] Source used: "${title}" (${url})`);

    return { content: parsed.data.content, source: parsed.data.source };
  } catch (err) {
    console.warn(
      '[wordpress-external-link] web search unavailable or model incompatible with openrouter:web_search — delivering article without an external link:',
      err instanceof Error ? err.message : err
    );
    return { content: articleContent, source: null };
  }
}
