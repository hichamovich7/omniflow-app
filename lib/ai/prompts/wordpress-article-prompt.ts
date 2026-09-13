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
  // Structure (TASK-FIX-035, "1-Click Blog Post" / Option 1 only) — all
  // optional. Leaving every one of them undefined reproduces the exact prompt
  // text this function produced before TASK-FIX-035. Key Takeaways/FAQ
  // presence is NOT passed here — it's already resolved by the outline's own
  // (possibly empty) keyTakeawaysThemes/faqQuestions arrays.
  hookBrief?: string;
  includeConclusion?: boolean;
  includeTables?: boolean;
  includeH3?: boolean;
  includeLists?: boolean;
  includeItalics?: boolean;
  includeQuotes?: boolean;
  includeBold?: boolean;
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

  // Structure formatting directives (TASK-FIX-035). "Non" ("false") is always
  // phrased as an explicit ban naming the literal Markdown syntax, not just a
  // soft "no need to" — forcing absence, not merely not requiring presence.
  const formattingNotes: string[] = [];
  if (ctx.includeH3 === true) formattingNotes.push('Use Markdown H3 subheadings ("### ...") within Main Content sections where a section has multiple distinct sub-points worth breaking out.');
  if (ctx.includeH3 === false) formattingNotes.push('Do not use any H3 subheadings ("### ...") or any other nested heading level anywhere in the article — keep every section flat directly under its H2.');
  if (ctx.includeLists === true) formattingNotes.push('Use Markdown bullet or numbered lists within Main Content, Introduction, or Conclusion prose where listing distinct items, steps, or options improves scannability.');
  if (ctx.includeLists === false) formattingNotes.push('Do not use any Markdown bullet or numbered lists ("- ", "* ", "1. ", etc.) within Main Content, Introduction, or Conclusion prose — write those sections as flowing paragraphs only. (This does not apply to the separate Key Takeaways/Common Mistakes sections, which keep their own fixed list format regardless.)');
  if (ctx.includeItalics === true) formattingNotes.push('Use Markdown italics ("*text*") occasionally to emphasize a key term or phrase where it aids clarity.');
  if (ctx.includeItalics === false) formattingNotes.push('Do not use any italic text (no "*single asterisks*" or "_underscores_") anywhere in the article.');
  if (ctx.includeQuotes === true) formattingNotes.push('Use at least one Markdown blockquote ("> ...") to call out a standout statement, tip, or quotation where it fits naturally.');
  if (ctx.includeQuotes === false) formattingNotes.push('Do not use any Markdown blockquotes ("> ...") anywhere in the article.');
  if (ctx.includeBold === true) formattingNotes.push('Use Markdown bold ("**text**") occasionally to highlight key terms or phrases for scannability.');
  if (ctx.includeBold === false) formattingNotes.push('Do not use any bold text (no "**double asterisks**" or "__double underscores__") anywhere in the article.');
  const formattingBlock = formattingNotes.length > 0 ? `\n\nFormatting directives for this article:\n${formattingNotes.map((n) => `- ${n}`).join('\n')}\n` : '';

  const sectionsList = outline.sections
    .map((s, i) => `${i + 1}. H2 "${s.heading}" — ${s.summary}`)
    .join('\n');

  const imageMarkersList = outline.images
    .map((img) => `{{${img.placementMarker}}} (shows: ${img.altText})`)
    .join('\n');

  const hasKeyTakeaways = outline.keyTakeawaysThemes.length > 0;
  const hasFaq = outline.faqQuestions.length > 0;
  const includeConclusionResolved = ctx.includeConclusion !== false;

  const keyTakeawaysThemesList = outline.keyTakeawaysThemes.map((t) => `- ${t}`).join('\n');
  const commonMistakesThemesList = outline.commonMistakesThemes.map((t) => `- ${t}`).join('\n');
  const faqQuestionsList = outline.faqQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const keyTakeawaysContextBlock = hasKeyTakeaways
    ? `\n\nKey Takeaways themes (expand each into a full standalone bullet):\n${keyTakeawaysThemesList}`
    : '';
  const faqContextBlock = hasFaq
    ? `\n\nFAQ questions (answer each fully and distinctly):\n${faqQuestionsList}`
    : '';

  // Tables (TASK-FIX-035): an explicit "Oui"/"Non" overrides whatever the
  // outline itself decided (outline.includeComparisonTable, topic-driven
  // judgment) — undefined leaves that judgment untouched, so this collapses
  // to the exact pre-existing two-branch instruction below.
  const resolvedIncludeTable = ctx.includeTables === true ? true : ctx.includeTables === false ? false : outline.includeComparisonTable;

  const comparisonTableInstruction = resolvedIncludeTable
    ? outline.includeComparisonTable
      ? `Include a Comparison Table section (outline decided this fits: "${outline.comparisonTableReason}"). Write it as a genuine Markdown table (header row + at least 2 data rows) placed within the body where it's most relevant, comparing the materials/methods/products/options the topic calls for. Also return the same table data in the structured "comparisonTable" field below.`
      : `Include a Comparison Table section even though the outline did not originally plan one — the user explicitly requested a table for this article. Construct a genuine, useful Markdown table (header row + at least 2 data rows) from the most naturally comparable elements of the topic (options, methods, criteria, before/after, pros/cons), placed within the body where it fits best. Also return the same table data in the structured "comparisonTable" field below.`
    : ctx.includeTables === false
      ? `Do NOT include a Comparison Table or any other Markdown table anywhere in the article — the user explicitly disabled tables for this article, even though the outline reasoned: "${outline.comparisonTableReason}". Return "comparisonTable": null.`
      : `Do NOT include a Comparison Table — the outline decided this topic doesn't call for one ("${outline.comparisonTableReason}"). Omit the section entirely, do not force one in. Return "comparisonTable": null.`;

  // Hook Brief (TASK-FIX-035): overrides the generic opening-angle menu with
  // the user's specific instruction, still keeping the "never restate the H1"
  // constraint. Undefined reproduces the exact original sentence.
  const introInstruction = ctx.hookBrief
    ? `Introduction — 3-4 paragraphs. The very first sentence must NOT repeat the title verbatim or near-verbatim. ${ctx.hookBrief}`
    : `Introduction — 3-4 paragraphs. The very first sentence must NOT repeat the title verbatim or near-verbatim. Open by reframing the topic in different words — a question, a scenario, or a fact — never a restatement of the H1.`;

  // Structure (TASK-FIX-035): built as a list instead of a hardcoded 1-10
  // block so Key Takeaways/FAQ/Conclusion can be added or omitted with
  // automatic renumbering. When every Structure toggle is left unset (and the
  // outline's own arrays are non-empty, the pre-existing default), this
  // produces byte-for-byte the same 10 steps in the same order as before.
  const structureSteps: string[] = [
    `"# ${outline.title}" as the single H1.`,
    introInstruction,
    `"## Quick Answer" section — a direct, self-contained 40-60 word answer to the core question, phrased so it could be quoted verbatim by a featured snippet. No "as mentioned above" or other dependency on surrounding context.`,
  ];
  // Step numbers referenced later ("Insert markers at steps X, Y, or Z") are
  // captured live instead of hardcoded, since Key Takeaways can shift every
  // step after it by one when disabled.
  const introStepNumber = 2;
  if (hasKeyTakeaways) {
    structureSteps.push(`"## Key Takeaways" section — a bullet list, one complete standalone fact per theme above (not a teaser for the section below).`);
  }
  const mainContentStepNumber = structureSteps.length + 1;
  structureSteps.push(`The Main Content H2 sections listed above, in order, each fully developed (150-200+ words).`);
  const comparisonStepNumber = structureSteps.length + 1;
  structureSteps.push(comparisonTableInstruction);
  structureSteps.push(`"## Common Mistakes" section — one item per theme above, each a short paragraph with real editorial value, not generic filler.`);
  structureSteps.push(
    hasFaq
      ? `Do NOT write an FAQ section in the Markdown body at all — skip straight from Common Mistakes to ${includeConclusionResolved ? 'the Conclusion' : 'the Soft CTA'}. The FAQ is returned only in the structured "faq" field below, never as visible article text, so it can back a FAQPage rich result later.`
      : `This article has no FAQ — skip straight from Common Mistakes to ${includeConclusionResolved ? 'the Conclusion' : 'the Soft CTA'}. Return "faq": [] (empty array).`
  );
  if (includeConclusionResolved) {
    structureSteps.push(`"## Conclusion" section.`);
  }
  structureSteps.push(`A short Soft CTA as the final paragraph — a low-pressure invitation to a next action (read a related article, subscribe), never a hard sales pitch. Match its tone to the Brand Profile context given in your system instructions if one was provided; otherwise keep it neutral and non-commercial. Do not reuse a generic fixed phrase.`);

  const structureList = structureSteps.map((step, i) => `${i + 1}. ${step}`).join('\n');

  const keyTakeawaysFieldNote = hasKeyTakeaways
    ? 'array of the same standalone bullets used in the Key Takeaways section (4-6 strings)'
    : 'empty array — this article has no Key Takeaways section';
  const faqFieldNote = hasFaq
    ? 'array of { "question": "...", "answer": "..." } objects, one per question listed above (4-6 items), fully answered'
    : 'empty array — this article has no FAQ';

  const system = `You are an expert SEO copywriter. You write the full body of a WordPress article from an approved outline, following a fixed ${structureSteps.length}-block AEO structure. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown fences around the JSON itself, no explanations, no extra text — but the "content" field value must itself be Markdown.`;

  const user = `Write the full article for the outline below. Follow the section order and summaries exactly — do not add, remove, or reorder the Main Content H2 sections.
${voiceBlock}${formattingBlock}
Title: ${outline.title}
Meta description: ${outline.metaDescription}
Quick Answer angle: ${outline.quickAnswerAngle}${keyTakeawaysContextBlock}

Main Content sections to write:
${sectionsList}

Common Mistakes themes (expand each into a real, specific mistake with concrete editorial value):
${commonMistakesThemesList}${faqContextBlock}

${guidelines}

Structure — write the "content" field as Markdown, in this exact order:
${structureList}

Other rules:
- Insert each of these image placement markers, on its own line, at the point in the body (steps ${introStepNumber}, ${mainContentStepNumber}, or ${comparisonStepNumber} above) where that image is most relevant to the surrounding content:
${imageMarkersList}
- If there are more image markers than Main Content sections, place more than one marker within the same section rather than skipping, merging, or forcing an unrelated match — every marker listed above must appear exactly once somewhere in the body.
- The "(shows: ...)" text next to each marker above is context for you only, so you place the marker in the right spot — it is not caption text. Never print any alt text, image description, or a "shows:" phrase as visible content anywhere in the article body. Do not add a caption, list, or summary of the images (in any language, under any heading such as "Bildunterschriften", "Image captions", "Alt text", or similar) at the end of the article or anywhere else — alt text exists only in the outline's JSON data, never as visible article text.
- Do not invent additional image markers and do not omit any of the ones listed above. Do not include the featured image — it is handled separately, outside this content.
- Do not repeat the meta description verbatim in the body.
- Target ${minWords}-${maxWords} words across the Markdown "content" (Quick Answer through Soft CTA; FAQ answers are not part of this count since they're not in the Markdown).

Also return the following as separate structured fields, matching what you wrote in the Markdown (Quick Answer, Key Takeaways, Common Mistakes text must match what's in "content"; the FAQ only exists here, not in "content"):
- quickAnswer: the same 40-60 word answer used in the Quick Answer section
- keyTakeaways: ${keyTakeawaysFieldNote}
- comparisonTable: ${resolvedIncludeTable ? 'the same table as an object { "headers": [...], "rows": [[...], [...]] }' : 'null'}
- commonMistakes: array of the same mistakes used in the Common Mistakes section (3-5 strings)
- faq: ${faqFieldNote}

Respond with this exact JSON structure:
{
  "content": "# Title\\n\\nBody markdown with ## sections and {{IMAGE_N}} markers, no FAQ section...",
  "quickAnswer": "...",
  "keyTakeaways": ${hasKeyTakeaways ? '["...", "..."]' : '[]'},
  "comparisonTable": ${resolvedIncludeTable ? '{ "headers": ["...", "..."], "rows": [["...", "..."]] }' : 'null'},
  "commonMistakes": ["...", "..."],
  "faq": ${hasFaq ? '[{ "question": "...", "answer": "..." }]' : '[]'}
}`;

  return { system, user };
}
