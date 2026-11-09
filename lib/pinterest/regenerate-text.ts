import { buildPinterestPinsPrompt, estimateMaxTokens, PROMPT_ID } from '@/lib/prompts';
import { buildBrandProfileContext } from '@/lib/brand-profile';
import { getRoleConfig } from '@/lib/ai/config';
import { PinterestPlanError, parsePinterestPlanWith } from '@/lib/pinterest/generation-plan';
import { regeneratedPinPackageResponseSchema, regeneratedPinTextResponseSchema } from '@/lib/validations/pinterest';
import { detectListicleNumber, isNumberedAngle } from '@/lib/pinterest/listicle';
import { classifyArticleKind } from '@/lib/pinterest/article-kind';
import { isListicleArticleImage, readComposerMetadata } from '@/lib/pinterest/composer/content';
import { findSection, stripUrls } from '@/lib/wordpress/article-context';
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
  articleSectionText,
  buildArticleEvidence,
  findUngroundedTextTerms,
  validateArticleGroundedPins,
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
import type { ApiError } from '@/types/api';
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

/** TASK-099: the coherent creative package — the text plus a brand-new image prompt. */
export interface RegeneratedPinPackage extends RegeneratedPinText {
  image_prompt: string;
}

// Prompt scaffolding that must never reach a saved Pin.
const PROMPT_LEAK_PATTERN = /<\/?\s*(?:article|pin_plan)\b|\bpin_plan\b|\bsourceSectionId\b|\bimage_prompt\b|\bvisual brief\b|treat everything between|rewrite only the title|text-only rewrite/i;

export function containsPromptLeak(text: string): boolean {
  return PROMPT_LEAK_PATTERN.test(text);
}

export const PIN_TEXT_NOT_MODIFIED = 'The Pin was not modified.';

const TEXT_FIELDS = ['title', 'description', 'keywords'] as const;
const PACKAGE_FIELDS = [...TEXT_FIELDS, 'image_prompt'] as const;

const normalizeForCompare = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export type ImagePromptProblem = 'empty' | 'reused' | 'stale_title' | 'number_or_badge';

/**
 * TASK-099: why a regenerated image prompt cannot be used, or null. Checked
 * on the model's prompt only (never logged): empty, the stored prompt reused,
 * the replaced title quoted inside it, or — for a Pin that is not numbered —
 * a badge or the article's global count.
 */
export function imagePromptProblem(
  imagePrompt: string,
  context: { previousPrompt: string | null; previousTitle: string; newTitle: string; forbiddenNumber: string | null }
): ImagePromptProblem | null {
  const prompt = normalizeForCompare(imagePrompt);
  if (!prompt) return 'empty';
  if (context.previousPrompt && prompt === normalizeForCompare(context.previousPrompt)) return 'reused';
  const oldTitle = normalizeForCompare(context.previousTitle);
  if (oldTitle.length >= 12 && oldTitle !== normalizeForCompare(context.newTitle) && prompt.includes(oldTitle)) {
    return 'stale_title';
  }
  if (context.forbiddenNumber) {
    const padded = ` ${prompt} `;
    if (padded.includes(` ${context.forbiddenNumber} `) || /\b(?:badge|numbered|numeral)s?\b/.test(prompt)) {
      return 'number_or_badge';
    }
  }
  return null;
}

/**
 * The field a rejected answer got wrong, from the schema issue paths (never
 * model text): "pins" for a wrong number of Pins or shape, a text field, any
 * other named field, or null when the answer is not JSON at all.
 */
export function invalidPinTextField(error: PinterestPlanError): string | null {
  const paths = (error.diagnostics().issues ?? []).map((issue) => issue.path.split('.'));
  if (paths.length === 0) return null;
  if (paths.some((path) => path.length <= 1)) return 'pins';
  const fields = paths.map((path) => path[2]).filter(Boolean);
  return TEXT_FIELDS.find((field) => fields.includes(field)) ?? fields[0] ?? 'pins';
}

/** User-safe structured error: what was wrong, and that nothing changed. */
export function buildInvalidPinTextError(field: string | null): ApiError {
  const problem =
    field === 'pins'
      ? 'The AI did not return exactly one Pin.'
      : field
        ? `The AI returned an invalid or missing ${field}.`
        : 'The AI did not return valid text.';
  return {
    code: 'invalid_pin_plan',
    message: `${problem} ${PIN_TEXT_NOT_MODIFIED}`,
    retryable: true,
    issues: [{ code: 'INVALID_PIN_TEXT', ...(field ? { field } : {}), message: problem, action: 'Try again.' }],
    issueCount: 1,
  };
}

function invalidPinText(field: string | null): SocialGenerationError {
  const detail = buildInvalidPinTextError(field);
  return new SocialGenerationError('invalid_pin_plan', detail.message, detail);
}

