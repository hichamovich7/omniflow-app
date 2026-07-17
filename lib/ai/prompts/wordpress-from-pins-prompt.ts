import { buildSeoGuidelines } from './seo-guidelines';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

export const FROM_PINS_OUTLINE_PROMPT_ID = 'wordpress-from-pins-outline-v1';

export interface PinSummary {
  title: string;
  description: string;
  keywords: string;
}

interface FromPinsPromptContext {
  pins: PinSummary[];
  brandProfileContext?: string;
  researchNotes?: string;
  language: SupportedLanguage;
  imageCount: number;
}

/**
 * Frequency-based seed phrase for buildSeoGuidelines' single "primary keyword"
 * rule (title/slug/meta/H2/alt-text placement). Option 1 gets this for free
 * from the user's typed keyword; here there isn't one, so the most common
 * token across the selected pins' `keywords` fields stands in for it. This is
 * only an SEO-guideline anchor — the actual unified theme/title/angle is the
 * model's own synthesis, not this heuristic.
 */
function deriveThemeKeyword(pins: PinSummary[]): string {
  const counts = new Map<string, number>();
  for (const pin of pins) {
    for (const raw of pin.keywords.split(',')) {
      const token = raw.trim().toLowerCase();
      if (!token) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  let best = pins[0]?.keywords.split(',')[0]?.trim() ?? '';
  let bestCount = 0;
  for (const [token, count] of counts) {
    if (count > bestCount) {
      best = token;
      bestCount = count;
    }
  }
  return best;
}

export function buildWordPressFromPinsPrompt(ctx: FromPinsPromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];
  const themeKeyword = deriveThemeKeyword(ctx.pins);
  const guidelines = buildSeoGuidelines(themeKeyword);

  const system = `You are an expert SEO content strategist. You plan long-form WordPress articles optimized for search engines, featured snippets, and AI answer engines — before a single word of the article is written. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.${ctx.brandProfileContext ? ` ${ctx.brandProfileContext}` : ''}`;

  const pinsList = ctx.pins
    .map((pin, i) => `${i + 1}. Title: "${pin.title}"\n   Description: ${pin.description}\n   Keywords: ${pin.keywords}`)
    .join('\n\n');

  const researchNotesBlock = ctx.researchNotes
    ? `\n\nThe user has provided this prior SEO research — take it into account for the structure and secondary keywords (e.g. secondary keywords to weave into sections/FAQ, a search intent to match, or specific angles to cover). Treat it as informed guidance, not a rigid script — still use your own judgment on structure:\n${ctx.researchNotes}`
    : '';

  const imagesInstruction =
    ctx.imageCount > 0
      ? `- images: exactly ${ctx.imageCount} internal image slot${ctx.imageCount > 1 ? 's' : ''} to place within the body — each with { placementMarker, prompt, altText }, where placementMarker is "IMAGE_1"${ctx.imageCount > 1 ? ', "IMAGE_2"' : ''}${ctx.imageCount > 2 ? ', "IMAGE_3"' : ''} (in that order). Each slot corresponds, in the same order, to one of the pins listed above (slot 1 → pin 1, slot 2 → pin 2, etc.) — its image is an existing pin image that will be reused as-is, not newly generated. Write "prompt" as a short description of that pin's own visual (echoing its title/description) — it is stored for reference only, not used to generate anything. Write "altText" so it accurately describes what that specific pin's image actually shows, in ${langName}.`
      : `- images: an empty array [] — no internal images are available for this article.`;

  const user = `Below are ${ctx.pins.length} Pinterest pins the user selected. Identify the single common theme that unifies them, and plan the outline for ONE cohesive, unified WordPress article on that theme — not a concatenation or summary of the individual pins. Use the pins as source material and inspiration for the angle, sections, and FAQ, but write the outline as if planning original long-form content.

Pins:
${pinsList}
${researchNotesBlock}

${guidelines}

The article follows a fixed 10-block structure (H1, Introduction, Quick Answer, Key Takeaways, Main Content, optional Comparison Table, Common Mistakes, FAQ, Conclusion, Soft CTA). At this planning stage, provide:

- title: SEO-optimized H1 title (max 70 characters) for the unified article, includes the primary keyword
- slug: URL-friendly slug (lowercase, hyphens, ASCII only, derived from the title)
- metaDescription: 150-160 characters, includes the primary keyword
- quickAnswerAngle: one sentence describing the direct answer the Quick Answer block will give (the article step will expand this into the final 40-60 word answer)
- keyTakeawaysThemes: 4 to 6 short theme phrases (not full sentences) — one per planned Key Takeaway bullet
- sections: an ordered list of 8 to 10 Main Content H2 sections, each with a one-sentence summary of what it will cover. Do not write the section content yet, only plan it. Each section must be scoped broadly enough to support at least 150-200 words of full body text once written — plan enough sub-points (2-3) per section that it can be developed at that length. This is what makes the final article reach the 1800-2500 word target, not just the section count.
- includeComparisonTable: true only if the topic naturally involves comparing materials, methods, products, or options — false otherwise. Do not force a table onto a topic that doesn't call for one.
- comparisonTableReason: one short sentence justifying the includeComparisonTable decision either way (why a comparison fits, or why the topic has nothing to meaningfully compare)
- commonMistakesThemes: 3 to 5 short theme phrases, one per real, specific mistake people make on this topic — not generic filler
- faqQuestions: 4 to 6 real, distinct questions a reader would actually search for about this topic — not generic "what is X" filler, and not overlapping with each other or with the Main Content sections
- featuredImage: a single hero image for the top of the article — { prompt, altText }. This image is newly generated (not one of the pin images), so its prompt must depict the unified theme of the whole article, not any single pin.
${imagesInstruction}

Image prompt rules (apply to featuredImage${ctx.imageCount > 0 ? ' and the "prompt" field of each images entry' : ''}):
- featuredImage.prompt is a vivid, hyper-specific scene description for photorealistic AI image generation (3-5 sentences): the main subject, its setting, 3-5 supporting details, specific materials/textures, a 2-3 color palette, and a camera angle. Replace vague words like "beautiful" or "stunning" with concrete visual details. Never include text, typography, logos, or watermarks in the scene. Always in English regardless of the content language.
- altText (featuredImage and each images entry) must be in ${langName} and describe what is actually visible in that specific image (subject, setting, action) — write it like a natural caption, not a template. Do not reuse the same sentence structure across images. The primary keyword must appear naturally in at least one alt text across the set, but not in all of them and not in the same position each time.

Respond with this exact JSON structure:
{
  "title": "...",
  "slug": "...",
  "metaDescription": "...",
  "quickAnswerAngle": "...",
  "keyTakeawaysThemes": ["...", "..."],
  "sections": [{ "heading": "...", "summary": "..." }],
  "includeComparisonTable": true,
  "comparisonTableReason": "...",
  "commonMistakesThemes": ["...", "..."],
  "faqQuestions": ["...", "..."],
  "featuredImage": { "prompt": "...", "altText": "..." },
  "images": ${ctx.imageCount > 0 ? '[{ "placementMarker": "IMAGE_1", "prompt": "...", "altText": "..." }]' : '[]'}
}`;

  return { system, user };
}
