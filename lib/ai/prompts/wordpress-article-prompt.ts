import { buildSeoGuidelines } from './seo-guidelines';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import {
  DEFAULT_WORDS_RANGE,
  type WordPressOutline,
  type TONES_OF_VOICE,
  type POINTS_OF_VIEW,
} from '@/lib/validations/wordpress';

export const ARTICLE_PROMPT_ID = 'wordpress-article-v2';

type ToneOfVoice = (typeof TONES_OF_VOICE)[number];
type PointOfView = (typeof POINTS_OF_VIEW)[number];

const TONE_OF_VOICE_GUIDANCE: Record<ToneOfVoice, string> = {
  friendly: 'warm and approachable, like a knowledgeable friend giving advice',
  professional: 'polished, precise, and business-appropriate',
  informational: 'neutral and fact-forward, prioritizing clarity over personality',
  transactional: 'direct and action-oriented, focused on helping the reader decide or act now',
  inspirational: 'uplifting and motivating, encouraging the reader toward a positive outcome',
  neutral: 'plain and even-toned, without strong personality or emotional coloring',
  witty: 'clever and light, with occasional playful phrasing — never at the expense of clarity',
  casual: 'relaxed and conversational, like talking to a peer',
};

const POINT_OF_VIEW_GUIDANCE: Record<PointOfView, string> = {
  'first-singular': 'first person singular ("I", "my") throughout the body',
  'first-plural': 'first person plural ("we", "our") throughout the body',
  second: 'second person ("you", "your") throughout the body, speaking directly to the reader',
  third: 'third person (no "I"/"we"/"you") throughout the body, describing things objectively',
};

interface ArticlePromptContext {
  outline: WordPressOutline;
  language: SupportedLanguage;
  // Core Settings (TASK-FIX-034, "1-Click Blog Post" / Option 1 only) — all
  // optional. Leaving every one of them undefined reproduces the exact prompt
  // text this function produced before TASK-FIX-034 (word target included).
  minWords?: number;
  maxWords?: number;
  toneOfVoice?: ToneOfVoice;
  pointOfView?: PointOfView;
  targetCountry?: string;
}

