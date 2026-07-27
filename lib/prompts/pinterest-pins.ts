import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { getNicheVisualConvention } from '@/lib/ai/niche-visual-conventions';
import type { TextOverlayMode } from '@/lib/validations/pinterest';

export const PROMPT_ID = 'pinterest-pins-v5';

interface PromptContext {
  keyword: string;
  language: SupportedLanguage;
  pinsRequested: number;
  niche?: string | null;
  textOverlayMode: TextOverlayMode;
  brandProfile?: string;
  analysisContext?: string;
}

// Room/space nouns across the 4 supported content languages (en, de, es, fr).
// Deliberately simple substring matching, not NLP — see classifyPinComposition.
const ROOM_WORDS = [
  // en
  'kitchen', 'living room', 'bedroom', 'bathroom', 'dining room', 'office',
  'nursery', 'garden', 'patio', 'balcony', 'entryway', 'hallway', 'closet',
  'basement', 'attic', 'apartment', 'studio',
  // de
  'küche', 'kueche', 'wohnzimmer', 'schlafzimmer', 'badezimmer', 'esszimmer',
  'büro', 'buero', 'kinderzimmer', 'garten', 'terrasse', 'balkon', 'flur',
  'diele', 'keller', 'dachboden', 'wohnung',
  // es
  'cocina', 'salón', 'salon', 'sala de estar', 'dormitorio', 'habitación',
  'habitacion', 'baño', 'bano', 'comedor', 'oficina', 'jardín', 'jardin',
  'terraza', 'balcón', 'balcon', 'pasillo', 'entrada', 'sótano', 'sotano',
  'ático', 'atico',
  // fr
  'cuisine', 'salon', 'chambre', 'salle de bain', 'salle à manger',
  'salle a manger', 'bureau', 'jardin', 'terrasse', 'balcon', 'entrée',
  'entree', 'couloir', 'cave', 'grenier', 'appartement',
];

// "Whole space" design-intent words across the same 4 languages.
const DESIGN_INTENT_WORDS = [
  // en
  'inspiration', 'ideas', 'design', 'style', 'decor', 'makeover', 'renovation',
  // de
  'inspiration', 'ideen', 'design', 'stil', 'deko', 'einrichtung',
  // es
  'inspiración', 'inspiracion', 'ideas', 'diseño', 'diseno', 'estilo', 'decoración', 'decoracion',
  // fr
  'inspiration', 'idées', 'idees', 'design', 'style', 'déco', 'deco', 'décoration', 'decoration',
];

export type PinCompositionMode = 'space' | 'object';

/**
 * Legacy fallback only — kept for niches that don't have an entry in
 * lib/ai/niche-visual-conventions.ts (including Home Decor projects created
 * before projects.niche existed, or with it left blank). Whenever a niche
 * convention is available, it always takes priority over this heuristic.
 * Deterministic, not a universal rule: home decor keywords that name a room
 * AND a design-intent word ("Küchen Inspiration") call for a full-room shot,
 * never a tight close-up on an isolated object.
 */
export function classifyPinComposition(keyword: string): PinCompositionMode {
  const normalized = keyword.toLowerCase();
  const hasRoomWord = ROOM_WORDS.some((word) => normalized.includes(word));
  const hasDesignIntent = DESIGN_INTENT_WORDS.some((word) => normalized.includes(word));
  return hasRoomWord && hasDesignIntent ? 'space' : 'object';
}

