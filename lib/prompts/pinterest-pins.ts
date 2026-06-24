import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

export const PROMPT_ID = 'pinterest-pins-v1';

interface PromptContext {
  keyword: string;
  language: SupportedLanguage;
  pinsRequested: number;
}

export function buildPinterestPinsPrompt(ctx: PromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];

  const system = `You are an expert Pinterest SEO content creator. You generate high-quality, unique Pinterest content optimized for search and engagement. All content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.`;

  const user = `Generate ${ctx.pinsRequested} unique Pinterest pins for the keyword: "${ctx.keyword}"

For each pin, provide:
- title: SEO-optimized Pinterest title (max 100 characters)
- description: SEO-optimized Pinterest description with call to action (max 500 characters)
- keywords: 10 to 15 relevant Pinterest keywords, comma separated, no hashtags
- board: suggested Pinterest board name
- image_prompt: detailed prompt to generate a vertical Pinterest image (2:3 ratio) for this pin

Rules:
- Each pin must be unique. Do not repeat titles or descriptions.
- Titles must be compelling and include the main keyword naturally.
- Descriptions must include a call to action and relevant keywords.
- Keywords must be relevant to the pin topic, no duplicates across pins.
- Board name must be a real Pinterest board category.
- Image prompts must describe a vertical Pinterest-style image with specific colors, composition, and style.
- All content must be in ${langName}.

Respond with this exact JSON structure:
{
  "pins": [
    {
      "title": "...",
      "description": "...",
      "keywords": "keyword1, keyword2, keyword3, ...",
      "board": "...",
      "image_prompt": "..."
    }
  ]
}`;

  return { system, user };
}

export function estimateMaxTokens(pinsRequested: number): number {
  const tokensPerPin = 350;
  const overhead = 100;
  return pinsRequested * tokensPerPin + overhead;
}
