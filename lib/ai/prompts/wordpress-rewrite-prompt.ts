import { buildSeoGuidelines, buildFactualIntegrityRules, buildEditorialQualityRules } from './seo-guidelines';
import {
  buildArticleFormattingNotes,
  buildArticleVoiceNotes,
  FAQ_PLACEMENT_MARKER,
} from './wordpress-article-prompt';
import { buildWordPressNicheBlocks } from '@/lib/niche/prompt-blocks';
import type { ResolvedNicheContext } from '@/lib/niche/types';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import {
  ARTICLE_SIZE_CONFIG,
  DEFAULT_WORDS_RANGE,
  type ARTICLE_TYPES,
  type ARTICLE_SIZES,
  type TONES_OF_VOICE,
  type POINTS_OF_VIEW,
} from '@/lib/validations/wordpress';

export const REWRITE_PROMPT_ID = 'wordpress-rewrite-v1';

/**
 * "Rewrite article" (WordPress review page). The existing article is the
 * approved outline and the factual source: same H1, same H2 sections in the
 * same order, same image markers, same links — every sentence rewritten.
 * The original generation options (stored on wordpress_generations) and the
 * project context (niche, Brand Profile) are applied exactly as at
 * generation time. No new fact, figure, URL or image.
 */
export interface RewritePromptContext {
  /** Stored H1 (wordpress_articles.title) — kept as is. */
  title: string;
  primaryKeyword: string;
  language: SupportedLanguage;
  /** Current article Markdown with images as {{IMAGE_N}} and the FAQ as the {{FAQ}} line. */
  sourceContent: string;
  /** H2 headings of the current article, in order (FAQ excluded) — the reused outline. */
  headings: string[];
  /** Image markers present in sourceContent, e.g. ["IMAGE_1", "IMAGE_2"]. */
  imageMarkers: string[];
  /** URLs of the Markdown links of the current article — kept, never new ones. */
  links: string[];
  /** FAQ questions to answer again; [] = no FAQ to regenerate. */
  faqQuestions: string[];
  /** True when sourceContent holds a {{FAQ}} line (regenerated or preserved FAQ). */
  hasFaqMarker: boolean;
  brandProfileContext?: string;
  researchNotes?: string;
  niche?: ResolvedNicheContext | null;
  articleType?: (typeof ARTICLE_TYPES)[number];
  articleSize?: (typeof ARTICLE_SIZES)[number];
  toneOfVoice?: (typeof TONES_OF_VOICE)[number];
  pointOfView?: (typeof POINTS_OF_VIEW)[number];
  targetCountry?: string;
  hookBrief?: string;
  includeConclusion?: boolean;
  includeTables?: boolean;
  includeH3?: boolean;
  includeLists?: boolean;
  includeItalics?: boolean;
  includeQuotes?: boolean;
  includeBold?: boolean;
  seoKeywords?: string[];
}

