import { buildSeoGuidelines, buildFactualIntegrityRules, buildEditorialQualityRules } from './seo-guidelines';
import { buildPinsContextRules, formatPinsContextBlock, type PinSummary } from './wordpress-from-pins-prompt';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import {
  ARTICLE_SIZE_CONFIG,
  DEFAULT_WORDS_RANGE,
  type WordPressOutline,
  type ARTICLE_TYPES,
  type ARTICLE_SIZES,
  type TONES_OF_VOICE,
  type POINTS_OF_VIEW,
} from '@/lib/validations/wordpress';

export const ARTICLE_PROMPT_ID = 'wordpress-article-v3';

/**
 * Placeholder line the article model writes where the FAQ belongs. The FAQ
 * itself is rendered from the structured "faq" field by insertFaqSection()
 * (lib/wordpress/faq-section.ts), so the visible FAQ and the structured one
 * can never diverge and the article always carries a single FAQ section.
 */
export const FAQ_PLACEMENT_MARKER = '{{FAQ}}';

type ArticleType = (typeof ARTICLE_TYPES)[number];
type ArticleSize = (typeof ARTICLE_SIZES)[number];
type ToneOfVoice = (typeof TONES_OF_VOICE)[number];
type PointOfView = (typeof POINTS_OF_VIEW)[number];

const ARTICLE_TYPE_WRITING_GUIDANCE: Record<ArticleType, string> = {
  'how-to': 'a how-to guide — write each section as clear, ordered, actionable instructions the reader can follow',
  listicle: 'a listicle — keep each numbered item self-contained and independently useful',
  'product-review': 'a product review — stay balanced, separate observations from opinion, and never invent test results, specifications, or prices',
  news: 'a news article — lead with the most important provided fact, and never invent dates, figures, or quotes',
  comparison: 'a comparison — compare the options on the same criteria, fairly, without inventing figures',
};

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
  /**
   * The real primary keyword (typed keyword, URL-resolved keyword, or the
   * pins' generation keyword) — never derived from the outline title.
   */
  primaryKeyword: string;
  /** buildBrandProfileContext() output — empty/undefined when the project has none. */
  brandProfileContext?: string;
  /** User research notes, or the Option 3 source summary. */
  researchNotes?: string;
  // Core Settings (TASK-FIX-034, "1-Click Blog Post" / Option 1 only) — all
  // optional. articleSize drives the word target (ARTICLE_SIZE_CONFIG);
  // undefined keeps DEFAULT_WORDS_RANGE.
  articleType?: ArticleType;
  articleSize?: ArticleSize;
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
  // SEO Keywords (TASK-FIX-036, "1-Click Blog Post" / Option 1 only) —
  // optional. Empty/undefined reproduces the exact prompt text this function
  // produced before TASK-FIX-036.
  seoKeywords?: string[];
  // External Linking (TASK-FIX-037, "1-Click Blog Post" / Option 1 only) —
  // optional, manual URLs only: the only URLs this prompt ever allows. The
  // separate addExternalLink() pass (generate-article.ts) is not referenced here.
  manualExternalUrls?: string[];
  // Pins → article (method A) only. Undefined — the keyword and URL methods —
  // reproduces the exact prompt text this function produced before it existed.
  pinsContext?: PinsArticleContext;
}

export interface PinsArticleContext {
  /** The outline's editorial promise — what the article must deliver. */
  promise: string;
  /** The selected Pins, same data as the outline received. */
  pins: PinSummary[];
  /** Distinct real pins.link_url values — the only URLs coming from the Pins. */
  pinLinkUrls: string[];
  /** Optional External URL typed by the user on the pins form. */
  manualExternalUrl?: string | null;
}

