import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { getNicheVisualConvention, DEFAULT_NICHE_CONVENTION } from '@/lib/ai/niche-visual-conventions';
import { BANNER_TEMPLATES, isIntegratedTextEnabled } from '@/lib/validations/pinterest';
import type { TextOverlayMode } from '@/lib/validations/pinterest';
import type { AiIntegratedSettings } from '@/lib/pinterest/ai-integrated';
import type { PinterestGenerationMode } from '@/types/pinterest';
import { BANNER_TEMPLATE_DESCRIPTIONS } from '@/lib/pinterest/banner-templates';

export const PROMPT_ID = 'pinterest-pins-v10';

interface PromptContext {
  keyword: string;
  language: SupportedLanguage;
  pinsRequested: number;
  niche?: string | null;
  textOverlayMode: TextOverlayMode;
  generationMode?: PinterestGenerationMode;
  aiIntegrated?: AiIntegratedSettings;
  brandProfile?: string;
  analysisContext?: string;
  /** From buildImageAnalysisContext() (TASK-013) — additive to the niche's
   * styleGuidance, never a replacement. Both can be present at once. */
  referenceStyleGuidance?: string;
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

  const referenceStyleInstruction = ctx.referenceStyleGuidance ? ` ${ctx.referenceStyleGuidance}` : '';

  const isAiIntegrated = ctx.generationMode === 'ai-integrated' && Boolean(ctx.aiIntegrated);
  const isLegacyComposite = !ctx.generationMode || ctx.generationMode === 'legacy-composite';

  const overlayFieldInstruction =
    !isLegacyComposite || effectiveTextOverlayMode === 'never'
      ? `- visualFormat: always set this to "photo". Do not include an overlayText field.`
      : effectiveTextOverlayMode === 'always'
        ? `- visualFormat: always set this to "text-overlay".
- overlayText: a short, punchy hook (5-8 words) distinct from the full title — this is the exact text that will be rendered on top of the image.
- image_prompt: describe only the background scene or context the text will appear over. Do not describe the text itself.`
        : `- visualFormat: decide per pin. Use "text-overlay" for pins whose content is inherently list-like, tip-based, or checklist-style (e.g. "5 Ways to...", "Budget Checklist", numbered steps). Use "photo" for pins that describe a single concept, scene, or visual idea.
- overlayText (only when visualFormat is "text-overlay"): a short, punchy hook (5-8 words) distinct from the full title — this is the exact text that will be rendered on top of the image. Omit this field when visualFormat is "photo".
- image_prompt (only when visualFormat is "text-overlay"): describe only the background scene or context the text will appear over, not the text itself. When visualFormat is "photo", image_prompt describes the full visual scene as usual.`;

  // TASK-FIX-024: the shape of both on-image banners (top title hook, bottom
  // CTA) is chosen by the AI from a fixed set of static SVG templates, then
  // clamped server-side against the niche's eligible list (defense in depth,
  // same mechanism as allowTextOverlay above) — see
  // app/api/pinterest/generate/route.ts and lib/ai/niche-visual-conventions.ts.
  const allowedBannerTemplates =
    nicheConvention?.allowedBannerTemplates ?? DEFAULT_NICHE_CONVENTION.allowedBannerTemplates ?? [...BANNER_TEMPLATES];
  const bannerTemplateOptions = allowedBannerTemplates
    .map((t) => `"${t}" (${BANNER_TEMPLATE_DESCRIPTIONS[t]})`)
    .join(', ');

  const bannerTemplateInstruction = !isLegacyComposite
    ? '- Do not include titleBannerTemplate or ctaBannerTemplate. This mode does not use the legacy renderer.'
    : `- ctaBannerTemplate: choose the visual shape for the bottom "save this pin" CTA banner, one of: ${bannerTemplateOptions}. Base the choice on the scene's mood and how long the CTA text is likely to be — never pick "pill" for anything longer than a very short 2-4 word phrase.` +
    (effectiveTextOverlayMode !== 'never'
      ? `\n- Do not include titleBannerTemplate. The server selects the Headline template deterministically from angle and the niche's allowed templates.`
      : '');

  const angleDistributionInstruction = ctx.aiIntegrated?.strategy === 'manual'
    ? `Use the "${ctx.aiIntegrated.manualAngle}" angle for every pin.`
    : ctx.aiIntegrated?.strategy === 'ai-recommends'
      ? 'Choose the strongest grounded angle for each pin. Diversity is desirable, but do not force equal distribution.'
      : ctx.pinsRequested === 5
      ? 'Use each of the five angles exactly once in this batch.'
      : ctx.pinsRequested === 10
        ? 'Use each of the five angles exactly twice. The two pins sharing an angle must use different hook structures, promises, descriptions, and image scenes — not synonym swaps.'
        : 'Balance the five angles across the batch and use every angle once before repeating one whenever the batch size allows it.';

