import { buildSeoGuidelines } from './seo-guidelines';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

export const OUTLINE_PROMPT_ID = 'wordpress-outline-v2';

interface OutlinePromptContext {
  keyword: string;
  brandProfileContext?: string;
  researchNotes?: string;
  language: SupportedLanguage;
}

export function buildWordPressOutlinePrompt(ctx: OutlinePromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];
  const guidelines = buildSeoGuidelines(ctx.keyword);

  const system = `You are an expert SEO content strategist. You plan long-form WordPress articles optimized for search engines, featured snippets, and AI answer engines — before a single word of the article is written. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.${ctx.brandProfileContext ? ` ${ctx.brandProfileContext}` : ''}`;

  const researchNotesBlock = ctx.researchNotes
    ? `\n\nThe user has provided this prior SEO research — take it into account for the structure and secondary keywords (e.g. secondary keywords to weave into sections/FAQ, a search intent to match, or specific angles to cover). Treat it as informed guidance, not a rigid script — still use your own judgment on structure:\n${ctx.researchNotes}`
    : '';

  const user = `Plan the outline for a WordPress article targeting the keyword: "${ctx.keyword}"${researchNotesBlock}

${guidelines}

The article follows a fixed 10-block structure (H1, Introduction, Quick Answer, Key Takeaways, Main Content, optional Comparison Table, Common Mistakes, FAQ, Conclusion, Soft CTA). At this planning stage, provide:

- title: SEO-optimized H1 title, includes the primary keyword. Aim for around 70 characters — the system will trim anything longer at a word boundary, so write it naturally rather than counting characters defensively.
- metaTitle: a <title>/search-result-facing version of the title, includes the primary keyword. Aim for around 60 characters (70 is trimmed automatically if you go over) — it can be a tighter rephrasing of the title, not just a copy.
- slug: URL-friendly slug (lowercase, hyphens, ASCII only, derived from the title)
- metaDescription: 150-160 characters, includes the primary keyword
- quickAnswerAngle: one sentence describing the direct answer the Quick Answer block will give (the article step will expand this into the final 40-60 word answer)
- keyTakeawaysThemes: 4 to 6 short theme phrases (not full sentences) — one per planned Key Takeaway bullet
- sections: an ordered list of 8 to 10 Main Content H2 sections, each with a one-sentence summary of what it will cover. Do not write the section content yet, only plan it. Each section must be scoped broadly enough to support at least 150-200 words of full body text once written — plan enough sub-points (2-3) per section that it can be developed at that length. This is what makes the final article reach the 1800-2500 word target, not just the section count.
- includeComparisonTable: true only if the topic naturally involves comparing materials, methods, products, or options — false otherwise. Do not force a table onto a topic that doesn't call for one.
- comparisonTableReason: one short sentence justifying the includeComparisonTable decision either way (why a comparison fits, or why the topic has nothing to meaningfully compare)
- commonMistakesThemes: 3 to 5 short theme phrases, one per real, specific mistake people make on this topic — not generic filler
- faqQuestions: 4 to 6 real, distinct questions a reader would actually search for about this topic — not generic "what is X" filler, and not overlapping with each other or with the Main Content sections
- featuredImage: a single hero image for the top of the article — { prompt, altText }
- images: exactly 2 or 3 internal images to place within the body — each with { placementMarker, prompt, altText }, where placementMarker is "IMAGE_1", "IMAGE_2", "IMAGE_3" (in that order, only as many as you include)

Image prompt rules (apply to both featuredImage and images):
- Each prompt is a vivid, hyper-specific scene description for photorealistic AI image generation (3-5 sentences): the main subject, its setting, 3-5 supporting details, specific materials/textures, a 2-3 color palette, and a camera angle.
- Replace vague words like "beautiful" or "stunning" with concrete visual details. Never include text, typography, logos, or watermarks in the scene.
- Image prompts must always be in English regardless of the content language.
- altText must be in ${langName} and describe what is actually visible in that specific image (subject, setting, action) — write it like a natural caption, not a template. Do not reuse the same sentence structure across images (e.g. never repeat a pattern like "X als [keyword] für Y" on every image) — vary the phrasing so each alt text reads as if written independently. The primary keyword must appear naturally in at least one alt text across the set, but not in all of them and not in the same position each time.

Respond with this exact JSON structure:
{
  "title": "...",
  "metaTitle": "...",
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
  "images": [{ "placementMarker": "IMAGE_1", "prompt": "...", "altText": "..." }]
}`;

  return { system, user };
}