export async function regeneratePinText(
  params: { pin: PinTextRegenerationPin; siblingTitles: string[]; source: PinTextRegenerationSource; withImagePrompt?: false },
  deps: { generateText: GenerateTextFn }
): Promise<RegeneratedPinText>;
export async function regeneratePinText(
  params: { pin: PinTextRegenerationPin; siblingTitles: string[]; source: PinTextRegenerationSource; withImagePrompt: true },
  deps: { generateText: GenerateTextFn }
): Promise<RegeneratedPinPackage>;
export async function regeneratePinText(
  params: { pin: PinTextRegenerationPin; siblingTitles: string[]; source: PinTextRegenerationSource; withImagePrompt?: boolean },
  deps: { generateText: GenerateTextFn }
): Promise<RegeneratedPinText | RegeneratedPinPackage> {
  const { pin, siblingTitles, source } = params;
  const withImagePrompt = params.withImagePrompt === true;
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
  // TASK-099: the image prompt is checked like a generated one — the article
  // kind (project_listicle / tips_guide / generic_article) and the section text.
  const articleKind = article && withImagePrompt ? classifyArticleKind(article.context) : null;
  const section = article && stored && withImagePrompt ? findSection(article.context, stored.sectionId) : null;
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
          ...(articleKind ? { articleKind } : {}),
          ...(section
            ? { sectionTexts: { [stored.sectionId]: [articleSectionText(article.context, section), ...stored.brief.visualDetails].join('\n') } }
            : {}),
        }
      : null;

  // Numbered Pins keep the article's count rules; any other Pin of a numbered
  // article must not ask its image for a badge or that count.
  const listicleNumber = article ? detectListicleNumber(article.context)?.value ?? null : null;
  const composer = readComposerMetadata(pin.image_analysis);
  const numberedPin = Boolean(composer && isListicleArticleImage(composer)) || (Boolean(listicleNumber) && isNumberedAngle(angle));
  const forbiddenNumber = withImagePrompt && listicleNumber && !numberedPin ? listicleNumber : null;

  const regenerationContext = [
    article ? buildArticlePinterestContext(article, keyword, grounding) : null,
    withImagePrompt
      ? `Rewrite the title, description, keywords and image_prompt of exactly one existing Pin, using the "${angle}" angle. Write a brand-new image_prompt from the new title and description${grounding ? " and the Pin's section in <pin_plan>" : ''}; the previous image description is discarded and must not be reused.`
      : `Rewrite only the title, description and keywords of exactly one existing Pin, using the "${angle}" angle. Its image is kept as it is.`,
    forbiddenNumber
      ? 'This Pin is not a numbered Pin: its image_prompt must not show any number, count, badge or list, and never the number of ideas of the article.'
      : null,
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
    tipsGuide: articleKind === 'tips_guide' || undefined,
    textOnlyRewrite: true,
    rewriteImagePrompt: withImagePrompt || undefined,
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
    // The provider error only — never the prompt or the model's text.
    console.error(`[${PROMPT_ID}] Pin text regeneration failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    throw new SocialGenerationError('generation_failed', `Text regeneration failed. ${PIN_TEXT_NOT_MODIFIED} Please try again.`);
  }

  // Text-only contract (TASK-082): exactly one Pin with title, description
  // and keywords. One AI call only — an invalid answer is never sent back to
  // the model; the user retries by hand.
  let planned: { title: string; description: string; keywords: string; angle?: string; sourceSectionId?: string; image_prompt?: unknown };
  try {
    [planned] = withImagePrompt
      ? parsePinterestPlanWith(content, regeneratedPinPackageResponseSchema).pins
      : parsePinterestPlanWith(content, regeneratedPinTextResponseSchema).pins;
  } catch (planError) {
    if (!(planError instanceof PinterestPlanError)) throw planError;
    console.error(`[${PROMPT_ID}] Regenerated Pin text plan rejected: ${JSON.stringify(planError.diagnostics())}`);
    throw invalidPinText(invalidPinTextField(planError));
  }

  // Every source: a URL the model writes anyway is removed, never saved.
  const text = withoutUrls({ title: planned.title, description: planned.description, keywords: planned.keywords });
  const next = { ...text, image_prompt: withImagePrompt ? stripUrls(String(planned.image_prompt ?? '')).trim() : '' };
  const checkedFields = withImagePrompt ? PACKAGE_FIELDS : TEXT_FIELDS;
  const emptyField = checkedFields.find((field) => !next[field].trim());
  const leakField = checkedFields.find((field) => containsPromptLeak(next[field]));
  if (emptyField || leakField) {
    console.error(
      `[${PROMPT_ID}] Regenerated Pin text rejected: ${emptyField ? `${emptyField} empty after URL removal` : `prompt text in ${leakField}`}`
    );
    throw invalidPinText(emptyField ?? leakField ?? null);
  }
  if (withImagePrompt) {
    // Never the stored prompt, never silently: a reused or stale one is refused.
    const problem = imagePromptProblem(next.image_prompt, {
      previousPrompt: pin.image_prompt,
      previousTitle: pin.title,
      newTitle: next.title,
      forbiddenNumber,
    });
    if (problem) {
      console.error(`[${PROMPT_ID}] Regenerated image prompt rejected: ${problem}`);
      throw invalidPinText('image_prompt');
    }
  }

  // Text only: the kept image prompt stands in for the image. Package: the new one.
  const candidate = { angle, ...next, image_prompt: withImagePrompt ? next.image_prompt : pin.image_prompt };
  const issues: PinterestStrategyIssue[] = [
    // Angle and section are fixed by the stored Pin; an echoed different one is refused.
    ...(planned.angle !== undefined && planned.angle !== angle
      ? [{
          code: 'angle-coverage' as const,
          message: `Expected the "${angle}" angle, got "${planned.angle}"`,
          reason: 'ANGLE_MISMATCH' as const,
          pinIndex: 0,
          field: 'angle' as const,
          details: [angle, planned.angle],
        }]
      : []),
    // Keyword + article only: never the prompt, the sibling titles or the replaced title (TASK-FIX-084).
    ...validatePinterestStrategyBatch([candidate], 1, [keyword, ...evidenceLines].join('\n')),
    // TASK-099: the new image prompt passes the generation's article checks
    // (section subject, tip of a tips_guide, ungrounded objects).
    ...(withImagePrompt && grounding && stored
      ? validateArticleGroundedPins([{ sourceSectionId: stored.sectionId, image_prompt: next.image_prompt }], grounding)
      : []),
    ...(grounding && planned.sourceSectionId !== undefined && planned.sourceSectionId !== stored?.sectionId
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

  return withImagePrompt ? next : text;
}
