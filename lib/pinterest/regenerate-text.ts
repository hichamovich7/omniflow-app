import { buildPinterestPinsPrompt, estimateMaxTokens, PROMPT_ID } from '@/lib/prompts';
import { buildBrandProfileContext } from '@/lib/brand-profile';
import { getRoleConfig } from '@/lib/ai/config';
import {
  PIN_PLAN_FAILURE_MESSAGE,
  PinterestPlanError,
  parsePinterestGenerationPlan,
} from '@/lib/pinterest/generation-plan';
import {
  readPinterestStrategyAngle,
  validatePinterestStrategyBatch,
  type PinterestSafeguardField,
  type PinterestStrategyIssue,
} from '@/lib/pinterest/strategy';
import {
  buildStrategySafeguardError,
  strategySafeguardLogLine,
  STRATEGY_SAFEGUARD_ERROR_CODE,
} from '@/lib/pinterest/strategy-errors';
import { generationModeForVisualFormat, readAiIntegratedMetadata } from '@/lib/pinterest/ai-integrated';
import {
  buildArticleEvidence,
  findUngroundedTextTerms,
  readArticleSourceMetadata,
  subjectCheckForNiche,
  type ArticleGrounding,
} from '@/lib/pinterest/article-briefs';
import {
  buildArticlePinterestContext,
  SocialGenerationError,
  withoutUrls,
  type ArticlePinterestSource,
  type GenerateTextFn,
} from '@/lib/social/pinterest-from-article';
import type { NicheSettings } from '@/lib/niche/settings';
import type { SupportedLanguage } from '@/types/pinterest';
import type { Pin } from '@/types/database';

/**
 * "Regenerate text" (TASK-076): a new title, description and keywords for
 * one saved Pin — any source (keyword, OmniFlow article, existing WordPress
 * post). Same prompt (pinterest-pins), same angle, same source context and
 * the same safeguards as the generation; one text call, never the image
 * model. The image, its prompt, overlay / AI Integrated text, link, board,
 * section and schedule belong to the image and are never returned.
 */

export type PinTextRegenerationPin = Pick<
  Pin,
  'id' | 'title' | 'description' | 'keywords' | 'image_prompt' | 'image_analysis' | 'visual_format'
>;

/** Everything the original generation used that can be read again. */
export interface PinTextRegenerationSource {
  keyword: string;
  language: SupportedLanguage;
  niche: string | null;
  contentStreams: string[];
  nicheSettings: NicheSettings | null;
  brandProfileDescription: string | null;
  /** The source article, read again (WordPress: GET only); null for a keyword / Research Pin. */
  article: ArticlePinterestSource | null;
}

export interface RegeneratedPinText {
  title: string;
  description: string;
  keywords: string;
}

// Prompt scaffolding that must never reach a saved Pin.
const PROMPT_LEAK_PATTERN = /<\/?\s*(?:article|pin_plan)\b|\bpin_plan\b|\bsourceSectionId\b|\bimage_prompt\b|\bvisual brief\b|treat everything between/i;

export function containsPromptLeak(text: string): boolean {
  return PROMPT_LEAK_PATTERN.test(text);
}