export function buildPinterestPinsPrompt(ctx: PromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];
  const nicheConvention = getNicheVisualConvention(ctx.niche);
  const framingMode = nicheConvention?.framingMode ?? classifyPinComposition(ctx.keyword);
  const allowTextOverlay = nicheConvention?.allowTextOverlay ?? false;
  const styleGuidance = nicheConvention?.styleGuidance ?? '';
  // Defense in depth: even if the caller passes 'always'/'auto', a niche that
  // doesn't allow text overlay never gets one. The UI already hides the
  // selector in this case (components/pinterest/pin-form.tsx).
  const effectiveTextOverlayMode: TextOverlayMode = allowTextOverlay ? ctx.textOverlayMode : 'never';

  const cameraAngles =
    framingMode === 'space'
      ? 'overhead, eye-level, 45-degree, wide shot'
      : 'overhead, eye-level, 45-degree, close-up, wide shot';

  const compositionInstruction =
    framingMode === 'space'
      ? ` This subject calls for a full-scene view: every image_prompt must show the entire space or environment as one coherent, real whole — never isolate a single object, surface, or detail in a tight close-up shot. The prompt's opening clause must always name the whole space/environment as its grammatical subject (e.g. "A modern kitchen featuring..." or "A coastal cliffside village at golden hour with..."), never a specific object, material, or narrow detail. Any specific element referenced in the pin's title or description must appear as a detail listed *after* that opening clause, describing the scene — never as the grammatical subject of the first clause or the sole subject of the frame.`
      : '';

  const styleGuidanceInstruction = styleGuidance
    ? ` Follow this niche-specific art direction: ${styleGuidance}`
    : '';

  const overlayFieldInstruction =
    effectiveTextOverlayMode === 'never'
      ? `- visualFormat: always set this to "photo". Do not include an overlayText field.`
      : effectiveTextOverlayMode === 'always'
        ? `- visualFormat: always set this to "text-overlay".
- overlayText: a short, punchy hook (5-8 words) distinct from the full title — this is the exact text that will be rendered on top of the image.
- image_prompt: describe only the background scene or context the text will appear over. Do not describe the text itself.`
        : `- visualFormat: decide per pin. Use "text-overlay" for pins whose content is inherently list-like, tip-based, or checklist-style (e.g. "5 Ways to...", "Budget Checklist", numbered steps). Use "photo" for pins that describe a single concept, scene, or visual idea.
- overlayText (only when visualFormat is "text-overlay"): a short, punchy hook (5-8 words) distinct from the full title — this is the exact text that will be rendered on top of the image. Omit this field when visualFormat is "photo".
- image_prompt (only when visualFormat is "text-overlay"): describe only the background scene or context the text will appear over, not the text itself. When visualFormat is "photo", image_prompt describes the full visual scene as usual.`;

  const system = `You are an expert Pinterest SEO content creator and visual director. You generate high-quality, unique Pinterest content optimized for search, engagement, and click-through. You have deep expertise in what makes images go viral on Pinterest: scroll-stopping visuals, aspirational lifestyle imagery, and photorealistic compositions. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.${ctx.brandProfile ? ` ${ctx.brandProfile}` : ''}${ctx.analysisContext ? ` ${ctx.analysisContext}` : ''}`;

  const user = `Generate ${ctx.pinsRequested} unique Pinterest pins for the keyword: "${ctx.keyword}"

For each pin, provide:
- title: SEO-optimized Pinterest title (max 100 characters)
- description: SEO-optimized Pinterest description with call to action (max 500 characters)
- keywords: 10 to 15 relevant Pinterest keywords, comma separated, no hashtags
- board: suggested Pinterest board name that accurately reflects the content niche
- image_prompt: a vivid, hyper-specific scene description for photorealistic AI image generation (3-5 sentences, plus a closing style clause). Describe exactly what appears in the image: the main subject front and center, its specific setting or environment, 3-5 supporting objects or details that add visual richness, specific materials and textures (e.g. white oak, brushed brass, raw linen, glazed ceramic), a dominant color palette naming 2-3 specific colors, and the camera angle (${cameraAngles}). Write the scene as a single flowing descriptive paragraph, then end it with 2-4 concrete style keywords appended as the final clause — never at the start, so the main subject stays the focal point of the prompt: one photography genre (e.g. "architectural photography", "editorial interior photography"), one realism level (e.g. "photorealistic"), and one quality modifier (e.g. "highly detailed"). Replace vague words like "beautiful", "nice", "elegant", or "stunning" with concrete visual details — this applies to the style keywords too: no vague style words, only concrete, specific ones. Do not include camera settings or lighting instructions.${compositionInstruction}${styleGuidanceInstruction}
${overlayFieldInstruction}

Rules:
- Each pin must be unique. Do not repeat titles, descriptions, or image scenes.
- Titles must be compelling and include the main keyword naturally.
- Descriptions must include a clear call to action and relevant keywords naturally woven in.
- Keywords must be relevant to the pin topic, no duplicates across pins.
- Board name must be a real, specific Pinterest board category.
- Image prompts must describe a single concrete visual scene that a photographer could set up and shoot. Every image prompt must vary the setting, objects, color palette, and camera angle across pins, choosing only from: ${cameraAngles}. Never describe the same scene twice. Never include text, typography, logos, watermarks, or graphic overlays in the scene description itself — any on-image text is handled separately via overlayText, not by describing it inside image_prompt.
- All text content (title, description, keywords, board, overlayText) must be in ${langName}. Image prompts must always be in English regardless of the content language.

Respond with this exact JSON structure:
{
  "pins": [
    {
      "title": "...",
      "description": "...",
      "keywords": "keyword1, keyword2, keyword3, ...",
      "board": "...",
      "image_prompt": "...",
      "visualFormat": "photo",
      "overlayText": "..."
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
