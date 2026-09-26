import { z } from 'zod';
import { generateText } from '@/lib/ai/engine';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

const WEB_SEARCH_MAX_RESULTS = 3;
// The model only returns an anchor phrase and a source — never the article
// itself — so the budget only has to cover a short JSON object.
const EXTERNAL_LINK_MAX_TOKENS = 1500;
const URL_VERIFY_TIMEOUT_MS = 8000;

const externalLinkResponseSchema = z.object({
  linkFound: z.boolean(),
  anchorText: z.string().nullable().optional(),
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

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed.startsWith('!') || /^\{\{[A-Z_0-9]+\}\}$/.test(trimmed)) {
      continue;
    }

    let from = 0;
    while (from <= line.length) {
      const index = line.indexOf(anchor, from);
      if (index === -1) break;
      // Skip occurrences that already sit inside [text](url) link syntax.
      const before = line.slice(0, index);
      const insideLinkText = before.lastIndexOf('[') > before.lastIndexOf(']');
      const insideLinkUrl = before.lastIndexOf('](') > before.lastIndexOf(')');
      if (!insideLinkText && !insideLinkUrl) {
        lines[i] = `${before}[${anchor}](${url})${line.slice(index + anchor.length)}`;
        return lines.join('\n');
      }
      from = index + anchor.length;
    }
  }
  return null;
}

/**
 * Best-effort enhancement, never a hard dependency: finds one real, web-search-
 * verified external source for a factual claim already in the article and
 * links an anchor phrase that already exists in it. The model never rewrites
 * or echoes the article — it only names the anchor and the source, and the
 * link is inserted deterministically by insertLinkAtAnchor(). On any failure — the configured
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

  const system = `You are an expert editorial fact-checker. You are given a finished article and must find ONE real, currently accessible, authoritative external source that supports a factual claim already present in the article, and pick the exact phrase of the article that should link to it. You never rewrite the article. You must respond ONLY with valid JSON.`;

  const user = `Article topic: "${topic}"

Use web search to find one authoritative, real external source (a reputable publication, official documentation, government/industry body, or similarly credible site — never a competitor's direct sales page) relevant to a factual point already stated in the article below. Copy the source URL exactly as returned by your web search results — do not retype, shorten, "clean up", or reconstruct it from memory. Never invent or guess a URL.

Choose the anchor text: a short phrase (2-8 words) copied EXACTLY, character for character, from a prose sentence of the article that discusses that fact — never from a heading, never "click here" or "this article" or similar generic text. Do not return the article, do not rewrite anything: the link is inserted automatically on that exact phrase.

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

    if (!parsed.success || !parsed.data.linkFound || !parsed.data.source || !parsed.data.anchorText) {
      return { content: articleContent, source: null };
    }

    const { url, title } = parsed.data.source;
    const reachable = await isUrlReachable(url);

    if (!reachable) {
      console.warn(`[wordpress-external-link] Source URL failed verification (unreachable/404), no link added: ${url}`);
      return { content: articleContent, source: null };
    }

    const linked = insertLinkAtAnchor(articleContent, parsed.data.anchorText, url);
    if (!linked) {
      console.warn('[wordpress-external-link] Anchor text not found verbatim in the article, no link added.');
      return { content: articleContent, source: null };
    }

    // Audit trail, kept separate from the returned content on purpose — the
    // source that got linked into a generated article should be traceable
    // even though it isn't persisted as its own column (see DECISIONS.md).
    console.info(`[wordpress-external-link] Source used: "${title}" (${url})`);

    return { content: linked, source: parsed.data.source };
  } catch (err) {
    console.warn(
      '[wordpress-external-link] web search unavailable or model incompatible with openrouter:web_search — delivering article without an external link:',
      err instanceof Error ? err.message : err
    );
    return { content: articleContent, source: null };
  }
}