  // An element is omitted when its text mode is "none" or its importance is
  // "none": the key must be absent from integratedText (never "None", "N/A" or
  // an empty string), and the server drops it anyway.
  const omittedKey = (element: 'headline' | 'subtitle' | 'cta') =>
    ctx.aiIntegrated ? !isIntegratedTextEnabled(ctx.aiIntegrated, element) : false;

  const integratedTextInstruction = isAiIntegrated && ctx.aiIntegrated
    ? `- integratedText: final on-image strings in ${langName}. ${
        omittedKey('headline')
          ? 'Omit headline.'
          : ctx.aiIntegrated.headline.mode === 'exact'
            ? `headline must be exactly ${JSON.stringify(ctx.aiIntegrated.headline.text)}.`
            : 'Generate a concise, compelling headline.'
      } ${
        omittedKey('subtitle')
          ? 'Omit subtitle.'
          : ctx.aiIntegrated.subtitle.mode === 'exact'
            ? `subtitle must be exactly ${JSON.stringify(ctx.aiIntegrated.subtitle.text)}.`
            : 'Generate a concise supporting subtitle.'
      } ${
        omittedKey('cta')
          ? 'Omit cta.'
          : ctx.aiIntegrated.cta.mode === 'exact'
            ? `cta must be exactly ${JSON.stringify(ctx.aiIntegrated.cta.text)}.`
            : 'Generate a short action-oriented CTA.'
      }${
        (['headline', 'subtitle', 'cta'] as const).some(omittedKey)
          ? ' An omitted key must be absent from integratedText — never write "None", "N/A", or an empty string for it.'
          : ''
      } The combined visible text must fit within ${ctx.aiIntegrated.maximumTextLines} lines. Exact strings are immutable.`
    : '';

  const integratedTextExample = ctx.aiIntegrated
    ? (['headline', 'subtitle', 'cta'] as const)
        .filter((element) => !omittedKey(element))
        .map((element) => `"${element}": "..."`)
        .join(', ')
    : '';

  const system = `You are an expert Pinterest SEO content creator and visual director. You generate high-quality, unique Pinterest content optimized for search, engagement, and click-through. You have deep expertise in what makes images go viral on Pinterest: scroll-stopping visuals, aspirational lifestyle imagery, and photorealistic compositions. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.${ctx.brandProfile ? ` ${ctx.brandProfile}` : ''}${ctx.analysisContext ? ` ${ctx.analysisContext}` : ''}`;