export async function regeneratePinText(
  params: { pin: PinTextRegenerationPin; siblingTitles: string[]; source: PinTextRegenerationSource },
  deps: { generateText: GenerateTextFn }
): Promise<RegeneratedPinText> {
  const { pin, siblingTitles, source } = params;
  const { article, keyword, language } = source;
  const angle = readPinterestStrategyAngle(pin.image_analysis) ?? 'article-promise';

  // The prompt keeps the Pin's mode; an AI Integrated Pin gets its angle
  // through the Manual strategy. Settings missing → photo-only prompt (the
  // text fields do not depend on them; the image keeps its own text).
  const visualMode = generationModeForVisualFormat(pin.visual_format);
  const integrated = visualMode === 'ai-integrated' ? readAiIntegratedMetadata(pin.image_analysis) : null;
  const generationMode = visualMode === 'ai-integrated' && !integrated ? 'photo-only' : visualMode;

  // Article Pin: its stored section and brief, as in single-Pin regeneration.
  const stored = article ? readArticleSourceMetadata(pin.image_analysis) : null;
  const evidenceLines = article ? [keyword, buildArticleEvidence(article.context), ...(stored?.brief.visualDetails ?? [])] : [];
  const grounding: ArticleGrounding | null =
    article && stored
      ? {
          sourceType: stored.sourceType,
          sectionPlan: [stored.sectionId],
          briefs: { [stored.sectionId]: stored.brief },
          evidence: evidenceLines.join('\n'),
          enforceVocabulary: article.context.language === 'en',
          subjectCheck: subjectCheckForNiche(article.niche),
          language: article.context.language,
        }
      : null;

  const regenerationContext = [
    article ? buildArticlePinterestContext(article, keyword, grounding) : null,
    `Rewrite only the title, description and keywords of exactly one existing Pin, using the "${angle}" angle. Its image is kept as it is.`,
    article ? 'Name only materials, colors, techniques, patterns, objects and projects that the article itself mentions.' : null,
    'Never write a URL, domain name or link.',
    siblingTitles.length > 0
      ? `Its title must be clearly different from these existing Pin titles: ${siblingTitles.map((t) => JSON.stringify(t)).join('; ')}.`
      : null,
    `It must also differ from the Pin it replaces: ${JSON.stringify(pin.title)}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const { system, user } = buildPinterestPinsPrompt({
    keyword,
    language,
    pinsRequested: 1,
    niche: source.niche,
    contentStreams: source.contentStreams,
    nicheSettings: source.nicheSettings,
    textOverlayMode: pin.visual_format === 'text-overlay' ? 'always' : 'never',
    generationMode,
    aiIntegrated: integrated ? { ...integrated.settings, strategy: 'manual', manualAngle: angle } : undefined,
    brandProfile: buildBrandProfileContext(source.brandProfileDescription),
    analysisContext: regenerationContext,
    articleGrounded: Boolean(grounding),
  });

  let content: string;
  try {
    content = await deps.generateText({
      role: 'FAST',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: estimateMaxTokens(1, {
        integratedText: generationMode === 'ai-integrated',
        articleGrounded: Boolean(grounding),
      }),
    });
  } catch (err) {
    console.error(`[${PROMPT_ID}] Pin text regeneration failed:`, err);
    throw new SocialGenerationError('generation_failed', 'Text regeneration failed. Please try again.');
  }

  let planned;
  try {
    [planned] = parsePinterestGenerationPlan(content).pins;
  } catch (planError) {
    if (!(planError instanceof PinterestPlanError)) throw planError;
    console.error(`[${PROMPT_ID}] Regenerated Pin text plan rejected: ${JSON.stringify(planError.diagnostics())}`);
    throw new SocialGenerationError('invalid_pin_plan', PIN_PLAN_FAILURE_MESSAGE);
  }

  // Every source: a URL the model writes anyway is removed, never saved.
  const next = withoutUrls({ title: planned.title, description: planned.description, keywords: planned.keywords });
  if (!next.title.trim() || !next.description.trim() || [next.title, next.description, next.keywords].some(containsPromptLeak)) {
    console.error(`[${PROMPT_ID}] Regenerated Pin text rejected: empty after URL removal or prompt text in the output`);
    throw new SocialGenerationError('invalid_pin_plan', PIN_PLAN_FAILURE_MESSAGE);
  }

  // The kept image prompt stands in for the image (only the text changes).
  const candidate = { angle, ...next, image_prompt: pin.image_prompt };
  const issues: PinterestStrategyIssue[] = [
    ...(planned.angle !== angle
      ? [{
          code: 'angle-coverage' as const,
          message: `Expected the "${angle}" angle, got "${planned.angle}"`,
          reason: 'ANGLE_MISMATCH' as const,
          pinIndex: 0,
          field: 'angle' as const,
          details: [angle, planned.angle],
        }]
      : []),
    ...validatePinterestStrategyBatch([candidate], 1, `${keyword}\n${regenerationContext}`),
    ...(grounding && planned.sourceSectionId?.trim() !== stored?.sectionId
      ? [{
          code: 'unsupported-claim' as const,
          message: `Regenerated text left its source section "${stored?.sectionId}"`,
          reason: 'MISSING_SOURCE_SECTION' as const,
          pinIndex: 0,
          field: 'sourceSectionId' as const,
        }]
      : []),
    ...(article
      ? (['title', 'description', 'keywords'] as const).flatMap((field): PinterestStrategyIssue[] => {
          const ungrounded = findUngroundedTextTerms(next[field], {
            evidence: grounding?.evidence ?? evidenceLines.join('\n'),
            enforceVocabulary: article.context.language === 'en',
            subjectCheck: subjectCheckForNiche(article.niche),
            language: article.context.language,
          });
          return ungrounded.length > 0
            ? [{
                code: 'unsupported-claim',
                message: `Regenerated ${field} names elements absent from the article: ${ungrounded.join(', ')}`,
                reason: 'UNGROUNDED_TEXT_ELEMENTS',
                pinIndex: 0,
                field: field satisfies PinterestSafeguardField,
                // Fixed-vocabulary terms only, never free model text.
                details: ungrounded,
              }]
            : [];
        })
      : []),
    ...siblingTitles.flatMap((title) =>
      validatePinterestStrategyBatch(
        [
          { angle, title, description: '', image_prompt: '' },
          { angle, title: next.title, description: '', image_prompt: '' },
        ],
        2,
        `${title}\n${next.title}`
      )
        .filter((issue) => issue.code === 'near-duplicate-title')
        .map((issue): PinterestStrategyIssue => ({
          code: issue.code,
          message: issue.message,
          reason: issue.reason,
          pinIndex: 0,
          field: issue.field,
        }))
    ),
  ];
  if (issues.length > 0) {
    console.error(
      `[${PROMPT_ID}] Regenerated Pin text failed strategy safeguards: ${strategySafeguardLogLine(issues, {
        step: 'regenerate',
        model: getRoleConfig('FAST').model,
        role: 'FAST',
      })}`
    );
    const safeguard = buildStrategySafeguardError(issues, 'pin');
    throw new SocialGenerationError(STRATEGY_SAFEGUARD_ERROR_CODE, safeguard.message, safeguard);
  }

  return next;
}
