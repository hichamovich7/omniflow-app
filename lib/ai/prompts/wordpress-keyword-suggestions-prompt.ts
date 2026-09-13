import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

export const KEYWORD_SUGGESTIONS_PROMPT_ID = 'wordpress-keyword-suggestions-v1';

interface KeywordSuggestionsPromptContext {
  keyword: string;
  language: SupportedLanguage;
  targetCountry?: string;
}

/**
 * TASK-FIX-036 (SEO Keywords block, "1-Click Blog Post" / Option 1 only). A
 * plain language-model brainstorm of semantically related keywords/phrases —
 * explicitly NOT framed as a real NLP/SERP tool anywhere in this prompt (no
 * search volume, difficulty, or ranking data exists to draw on). See
 * DECISIONS.md 2026-09-13 (5).
 */
export function buildKeywordSuggestionsPrompt(ctx: KeywordSuggestionsPromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];
  const countryLine = ctx.targetCountry ? `\nTarget market: ${ctx.targetCountry} — prefer terms and phrasing natural to that market.` : '';

  const system = `You are an SEO content strategist brainstorming related keywords for a blog article. You have no access to real search volume, keyword difficulty, or search engine results data — you are suggesting semantically related terms and phrases from your own knowledge, not reporting real search metrics. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.`;

  const user = `Main keyword: "${ctx.keyword}"${countryLine}

Suggest 10 to 15 secondary keywords and short phrases closely related to this main keyword — synonyms, common variations, related subtopics, and terms a reader searching for this topic would also care about. Each entry must be short (a word or a short phrase, not a full sentence), written in ${langName}, and distinct from the main keyword itself and from every other entry.

Respond with this exact JSON structure:
{
  "keywords": ["...", "...", "..."]
}`;

  return { system, user };
}
