export const PROMPT_ID = 'content-analysis-v1';

interface PromptContext {
  title: string | null;
  content: string;
}

export function buildContentAnalysisPrompt(ctx: PromptContext) {
  const system = `You are an expert content strategist. You analyze raw research content (scraped web pages, search results, or article text) and extract a structured summary that content generators can use as context. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.`;

  const user = `Analyze the following content and extract a structured summary.

${ctx.title ? `Title: ${ctx.title}\n\n` : ''}Content:
${ctx.content}

Provide:
- theme: the single core topic or theme of this content, in a short phrase
- keywords: 8 to 15 relevant keywords for this content, comma separated, no hashtags
- audience: the target audience this content speaks to (e.g. demographics, interests, intent)
- tone: the tone/voice of the content (e.g. friendly, professional, inspirational, technical)
- category: the single best-fitting content category or niche
- summary: a concise 2-3 sentence structured summary of what this content covers

Respond with this exact JSON structure:
{
  "theme": "...",
  "keywords": "keyword1, keyword2, keyword3, ...",
  "audience": "...",
  "tone": "...",
  "category": "...",
  "summary": "..."
}`;

  return { system, user };
}