export function buildWordPressRewritePrompt(ctx: RewritePromptContext) {
  const langName = LANGUAGE_LABELS[ctx.language];
  const sizeConfig = ctx.articleSize ? ARTICLE_SIZE_CONFIG[ctx.articleSize] : undefined;
  const minWords = sizeConfig?.minWords ?? DEFAULT_WORDS_RANGE.minWords;
  const maxWords = sizeConfig?.maxWords ?? DEFAULT_WORDS_RANGE.maxWords;
  const hasFaq = ctx.faqQuestions.length > 0;

  const voiceNotes = buildArticleVoiceNotes(ctx);
  if (ctx.hookBrief) voiceNotes.push(`Introduction hook: ${ctx.hookBrief}`);
  const voiceBlock = voiceNotes.length > 0
    ? `\n\nVoice instructions (the original options of this article):\n${voiceNotes.map((n) => `- ${n}`).join('\n')}\n`
    : '';

  const formattingNotes = buildArticleFormattingNotes(ctx);
  if (ctx.includeTables === false) formattingNotes.push('Do not use any Markdown table anywhere in the article.');
  if (ctx.includeConclusion === false) formattingNotes.push('Do not add a Conclusion section.');
  const formattingBlock = formattingNotes.length > 0
    ? `\n\nFormatting directives (the original options of this article):\n${formattingNotes.map((n) => `- ${n}`).join('\n')}\n`
    : '';

  const seoKeywordsBlock = ctx.seoKeywords && ctx.seoKeywords.length > 0
    ? `\n\nSEO keywords to keep: naturally work each of the following keywords/phrases into the body at least once each, never as a standalone list, never keyword-stuffed:\n${ctx.seoKeywords.map((k) => `- ${k}`).join('\n')}\n`
    : '';

  const researchNotesBlock = ctx.researchNotes
    ? `\n\nResearch notes originally provided for this article — together with the current article, the only source of specific facts, figures, or named sources:\n${ctx.researchNotes}\n`
    : '';

  const nicheBlocks = buildWordPressNicheBlocks(ctx.niche, { visual: false });
  const nicheBlock = nicheBlocks ? `\n\n${nicheBlocks}\n` : '';

  const headingsList = ctx.headings.length > 0
    ? ctx.headings.map((h, i) => `${i + 1}. ## ${h}`).join('\n')
    : '(the current article has no H2 section — keep it without H2 sections)';

  const imageRule = ctx.imageMarkers.length > 0
    ? `- Keep each of these image markers exactly once, on its own line, in the section where it currently is: ${ctx.imageMarkers.map((m) => `{{${m}}}`).join(', ')}. Never add, remove, rename, or describe an image.`
    : '- The article has no image marker: do not add any image or image marker.';

  const linkRule = ctx.links.length > 0
    ? `- Keep each of these links exactly once as a Markdown link (\`[anchor](url)\`), with the URL copied exactly — you may rewrite the anchor text around it. These are the only URLs allowed in the article:\n${ctx.links.map((u) => `  - ${u}`).join('\n')}`
    : '- The article has no link: do not add any URL or link.';

  const faqRule = hasFaq
    ? `- Keep the line "${FAQ_PLACEMENT_MARKER}" exactly once, on its own line, where it currently is. The FAQ is rendered there from the structured "faq" field — never write an FAQ heading, questions, or answers in "content".`
    : ctx.hasFaqMarker
      ? `- Keep the line "${FAQ_PLACEMENT_MARKER}" exactly once, on its own line, where it currently is (the existing FAQ is kept as is). Never write an FAQ section in "content".`
      : '- Do not add any FAQ or questions-and-answers section.';

  const faqFieldNote = hasFaq
    ? `array of { "question": "...", "answer": "..." }, exactly one per question below, same order, the question kept as is (or minimally polished), each answer rewritten in 2-4 complete standalone sentences:\n${ctx.faqQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')}`
    : 'empty array []';

  const guidelines = buildSeoGuidelines(ctx.primaryKeyword, {
    stage: 'article',
    minWords,
    maxWords,
    includeH3: ctx.includeH3,
    includeFaq: hasFaq || ctx.hasFaqMarker,
    includeConclusion: ctx.includeConclusion !== false,
    includeComparisonTable: ctx.includeTables,
  });

  const system = `You are an expert SEO copywriter. You rewrite an existing WordPress article from scratch in fresh wording while keeping its approved structure, facts, images and links. All text content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown fences around the JSON itself, no explanations, no extra text — but the "content" field value must itself be Markdown.${ctx.brandProfileContext ? ` ${ctx.brandProfileContext}` : ''}`;

  const user = `Rewrite the full article below. Every paragraph, list item and table cell must be newly written — improved clarity, flow and usefulness — not lightly paraphrased. Keep the meaning and every fact; never invent a number, result, quote, source, product detail or URL that is not in the current article or the research notes.
${voiceBlock}${formattingBlock}${seoKeywordsBlock}${researchNotesBlock}${nicheBlock}
Primary keyword: ${ctx.primaryKeyword}

Structure to keep (the approved outline of this article):
- First line: "# ${ctx.title}" — the H1, unchanged.
- These H2 headings, verbatim and in this order, none added or removed:
${headingsList}
${imageRule}
${linkRule}
${faqRule}

${guidelines}

${buildFactualIntegrityRules()}

${buildEditorialQualityRules()}

Other rules:
- Target ${minWords}-${maxWords} words in "content".
- Never print alt text, image descriptions or captions as visible text.
- Do not mention that the article was rewritten.

Current article (Markdown):
<current_article>
${ctx.sourceContent}
</current_article>

Return:
- content: the rewritten article as Markdown
- faq: ${faqFieldNote}

Respond with this exact JSON structure:
{
  "content": "# ${ctx.title.replace(/"/g, '\\"')}\\n\\n...",
  "faq": ${hasFaq ? '[{ "question": "...", "answer": "..." }]' : '[]'}
}`;

  return { system, user };
}
