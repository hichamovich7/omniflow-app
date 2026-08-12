import type { ResearchOutput } from '../types';

// Exported for reuse by the WordPress "external source" generator (Option 3,
// lib/wordpress/generate-article-from-url.ts) — pasted text is capped to the
// exact same length Firecrawl itself already enforces on scraped content.
export const CONTENT_CHAR_CAP = 12000;
const SEARCH_RESULT_LIMIT = 3;

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: { title?: string };
  };
}

interface FirecrawlSearchResponse {
  success: boolean;
  data?: {
    web?: { url: string; title: string; description: string }[];
  };
}

function getApiKey(): string {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY is not set');
  }
  return apiKey;
}

export async function scrapeUrl(url: string): Promise<ResearchOutput> {
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, waitFor: 3000 }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Firecrawl scrape HTTP error:', res.status, body);
    if (body.includes('we do not support this site')) {
      throw new Error('Firecrawl does not support this site');
    }
    throw new Error(`Firecrawl error: ${res.status}`);
  }

  const data = (await res.json()) as FirecrawlScrapeResponse;
  const markdown = data.data?.markdown;

  if (!data.success || !markdown) {
    throw new Error('Firecrawl returned no content for that URL');
  }

  return {
    title: data.data?.metadata?.title ?? null,
    content: markdown.slice(0, CONTENT_CHAR_CAP),
    sourceUrl: url,
  };
}

export async function searchWeb(query: string): Promise<ResearchOutput> {
  const res = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit: SEARCH_RESULT_LIMIT }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Firecrawl search HTTP error:', res.status, body);
    throw new Error(`Firecrawl error: ${res.status}`);
  }

  const data = (await res.json()) as FirecrawlSearchResponse;
  const results = data.data?.web ?? [];

  if (!data.success || results.length === 0) {
    throw new Error('Firecrawl returned no search results for that keyword');
  }

  const content = results
    .map((r) => `### ${r.title}\n${r.description}\n${r.url}`)
    .join('\n\n')
    .slice(0, CONTENT_CHAR_CAP);

  return {
    title: query,
    content,
    sourceUrl: null,
  };
}
