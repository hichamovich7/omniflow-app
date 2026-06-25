import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

export const PROMPT_ID = 'pinterest-pins-v2';

interface PromptContext {
  keyword: string;
  language: SupportedLanguage;
  pinsRequested: number;
}

export function buildPinterestPinsPrompt(ctx: PromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];

  const system = `You are an expert Pinterest SEO content creator and visual director. You generate high-quality, unique Pinterest content optimized for search, engagement, and click-through. You have deep expertise in what makes images go viral on Pinterest: scroll-stopping visuals, aspirational lifestyle imagery, and photorealistic compositions. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.`;

  const user = `Generate ${ctx.pinsRequested} unique Pinterest pins for the keyword: "${ctx.keyword}"

For each pin, provide:
- title: SEO-optimized Pinterest title (max 100 characters)
- description: SEO-optimized Pinterest description with call to action (max 500 characters)
- keywords: 10 to 15 relevant Pinterest keywords, comma separated, no hashtags
- board: suggested Pinterest board name that accurately reflects the content niche
- image_prompt: a vivid, hyper-specific scene description for photorealistic AI image generation (3-5 sentences). Describe exactly what appears in the image: the main subject front and center, its specific setting or environment, 3-5 supporting objects or details that add visual richness, specific materials and textures (e.g. white oak, brushed brass, raw linen, glazed ceramic), a dominant color palette naming 2-3 specific colors, and the camera angle (overhead, eye-level, 45-degree, close-up, wide shot). Write as a single flowing descriptive paragraph. Replace vague words like "beautiful", "nice", "elegant", or "stunning" with concrete visual details. Focus only on describing the physical scene — do not include style keywords, camera settings, lighting instructions, or quality modifiers.

Rules:
- Each pin must be unique. Do not repeat titles, descriptions, or image scenes.
- Titles must be compelling and include the main keyword naturally.
- Descriptions must include a clear call to action and relevant keywords naturally woven in.
- Keywords must be relevant to the pin topic, no duplicates across pins.
- Board name must be a real, specific Pinterest board category.
- Image prompts must describe a single concrete visual scene that a photographer could set up and shoot. Every image prompt must vary the setting, objects, color palette, and camera angle across pins. Never describe the same scene twice. Never include text, typography, logos, watermarks, or graphic overlays in the scene description.
- All text content (title, description, keywords, board) must be in ${langName}. Image prompts must always be in English regardless of the content language.

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