  const user = `Generate ${ctx.pinsRequested} unique Pinterest pins for the keyword: "${ctx.keyword}"

For each pin, provide:
- angle: exactly one of "curiosity", "problem-solution", "listicle", "discovery", "article-promise"
- title: SEO-optimized Pinterest title (max 100 characters)
- description: SEO-optimized Pinterest description with call to action (max 500 characters)
- keywords: 10 to 15 relevant Pinterest keywords, comma separated, no hashtags
- board: suggested Pinterest board name that accurately reflects the content niche
- image_prompt: a vivid, hyper-specific scene description for photorealistic AI image generation (3-5 sentences, plus a closing style clause). Describe exactly what appears in the image: the main subject front and center, its specific setting or environment, 3-5 supporting objects or details that add visual richness, specific materials and textures (e.g. white oak, brushed brass, raw linen, glazed ceramic), a dominant color palette naming 2-3 specific colors, and the camera angle (${cameraAngles}). Write the scene as a single flowing descriptive paragraph, then end it with 2-4 concrete style keywords appended as the final clause — never at the start, so the main subject stays the focal point of the prompt: one photography genre (e.g. "architectural photography", "editorial interior photography"), one realism level (e.g. "photorealistic"), and one quality modifier (e.g. "highly detailed"). Replace vague words like "beautiful", "nice", "elegant", or "stunning" with concrete visual details — this applies to the style keywords too: no vague style words, only concrete, specific ones. Do not include camera settings or lighting instructions.${compositionInstruction}${styleGuidanceInstruction}${referenceStyleInstruction}
${overlayFieldInstruction}
${bannerTemplateInstruction}
${integratedTextInstruction}

Rules:
- Each pin must be unique. Do not repeat titles, descriptions, or image scenes.
- Every title must follow its structured angle and stay within 100 characters:
  - curiosity: create a specific information gap without revealing the answer (e.g. "The Small-Bathroom Detail Most Makeovers Miss").
  - problem-solution: name a real problem and promise a relevant path forward without fabricating a result (e.g. "Short on Bathroom Storage? Start With These Spaces").
  - listicle: promise multiple useful ideas; use an unnumbered list framing unless the source explicitly confirms an exact count (e.g. "Small Bathroom Storage Ideas Worth Saving").
  - discovery: surface a fresh observation or unexpected direction (e.g. "Small Bathroom Storage Can Look This Calm").
  - article-promise: state the article's grounded value without revealing the full answer (e.g. "A Practical Guide to Small Bathroom Storage").
- ${angleDistributionInstruction}
- Titles must differ in sentence structure and promise, not only by one adjective, number, or synonym. Do not start every title with the main keyword.
- Distribute the main keyword naturally across title, description, and keywords. Preserve its meaning in every pin, but vary its exact placement; the keywords field must include the main keyword or a faithful localized equivalent.
- Never invent a number, quantity, result, discount, availability claim, or content attribute. In particular, do not use "free" or a translated equivalent, and do not claim "beginner", "easy", or translated equivalents, unless the keyword or supplied source/context explicitly confirms that exact fact. An angle is not evidence. If an exact list count is not confirmed, write an unnumbered list-style title.
- The description must give enough information to attract interest, but not enough to satisfy the curiosity created by the title — never state the specific technique, number, or answer that the article reveals. End on an open loop that only clicking through resolves. Keep the natural keyword integration and call to action, but the CTA must point toward discovering something ("see how", "find out which"), never restate the content itself. Stay within 500 characters.
- Keywords must be relevant to the pin topic, no duplicates across pins.
- Board name must be a real, specific Pinterest board category.
- Image prompts must describe a single concrete visual scene that a photographer could set up and shoot. Every image prompt must vary the setting, objects, color palette, and camera angle across pins, choosing only from: ${cameraAngles}. Never describe the same scene twice. Never include text, typography, logos, watermarks, or graphic overlays in the scene description itself — any on-image text is handled separately via overlayText, not by describing it inside image_prompt.
- Any supporting object that customarily carries writing — a notebook, book, journal, magazine, label, tag, sign, chart, graph, or piece of paper — must be described in a state that implies no legible text: closed, blank, turned away from camera, or described as an abstract/textural detail (e.g. "a closed leather notebook", "a stack of blank-spined books", "an unlabeled glass jar", "a sketch with no caption"). Never describe it in a state that implies readable content (e.g. "a notebook with handwritten notes", "an open book with visible text", "a labeled jar", "a chart with numbers"), even without quoting the text itself — describing the object that way is what causes illegible pseudo-text to render on it. This is separate from overlayText and the CTA banner, which remain the only places actual on-image text is ever intentionally rendered.
- All text content (title, description, keywords, board, overlayText) must be in ${langName}. Image prompts must always be in English regardless of the content language.
- Before finalizing, verify that title and description together never fully answer the question or reveal the complete technique — if they do, rewrite the description to remove the giveaway detail while keeping it compelling.

Output format (strict): return exactly one complete, strictly valid JSON object and nothing else. Do not use Markdown or code fences, and do not add explanations, comments, or any text before or after the JSON. Do not use trailing commas. Escape every double quote inside a string value as \\" and never put a raw line break inside a string value. Complete every pin and close every string, array, and object.

Respond with this exact JSON structure:
{
  "pins": [
    {
      "angle": "curiosity",
      "title": "...",
      "description": "...",
      "keywords": "keyword1, keyword2, keyword3, ...",
      "board": "...",
      "image_prompt": "...",
      "visualFormat": "photo",
      "overlayText": "...",
      "ctaBannerTemplate": "clean-band"${isAiIntegrated ? `,\n      "integratedText": { ${integratedTextExample} }` : ''}
    }
  ]
}`;

  return { system, user };
}

// AI Integrated asks for an extra `integratedText` object (headline, subtitle,
// CTA) on every pin. A 7-pin German plan was cut off by the 350-token-per-pin
// budget mid-string (unterminated JSON at ~11k characters), so that mode gets
// headroom for it. This is a ceiling, not a target: unused tokens cost nothing.
const INTEGRATED_TEXT_TOKENS_PER_PIN = 150;

export function estimateMaxTokens(
  pinsRequested: number,
  options: { integratedText?: boolean } = {}
): number {
  const tokensPerPin = 350 + (options.integratedText ? INTEGRATED_TEXT_TOKENS_PER_PIN : 0);
  const overhead = 100;
  return pinsRequested * tokensPerPin + overhead;
}
