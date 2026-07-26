import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

export const PROMPT_ID = 'pinterest-pins-v3';

interface PromptContext {
  keyword: string;
  language: SupportedLanguage;
  pinsRequested: number;
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
 * Deterministic heuristic, not a universal rule: home decor keywords that
 * name a room AND a design-intent word ("Küchen Inspiration") call for a
 * full-room shot, never a tight close-up on an isolated object. Keywords
 * without both signals (a specific object, a recipe, a product) keep the
 * full range of camera angles, close-up included.
 */
export function classifyPinComposition(keyword: string): PinCompositionMode {
  const normalized = keyword.toLowerCase();
  const hasRoomWord = ROOM_WORDS.some((word) => normalized.includes(word));
  const hasDesignIntent = DESIGN_INTENT_WORDS.some((word) => normalized.includes(word));
  return hasRoomWord && hasDesignIntent ? 'space' : 'object';
}

export function buildPinterestPinsPrompt(ctx: PromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];
  const compositionMode = classifyPinComposition(ctx.keyword);

  const cameraAngles =
    compositionMode === 'space'
      ? 'overhead, eye-level, 45-degree, wide shot'
      : 'overhead, eye-level, 45-degree, close-up, wide shot';

  const compositionInstruction =
    compositionMode === 'space'
      ? ` This keyword calls for a full-room view: every image_prompt must show the entire space as one coherent, real environment — walls, floor, visible furniture or layout, and ceiling in context. Never isolate a single object, surface, or detail in a tight close-up shot. Any specific material, color, or decor accent referenced in the pin's title or description must appear as a visible detail *within* that full room, never as the sole subject of the frame.`
      : '';

  const system = `You are an expert Pinterest SEO content creator and visual director. You generate high-quality, unique Pinterest content optimized for search, engagement, and click-through. You have deep expertise in what makes images go viral on Pinterest: scroll-stopping visuals, aspirational lifestyle imagery, and photorealistic compositions. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.${ctx.brandProfile ? ` ${ctx.brandProfile}` : ''}${ctx.analysisContext ? ` ${ctx.analysisContext}` : ''}`;

  const user = `Generate ${ctx.pinsRequested} unique Pinterest pins for the keyword: "${ctx.keyword}"

For each pin, provide:
- title: SEO-optimized Pinterest title (max 100 characters)
- description: SEO-optimized Pinterest description with call to action (max 500 characters)
- keywords: 10 to 15 relevant Pinterest keywords, comma separated, no hashtags
- board: suggested Pinterest board name that accurately reflects the content niche
- image_prompt: a vivid, hyper-specific scene description for photorealistic AI image generation (3-5 sentences). Describe exactly what appears in the image: the main subject front and center, its specific setting or environment, 3-5 supporting objects or details that add visual richness, specific materials and textures (e.g. white oak, brushed brass, raw linen, glazed ceramic), a dominant color palette naming 2-3 specific colors, and the camera angle (${cameraAngles}). Write as a single flowing descriptive paragraph. Replace vague words like "beautiful", "nice", "elegant", or "stunning" with concrete visual details. Focus only on describing the physical scene — do not include style keywords, camera settings, lighting instructions, or quality modifiers.${compositionInstruction}

Rules:
- Each pin must be unique. Do not repeat titles, descriptions, or image scenes.
- Titles must be compelling and include the main keyword naturally.
- Descriptions must include a clear call to action and relevant keywords naturally woven in.
- Keywords must be relevant to the pin topic, no duplicates across pins.
- Board name must be a real, specific Pinterest board category.
- Image prompts must describe a single concrete visual scene that a photographer could set up and shoot. Every image prompt must vary the setting, objects, color palette, and camera angle across pins, choosing only from: ${cameraAngles}. Never describe the same scene twice. Never include text, typography, logos, watermarks, or graphic overlays in the scene description.
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