function buildPinsArticleBlock(ctx: PinsArticleContext): string {
  const urlRule =
    ctx.pinLinkUrls.length > 0
      ? `- The only URLs provided by the Pins are listed below. You do not have to link them; if one fits naturally, use it at most once, copied exactly as written — never modified, shortened, or replaced by another URL. Never invent any other URL:\n${ctx.pinLinkUrls.map((u) => `  - ${u}`).join('\n')}`
      : '- The Pins provide no URL: do not add any URL taken from or attributed to them.';
  const manualUrlRule =
    ctx.manualExternalUrl && !ctx.pinLinkUrls.includes(ctx.manualExternalUrl)
      ? `\n- External URL provided by the user: ${ctx.manualExternalUrl} — link it only if it is genuinely relevant to a sentence of the article, as a Markdown link (\`[relevant anchor text](url)\`), at most once, copied exactly as written. If it does not fit the article, leave it out.`
      : '';

  return `\n\nEditorial promise of this article (planned from the selected Pins): ${ctx.promise}

Selected Pins (source context for this article):
${formatPinsContextBlock(ctx.pins)}

${buildPinsContextRules()}

Pins article rules:
- The article must fully deliver on the editorial promise above — the Quick Answer, the Main Content sections and the Conclusion must each answer it concretely.
- Develop the ideas the Pins announce (titles, descriptions, overlay text) into real, useful explanations. Do not merely restate a Pin's teaser, hook, or curiosity gap: answer it.
- Do not invent information that is absent from the provided data (Pins, research notes, Brand Profile) beyond widely established general knowledge.
- Keep the title, the outline sections, the image placements and the content consistent with each other and with the promise.
${urlRule}${manualUrlRule}
`;
}