export function buildWordPressArticlePrompt(ctx: ArticlePromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];
  const { outline } = ctx;
  const guidelines = buildSeoGuidelines(outline.title);
  const minWords = ctx.minWords ?? DEFAULT_WORDS_RANGE.minWords;
  const maxWords = ctx.maxWords ?? DEFAULT_WORDS_RANGE.maxWords;

  const voiceNotes: string[] = [];
  if (ctx.toneOfVoice) voiceNotes.push(`Tone of voice: write the entire article body in a ${TONE_OF_VOICE_GUIDANCE[ctx.toneOfVoice]} tone. This is a sentence-level voice instruction, distinct from and layered on top of any Brand Profile context given in your system instructions.`);
  if (ctx.pointOfView) voiceNotes.push(`Point of view: narrate in ${POINT_OF_VIEW_GUIDANCE[ctx.pointOfView]}.`);
  if (ctx.targetCountry) voiceNotes.push(`Localize for readers in ${ctx.targetCountry} — prefer examples, references, units, and cultural context relevant to that country wherever the topic naturally allows it.`);
  const voiceBlock = voiceNotes.length > 0 ? `\n\nVoice instructions for this article:\n${voiceNotes.map((n) => `- ${n}`).join('\n')}\n` : '';

  const sectionsList = outline.sections
    .map((s, i) => `${i + 1}. H2 "${s.heading}" — ${s.summary}`)
    .join('\n');

  const imageMarkersList = outline.images
    .map((img) => `{{${img.placementMarker}}} (shows: ${img.altText})`)
    .join('\n');

  const keyTakeawaysThemesList = outline.keyTakeawaysThemes.map((t) => `- ${t}`).join('\n');
  const commonMistakesThemesList = outline.commonMistakesThemes.map((t) => `- ${t}`).join('\n');
  const faqQuestionsList = outline.faqQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const comparisonTableInstruction = outline.includeComparisonTable
    ? `Include a Comparison Table section (outline decided this fits: "${outline.comparisonTableReason}"). Write it as a genuine Markdown table (header row + at least 2 data rows) placed within the body where it's most relevant, comparing the materials/methods/products/options the topic calls for. Also return the same table data in the structured "comparisonTable" field below.`
    : `Do NOT include a Comparison Table — the outline decided this topic doesn't call for one ("${outline.comparisonTableReason}"). Omit the section entirely, do not force one in. Return "comparisonTable": null.`;

  const system = `You are an expert SEO copywriter. You write the full body of a WordPress article from an approved outline, following a fixed 10-block AEO structure. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown fences around the JSON itself, no explanations, no extra text — but the "content" field value must itself be Markdown.`;

  const user = `Write the full article for the outline below. Follow the section order and summaries exactly — do not add, remove, or reorder the Main Content H2 sections.
${voiceBlock}

Title: ${outline.title}
Meta description: ${outline.metaDescription}
Quick Answer angle: ${outline.quickAnswerAngle}

Key Takeaways themes (expand each into a full standalone bullet):
${keyTakeawaysThemesList}

Main Content sections to write:
${sectionsList}

Common Mistakes themes (expand each into a real, specific mistake with concrete editorial value):
${commonMistakesThemesList}

FAQ questions (answer each fully and distinctly):
${faqQuestionsList}

${guidelines}

Structure — write the "content" field as Markdown, in this exact order:
1. "# ${outline.title}" as the single H1.
2. Introduction — 3-4 paragraphs. The very first sentence must NOT repeat the title verbatim or near-verbatim. Open by reframing the topic in different words — a question, a scenario, or a fact — never a restatement of the H1.
3. "## Quick Answer" section — a direct, self-contained 40-60 word answer to the core question, phrased so it could be quoted verbatim by a featured snippet. No "as mentioned above" or other dependency on surrounding context.
4. "## Key Takeaways" section — a bullet list, one complete standalone fact per theme above (not a teaser for the section below).
5. The Main Content H2 sections listed above, in order, each fully developed (150-200+ words).
6. ${comparisonTableInstruction}
7. "## Common Mistakes" section — one item per theme above, each a short paragraph with real editorial value, not generic filler.
8. Do NOT write an FAQ section in the Markdown body at all — skip straight from Common Mistakes to the Conclusion. The FAQ is returned only in the structured "faq" field below, never as visible article text, so it can back a FAQPage rich result later.
9. "## Conclusion" section.
10. A short Soft CTA as the final paragraph — a low-pressure invitation to a next action (read a related article, subscribe), never a hard sales pitch. Match its tone to the Brand Profile context given in your system instructions if one was provided; otherwise keep it neutral and non-commercial. Do not reuse a generic fixed phrase.

Other rules:
- Insert each of these image placement markers, on its own line, at the point in the body (steps 2, 5, or 6 above) where that image is most relevant to the surrounding content:
${imageMarkersList}
- If there are more image markers than Main Content sections, place more than one marker within the same section rather than skipping, merging, or forcing an unrelated match — every marker listed above must appear exactly once somewhere in the body.
- The "(shows: ...)" text next to each marker above is context for you only, so you place the marker in the right spot — it is not caption text. Never print any alt text, image description, or a "shows:" phrase as visible content anywhere in the article body. Do not add a caption, list, or summary of the images (in any language, under any heading such as "Bildunterschriften", "Image captions", "Alt text", or similar) at the end of the article or anywhere else — alt text exists only in the outline's JSON data, never as visible article text.
- Do not invent additional image markers and do not omit any of the ones listed above. Do not include the featured image — it is handled separately, outside this content.
- Do not repeat the meta description verbatim in the body.
- Target ${minWords}-${maxWords} words across the Markdown "content" (Quick Answer through Soft CTA; FAQ answers are not part of this count since they're not in the Markdown).

Also return the following as separate structured fields, matching what you wrote in the Markdown (Quick Answer, Key Takeaways, Common Mistakes text must match what's in "content"; the FAQ only exists here, not in "content"):
- quickAnswer: the same 40-60 word answer used in the Quick Answer section
- keyTakeaways: array of the same standalone bullets used in the Key Takeaways section (4-6 strings)
- comparisonTable: ${outline.includeComparisonTable ? 'the same table as an object { "headers": [...], "rows": [[...], [...]] }' : 'null'}
- commonMistakes: array of the same mistakes used in the Common Mistakes section (3-5 strings)
- faq: array of { "question": "...", "answer": "..." } objects, one per question listed above (4-6 items), fully answered

Respond with this exact JSON structure:
{
  "content": "# Title\\n\\nBody markdown with ## sections and {{IMAGE_N}} markers, no FAQ section...",
  "quickAnswer": "...",
  "keyTakeaways": ["...", "..."],
  "comparisonTable": ${outline.includeComparisonTable ? '{ "headers": ["...", "..."], "rows": [["...", "..."]] }' : 'null'},
  "commonMistakes": ["...", "..."],
  "faq": [{ "question": "...", "answer": "..." }]
}`;

  return { system, user };
}
