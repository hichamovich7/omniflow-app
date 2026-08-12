import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

export const SOURCE_CONTEXT_SUMMARY_PROMPT_ID = 'source-context-summary-v1';

interface SourceContextSummaryPromptContext {
  title: string | null;
  content: string;
  language: SupportedLanguage;
}

/**
 * TASK-028 Option 3 (external source → article). Distinct from
 * content-analysis.ts (TASK-024) on purpose: that prompt classifies a
 * source's voice (theme/audience/tone/category) to align generated content
 * with it, and carries no anti-reproduction instruction. This prompt instead
 * extracts a research index — topics/angles/key points only — explicitly
 * forbidden from echoing the source's own sentences, structure, or phrasing.
 * See DECISIONS.md 2026-08-12.
 */
export function buildSourceContextSummaryPrompt(ctx: SourceContextSummaryPromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];

  const system = `You are an expert content strategist preparing research context for a writer who will produce a completely new, original article. You are given raw source material (a scraped web page or pasted text) and must extract only the topics, angles, and key points it covers — NEVER reproduce sentences, structure, or phrasing from the source. This summary will inform a completely new article, not rewrite this one. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.`;

  const user = `Analyze the following source material and extract a structured research summary — topics, angles, and key points only, entirely in your own words, never quoting or closely paraphrasing the source.

${ctx.title ? `Source title: ${ctx.title}\n\n` : ''}Source content:
${ctx.content}

Provide, all written in ${langName}:
- theme: the single core subject of this source, as a short phrase in your own words (not a sentence copied from the source)
- topics: 4 to 8 short phrases naming the distinct subtopics this source covers (labels, not full sentences)
- angles: 2 to 6 short phrases describing the specific angles, perspectives, or approaches this source takes on the topic
- keyPoints: 3 to 8 short phrases capturing the factual points or claims made — restated in your own words, never a quoted or lightly-edited sentence from the source

Rules:
- Every phrase must be your own wording, never lifted or lightly reworded from the source text.
- Keep every phrase short — a label or short clause, not a full sentence. This is a research index for a writer, not a rewritten excerpt.
- Do not include any full sentence copied from the source anywhere in your response.

Respond with this exact JSON structure:
{
  "theme": "...",
  "topics": ["...", "..."],
  "angles": ["...", "..."],
  "keyPoints": ["...", "..."]
}`;

  return { system, user };
}