export function buildWordPressArticlePrompt(ctx: ArticlePromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];
  const { outline } = ctx;
  const sizeConfig = ctx.articleSize ? ARTICLE_SIZE_CONFIG[ctx.articleSize] : undefined;
  const minWords = sizeConfig?.minWords ?? DEFAULT_WORDS_RANGE.minWords;
  const maxWords = sizeConfig?.maxWords ?? DEFAULT_WORDS_RANGE.maxWords;

  const voiceNotes: string[] = [];
  if (ctx.articleType) voiceNotes.push(`Article type: this is ${ARTICLE_TYPE_WRITING_GUIDANCE[ctx.articleType]}.`);
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

  // SEO Keywords (TASK-FIX-036): each entry must appear naturally at least
  // once — no stuffing, no dedicated list of them anywhere in the visible
  // text. Empty/undefined produces no block at all, unchanged from before.
  const seoKeywordsBlock =
    ctx.seoKeywords && ctx.seoKeywords.length > 0
      ? `\n\nSEO keywords to include: naturally work each of the following keywords/phrases into the article body at least once each (verbatim or with minor natural inflection) — spread across the most relevant sections, never forced, never as a standalone list or heading, never keyword-stuffed:\n${ctx.seoKeywords.map((k) => `- ${k}`).join('\n')}\n`
      : '';

  // External Linking (TASK-FIX-037): manual URLs only, purely additive —
  // does not reference or depend on the separate addExternalLink() pass.
  const manualLinksBlock =
    ctx.manualExternalUrls && ctx.manualExternalUrls.length > 0
      ? `\n\nExternal links to include: insert each of the following URLs as a Markdown link (\`[relevant anchor text](url)\`) naturally into the article body, wherever contextually relevant to the surrounding content — one per URL where a genuine fit exists, never forced into an unrelated sentence, never as a standalone list of links. Copy each URL exactly as written; these are the only URLs allowed in the article:\n${ctx.manualExternalUrls.map((u) => `- ${u}`).join('\n')}\n`
      : '';

  const pinsContextBlock = ctx.pinsContext ? buildPinsArticleBlock(ctx.pinsContext) : '';

  const researchNotesBlock = ctx.researchNotes
    ? `\n\nResearch notes provided for this article — the only source of specific facts, figures, or named sources you may use (beyond widely established general knowledge):\n${ctx.researchNotes}\n`
    : '';

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
      ? `The line "${FAQ_PLACEMENT_MARKER}" on its own, exactly once — the FAQ is rendered there automatically from the structured "faq" field below. Do NOT write an FAQ heading, questions, or answers in the Markdown body yourself.`
      : `This article has no FAQ — skip straight from Common Mistakes to ${includeConclusionResolved ? 'the Conclusion' : 'the Soft CTA'}. Do not write any FAQ or questions-and-answers section, and return "faq": [] (empty array).`
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
    ? 'array of { "question": "...", "answer": "..." } objects, one per question listed above (4-6 items), each answer 2-4 sentences, complete and standalone, adding information not already stated in the body'
    : 'empty array — this article has no FAQ';

  const guidelines = buildSeoGuidelines(ctx.primaryKeyword, {
    stage: 'article',
    minWords,
    maxWords,
    includeH3: ctx.includeH3,
    includeKeyTakeaways: hasKeyTakeaways,
    includeFaq: hasFaq,
    includeConclusion: includeConclusionResolved,
    includeComparisonTable: resolvedIncludeTable,
  });

  const system = `You are an expert SEO copywriter. You write the full body of a WordPress article from an approved outline, following a fixed ${structureSteps.length}-block AEO structure. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown fences around the JSON itself, no explanations, no extra text — but the "content" field value must itself be Markdown.${ctx.brandProfileContext ? ` ${ctx.brandProfileContext}` : ''}`;

  const user = `Write the full article for the outline below. Follow the section order and summaries exactly — do not add, remove, or reorder the Main Content H2 sections.
${voiceBlock}${formattingBlock}${seoKeywordsBlock}${manualLinksBlock}${pinsContextBlock}${researchNotesBlock}
Primary keyword: ${ctx.primaryKeyword}
Title: ${outline.title}
Quick Answer angle: ${outline.quickAnswerAngle}${keyTakeawaysContextBlock}

Main Content sections to write:
${sectionsList}

Common Mistakes themes (expand each into a real, specific mistake with concrete editorial value):
${commonMistakesThemesList}${faqContextBlock}

${guidelines}

${buildFactualIntegrityRules()}

${buildEditorialQualityRules()}

Structure — write the "content" field as Markdown, in this exact order:
${structureList}

Other rules:
- Insert each of these image placement markers, on its own line, at the point in the body (steps ${introStepNumber}, ${mainContentStepNumber}, or ${comparisonStepNumber} above) where that image is most relevant to the surrounding content:
${imageMarkersList}
- If there are more image markers than Main Content sections, place more than one marker within the same section rather than skipping, merging, or forcing an unrelated match — every marker listed above must appear exactly once somewhere in the body.
- The "(shows: ...)" text next to each marker above is context for you only, so you place the marker in the right spot — it is not caption text. Never print any alt text, image description, or a "shows:" phrase as visible content anywhere in the article body. Do not add a caption, list, or summary of the images (in any language, under any heading such as "Bildunterschriften", "Image captions", "Alt text", or similar) at the end of the article or anywhere else — alt text exists only in the outline's JSON data, never as visible article text.
- Do not invent additional image markers and do not omit any of the ones listed above. Do not include the featured image — it is handled separately, outside this content.
- Target ${minWords}-${maxWords} words across the Markdown "content" (Quick Answer through Soft CTA; FAQ answers are not part of this count since they're not in the Markdown).

Also return the following as separate structured fields, matching what you wrote in the Markdown (Quick Answer, Key Takeaways, Common Mistakes text must match what's in "content"; the FAQ is written only here and rendered into the article automatically):
- quickAnswer: the same 40-60 word answer used in the Quick Answer section
- keyTakeaways: ${keyTakeawaysFieldNote}
- comparisonTable: ${resolvedIncludeTable ? 'the same table as an object { "headers": [...], "rows": [[...], [...]] }' : 'null'}
- commonMistakes: array of the same mistakes used in the Common Mistakes section (3-5 strings)
- faq: ${faqFieldNote}

Respond with this exact JSON structure:
{
  "content": "${hasFaq ? `# Title\\n\\nBody markdown with ## sections, {{IMAGE_N}} markers and the ${FAQ_PLACEMENT_MARKER} line...` : '# Title\\n\\nBody markdown with ## sections and {{IMAGE_N}} markers, no FAQ...'}",
  "quickAnswer": "...",
  "keyTakeaways": ${hasKeyTakeaways ? '["...", "..."]' : '[]'},
  "comparisonTable": ${resolvedIncludeTable ? '{ "headers": ["...", "..."], "rows": [["...", "..."]] }' : 'null'},
  "commonMistakes": ["...", "..."],
  "faq": ${hasFaq ? '[{ "question": "...", "answer": "..." }]' : '[]'}
}`;

  return { system, user };
}
