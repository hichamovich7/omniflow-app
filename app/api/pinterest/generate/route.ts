import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText, analyzeImage } from '@/lib/ai/engine';
import { getRoleConfig } from '@/lib/ai/config';
import { generatePinsSchema, BANNER_TEMPLATES, isIntegratedTextEnabled } from '@/lib/validations/pinterest';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import { getNicheVisualConvention, DEFAULT_NICHE_CONVENTION } from '@/lib/ai/niche-visual-conventions';
import { imageStyleAnalysisSchema } from '@/lib/validations/vision';
import { buildPinterestPinsPrompt, estimateMaxTokens, PROMPT_ID } from '@/lib/prompts';
import { buildVisionStyleAnalysisPrompt } from '@/lib/ai/prompts/vision-style-analysis';
import { buildBrandProfileContext } from '@/lib/brand-profile';
import { listContentStreamNamesForBoard } from '@/lib/queries/niche-context';
import { getProjectNicheSettings } from '@/lib/queries/niche-settings';
import { buildAnalysisContext } from '@/lib/analyzer/context';
import { buildImageAnalysisContext } from '@/lib/vision/context';
import {
  attachPinterestStrategyMetadata,
  selectHeadlineTemplateForAngle,
  validatePinterestStrategyBatch,
} from '@/lib/pinterest/strategy';
import {
  buildStrategySafeguardError,
  strategySafeguardLogLine,
  strategySafeguardSummary,
} from '@/lib/pinterest/strategy-errors';
import {
  PIN_PLAN_FAILURE_MESSAGE,
  PinterestPlanError,
  parsePinterestGenerationPlan,
  planErrorIssues,
} from '@/lib/pinterest/generation-plan';
import type { PinterestGenerationPlan } from '@/lib/pinterest/generation-plan';
import { findOrCreateBoardIds } from '@/lib/queries/boards';
import {
  articleClaimEvidence,
  buildArticlePinterestContext,
  loadArticlePinterestSource,
  SocialGenerationError,
  validateDistinctAngles,
  withoutUrls,
  type ArticlePinterestSource,
} from '@/lib/social/pinterest-from-article';
import {
  attachArticleSourceMetadata,
  buildArticleGrounding,
  planArticlePinSections,
  validateArticleGroundedPins,
  type ArticleGrounding,
} from '@/lib/pinterest/article-briefs';
import { assignPinArchetypes, withVisualArchetype } from '@/lib/pinterest/visual-archetypes';
import {
  COMPOSER_INELIGIBLE_MESSAGES,
  attachComposerMetadata,
  buildComposerMetadata,
  buildListicleComposerMetadata,
  composerEligibility,
  composerTemplateForStyle,
  verifyComposerText,
  type ComposerMetadata,
} from '@/lib/pinterest/composer/content';
import { describeSectionImages, referenceImageHosts } from '@/lib/pinterest/article-vision';
import {
  buildListicleAnglePlan,
  detectListicleNumber,
  isNumberedAngle,
  planListicleImageSources,
  validateListicleBatch,
} from '@/lib/pinterest/listicle';
import { imagePromptRepairTargets, repairImagePrompts } from '@/lib/pinterest/image-prompt-repair';
import { generationSourceColumns, loadWordPressPostPinterestSource } from '@/lib/social/pinterest-from-wordpress-post';
import { WordPressReadError } from '@/lib/wordpress/post-reader';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { resolvePinDestination } from '@/lib/pinterest/destination-url';
import type { ApiResponse } from '@/types/api';
import {
  attachAiIntegratedMetadata,
  resolveEffectiveLanguage,
  resolveAiIntegratedText,
  resolvePinAngle,
} from '@/lib/pinterest/ai-integrated';

// Defense in depth (TASK-FIX-024), same mechanism as the allowTextOverlay
// clamp in lib/prompts/pinterest-pins.ts: the prompt only asks the AI to pick
// among the niche's eligible templates, but nothing guarantees it complied —
// so the persisted value is clamped here regardless of what the model returned.
function clampBannerTemplate(
  chosen: BannerTemplate | undefined,
  allowed: BannerTemplate[]
): BannerTemplate {
  if (chosen && allowed.includes(chosen)) return chosen;
  return allowed[0];
}

// The route runs Vision, one text call and the inserts: give it the same
// room as the WordPress article routes so the platform never cuts it before
// the text call's own timeout below.
export const maxDuration = 180;

// Article-grounded prompts carry the article sections and one visual brief
// per Pin (~33k characters for 7 Pins), so the text call gets more than the
// provider's 60s default. Keyword / Research generations keep the default.
const ARTICLE_GROUNDED_TEXT_TIMEOUT_MS = 120_000;

/** The provider's fetch was aborted by its timeout (AbortController / AbortSignal.timeout). */
function isTimeoutError(err: unknown): boolean {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined;
  return name === 'AbortError' || name === 'TimeoutError';
}

function classifyGenerationError(err: unknown): { status: number; code: string; message: string } {
  const failed = (message: string) => ({ status: 500, code: 'generation_failed', message });

  if (isTimeoutError(err)) {
    return {
      status: 504,
      code: 'ai_timeout',
      message: 'The AI model took too long to answer. Nothing was saved and no credit was used. Try again, or request fewer Pins.',
    };
  }

  const message = err instanceof Error ? err.message : String(err);

  if (message === 'OpenRouter returned empty response') {
    return failed("The AI model didn't return any content — it likely ran out of response tokens before finishing. Try again, or request fewer pins.");
  }

  if (message.startsWith('OpenRouter stream error')) {
    return failed('The AI provider connection was interrupted mid-response. Please try again.');
  }

  const httpMatch = message.match(/^OpenRouter error: (\d+)$/);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    if (status === 401 || status === 403) {
      return failed('AI provider rejected the request (authentication error). Please contact support.');
    }
    if (status === 429) {
      return failed('AI provider rate limit reached. Try again in a moment.');
    }
    if (status >= 500) {
      return failed('AI provider is temporarily unavailable. Try again shortly.');
    }
    return failed(`AI provider request failed (HTTP ${status}). Try again.`);
  }

  if (err instanceof SyntaxError) {
    return failed("The AI returned a response that wasn't valid JSON. Try again.");
  }

  return failed('Generation failed. Please try again.');
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Unauthorized', code: 'unauthorized' } },
      { status: 401 }
    );
  }

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'pinterest/generate', 60, 3600, {
    enforceTrialLimit: true,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
      { status: 400 }
    );
  }

  const parsed = generatePinsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const {
    projectId,
    keyword,
    language: requestedLanguage,
    pinsRequested,
    board,
    boardSection,
    websiteUrl,
    pinterestUrl,
    analysisId,
    generationMode,
    wordpressArticleId,
    wordpressPost,
    destinationUrl,
    visualStyle,
  } = parsed.data;
  // The schema already rejects a reference for the other modes; this is a
  // second guard so the Vision step below can only ever run for Legacy
  // Composite (TASK-013 behavior, unchanged).
  const referenceImageUrl = generationMode === 'legacy-composite'
    ? parsed.data.referenceImageUrl
    : undefined;
  const textOverlayMode = generationMode === 'legacy-composite'
    ? parsed.data.textOverlayMode
    : 'never';
  const aiIntegrated = generationMode === 'ai-integrated'
    ? parsed.data.aiIntegrated
    : undefined;

  const { data: project } = await supabase
    .from('projects')
    .select('id, description, niche, user_id, default_language')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'invalid_project' } },
      { status: 400 }
    );
  }

  if (project.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this project', code: 'forbidden' } },
      { status: 403 }
    );
  }

  // Social Content Studio (TASK-044 phase 2): an owned, completed article of
  // this same project becomes the prompt context. Read-only; its permalink
  // and every other URL stay out of the context (the schema already rejects
  // websiteUrl / pinterestUrl / analysisId alongside it).
  // Existing WordPress post (Volet A): same checks (owned connection of
  // this project), then one GET of the post — WordPress is never written.
  let articleSource: ArticlePinterestSource | null = null;
  if (wordpressArticleId || wordpressPost) {
    try {
      if (wordpressArticleId) {
        articleSource = await loadArticlePinterestSource(supabase, user.id, wordpressArticleId);
      } else if (wordpressPost) {
        articleSource = await loadWordPressPostPinterestSource(supabase, user.id, wordpressPost);
      }
      if (articleSource && articleSource.projectId !== projectId) {
        throw new SocialGenerationError('project_mismatch', 'The article does not belong to this project');
      }
    } catch (err) {
      if (!(err instanceof SocialGenerationError) && !(err instanceof WordPressReadError)) throw err;
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: err.status }
      );
    }
  }

  // TASK-079: an explicitly chosen composer format the article cannot prove
  // is refused here — before Vision, the text call or any image call.
  const explicitTemplate = composerTemplateForStyle(visualStyle);
  if (explicitTemplate && articleSource && !composerEligibility(articleSource.context)[explicitTemplate]) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: COMPOSER_INELIGIBLE_MESSAGES[explicitTemplate], code: 'visual_format_unavailable' } },
      { status: 422 }
    );
  }

  // Destination URL (TASK-071): the typed URL, else the verified permalink of
  // an existing WordPress post. Saved on the Pins only — it is never
  // passed to the prompt builder below, and never carries UTM parameters.
  const destination = resolvePinDestination({ manualUrl: destinationUrl, source: articleSource });

  // The article flow lets the user pick the language (the article's by
  // default) in every mode, instead of inheriting the project's.
  const language = articleSource
    ? requestedLanguage
    : resolveEffectiveLanguage(generationMode, requestedLanguage, project.default_language);

  // Article-grounded Pins: each Pin gets a real section of the article and a
  // visual brief. Article photos only ever become text (alt text first, then
  // VISION) — never an image-model reference. Best-effort: without Vision the
  // brief uses the article text alone.
  let articleGrounding: ArticleGrounding | null = null;
  if (articleSource) {
    const sectionPlan = planArticlePinSections(articleSource.context, pinsRequested);
    const { descriptions, stats } = await describeSectionImages(articleSource.context, sectionPlan, {
      analyzeImage,
      allowedHosts: referenceImageHosts(articleSource.siteUrl ?? null),
    });
    // Counts only: no URL, no article content.
    console.log(`[${PROMPT_ID}] Article image descriptions: ${JSON.stringify(stats)}`);
    // TASK-078: archetypes only with Auto variety; classic keeps the former briefs.
    articleGrounding = buildArticleGrounding(articleSource.context, pinsRequested, descriptions, {
      niche: articleSource.niche,
      visualStyle,
    });
  }

  let analysisContext: string | null = articleSource
    ? buildArticlePinterestContext(articleSource, keyword, articleGrounding)
    : null;

  // TASK-083: an article that states an exact count (H1, else a reliable
  // numbered list) gets at least half numbered Pins. Balanced: every angle is
  // planned; AI recommends (TASK-FIX-084): only the numbered slots are, the
  // other Pins keep the model's choice. A Manual angle stays the user's
  // choice. Keyword and Research flows never get here.
  const listicleStrategy = aiIntegrated?.strategy ?? 'balanced';
  const listicleNumber = articleSource && listicleStrategy !== 'manual'
    ? detectListicleNumber(articleSource.context)
    : null;
  const listicleAnglePlan = listicleNumber ? buildListicleAnglePlan(pinsRequested) : null;
  const listicleMode = listicleStrategy === 'ai-recommends' ? 'minimum' : 'exact';

  if (analysisId) {
    const { data: analysis } = await supabase
      .from('content_analyses')
      .select('theme, keywords, audience, tone, category, summary, user_id')
      .eq('id', analysisId)
      .single();

    if (!analysis) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Content analysis not found', code: 'invalid_analysis' } },
        { status: 400 }
      );
    }

    if (analysis.user_id !== user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'You do not have access to this content analysis', code: 'forbidden' } },
        { status: 403 }
      );
    }

    analysisContext = buildAnalysisContext(analysis);
  }

  let referenceStyleGuidance: string | undefined;
  let imageAnalysisJson: string | null = null;

  if (referenceImageUrl) {
    try {
      const { instructions } = buildVisionStyleAnalysisPrompt();
      // gemini-2.5-flash spends a chunk of the budget on internal reasoning
      // tokens before emitting the visible JSON — empirically needs ~1000+ to
      // avoid returning empty content (see docs/DECISIONS.md 2026-08-02).
      const raw = await analyzeImage({ imageUrl: referenceImageUrl, instructions, maxTokens: 1200 });
      const parsedAnalysis = imageStyleAnalysisSchema.safeParse(JSON.parse(raw));

      if (parsedAnalysis.success) {
        referenceStyleGuidance = buildImageAnalysisContext(parsedAnalysis.data);
        imageAnalysisJson = JSON.stringify(parsedAnalysis.data);
      } else {
        console.error('[vision-style-analysis] Response validation failed:', parsedAnalysis.error.issues);
      }
    } catch (err) {
      // Best-effort: the reference image is a style enhancement, not a
      // required input — a VISION provider hiccup must never block the whole
      // generation, it just falls back to no reference style guidance.
      console.error('[vision-style-analysis] analyzeImage failed:', err);
    }
  }

  // Sub-niche context: the Content Stream of the board the user chose, then
  // (article flow) the Streams of the article's WordPress category.
  const contentStreams = [
    ...(await listContentStreamNamesForBoard(supabase, user.id, projectId, board)),
    ...(articleSource?.contentStreams ?? []),
  ];
  // Project niche settings (migration 041) — best-effort, defaults when absent.
  const nicheSettings = articleSource
    ? articleSource.nicheSettings ?? null
    : await getProjectNicheSettings(supabase, user.id, projectId);

  const model = getRoleConfig('FAST').model;

  const { data: generation, error: genError } = await supabase
    .from('generations')
    .insert({
      project_id: projectId,
      user_id: user.id,
      keyword,
      language,
      pins_requested: pinsRequested,
      website_url: websiteUrl ?? null,
      pinterest_url: pinterestUrl ?? null,
      reference_image_url: referenceImageUrl ?? null,
      model_used: model,
      credits_used: 0,
      status: 'processing',
    })
    .select()
    .single();

  if (genError) {
    console.error('Failed to create generation:', genError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to start generation', code: 'server_error' } },
      { status: 500 }
    );
  }

  try {
    const { system, user: userPrompt } = buildPinterestPinsPrompt({
      keyword,
      language,
      pinsRequested,
      niche: project.niche,
      contentStreams,
      nicheSettings,
      textOverlayMode,
      generationMode,
      aiIntegrated,
      brandProfile: buildBrandProfileContext(project.description),
      analysisContext: analysisContext ?? undefined,
      referenceStyleGuidance,
      articleGrounded: Boolean(articleGrounding?.sectionPlan.length),
      ...(listicleNumber && listicleAnglePlan
        ? {
            listicle: {
              number: listicleNumber.value,
              anglePlan: listicleAnglePlan,
              strategy: listicleMode === 'minimum' ? ('ai-recommends' as const) : ('balanced' as const),
            },
          }
        : {}),
    });

    const content = await generateText({
      role: 'FAST',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: estimateMaxTokens(pinsRequested, {
        integratedText: generationMode === 'ai-integrated',
        articleGrounded: Boolean(articleGrounding?.sectionPlan.length),
      }),
      ...(articleGrounding?.sectionPlan.length ? { timeoutMs: ARTICLE_GROUNDED_TEXT_TIMEOUT_MS } : {}),
    });

    // The plan must be complete and valid before anything else happens: no
    // board is created, no pin is written and no image is ever requested for a
    // response that cannot be trusted (it is never repaired or completed).
    let plan: PinterestGenerationPlan;
    try {
      // AI Integrated: elements the user turned off are dropped before the
      // schema check (never used anyway); enabled ones stay strict.
      plan = parsePinterestGenerationPlan(content, {
        disabledIntegratedText: aiIntegrated
          ? (['headline', 'subtitle', 'cta'] as const).filter((element) => !isIntegratedTextEnabled(aiIntegrated, element))
          : [],
      });
    } catch (planError) {
      if (!(planError instanceof PinterestPlanError)) throw planError;
      // Kind, length, schema paths, codes and counts only — never any part of
      // the model response (TASK-FIX-084). A single flattened string argument
      // stays legible in log viewers that collapse object arguments.
      console.error(
        `[${PROMPT_ID}] Pin plan rejected: ${JSON.stringify({ step: 'generate', model, role: 'FAST', ...planError.diagnostics() })}`
      );
      await supabase
        .from('generations')
        .update({ status: 'failed', error_message: PIN_PLAN_FAILURE_MESSAGE })
        .eq('id', generation.id);
      const issues = planErrorIssues(planError);
      return NextResponse.json<ApiResponse<null>>(
        {
          data: null,
          error: {
            message: PIN_PLAN_FAILURE_MESSAGE,
            code: 'invalid_pin_plan',
            retryable: true,
            ...(issues.length ? { issues, issueCount: planError.diagnostics().issueCount ?? issues.length } : {}),
          },
        },
        { status: 422 }
      );
    }

    let resolvedPins = plan.pins.map((pin) => {
      const resolved = {
        ...pin,
        angle: aiIntegrated
          ? resolvePinAngle(aiIntegrated.strategy, aiIntegrated.manualAngle, pin.angle)
          : pin.angle,
      };
      // Article flow: no link may reach a saved Pin's text.
      return articleSource ? withoutUrls(resolved) : resolved;
    });

    const enforceBalancedAngles = !aiIntegrated || aiIntegrated.strategy === 'balanced';
    // What a number or claim may rest on (TASK-FIX-084): the keyword and the
    // source itself — the article (with its photo descriptions) or the
    // Research analysis. Never OmniFlow's own <pin_plan> ("Pin 1 … Pin N"),
    // so the requested Pin count is never proof of a number.
    const sourceEvidence = articleSource
      ? articleClaimEvidence(articleSource, keyword, articleGrounding ? [articleGrounding.evidence] : [])
      : [keyword, analysisContext].filter(Boolean).join('\n');
    const validateBatch = (pinsToCheck: typeof resolvedPins) => [
      ...validatePinterestStrategyBatch(
        pinsToCheck,
        pinsRequested,
        sourceEvidence,
        // A numbered batch follows its own plan instead of the even balance.
        { enforceBalancedAngles: enforceBalancedAngles && !listicleAnglePlan }
      ),
      ...(listicleNumber && listicleAnglePlan
        ? validateListicleBatch(pinsToCheck, listicleAnglePlan, listicleNumber.value, sourceEvidence, { mode: listicleMode })
        : []),
      ...(articleSource && enforceBalancedAngles
        ? validateDistinctAngles(pinsToCheck, pinsRequested)
        : []),
      ...(articleGrounding?.sectionPlan.length
        ? validateArticleGroundedPins(pinsToCheck, articleGrounding)
        : []),
    ];
    let strategyIssues = validateBatch(resolvedPins);

    // Article flow: an image_prompt that only adds elements its section never
    // names, or misses its section's primary subject (visual subject
    // contract), gets one targeted repair (image_prompt only), then the whole
    // batch is validated again. Otherwise the original 422 stands.
    const repairTargets = imagePromptRepairTargets(strategyIssues, resolvedPins, articleGrounding);
    if (repairTargets) {
      const repaired = await repairImagePrompts(resolvedPins, repairTargets, { generateText });
      const repairedIssues = repaired ? validateBatch(repaired) : null;
      const accepted = Boolean(repaired && repairedIssues?.length === 0);
      // Counts only: no Pin text, no article content.
      console.log(
        `[${PROMPT_ID}] Image prompt repair: ${JSON.stringify({ pins: repairTargets.length, parsed: Boolean(repaired), accepted })}`
      );
      if (repaired && accepted) {
        resolvedPins = repaired;
        strategyIssues = [];
      }
    }

    if (strategyIssues.length > 0) {
      // A single flattened string argument — never a bare object — so the
      // issue codes stay legible in log viewers that summarize/collapse
      // non-primitive console.error arguments (they were previously opaque
      // in production, e.g. Vercel Runtime Logs rendering an untruncated
      // object preview as an unreadable placeholder). Codes, Pin indexes,
      // fields, model and role only — no Pin text.
      console.error(
        `[${PROMPT_ID}] Strategy validation failed: ${strategySafeguardLogLine(strategyIssues, {
          step: 'generate',
          model,
          role: 'FAST',
        })}`
      );
      // A controlled content-validation failure, not a server bug: same
      // family as invalid_pin_plan above. No board, pin or image work has
      // happened yet, and no credits were ever debited (credits_used: 0).
      const safeguardError = buildStrategySafeguardError(strategyIssues);
      await supabase
        .from('generations')
        .update({ status: 'failed', error_message: strategySafeguardSummary(safeguardError) })
        .eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: safeguardError },
        { status: 422 }
      );
    }

    const pinsGenerated = resolvedPins.length;

    if (pinsGenerated < pinsRequested) {
      console.warn(
        `[${PROMPT_ID}] Partial result: requested ${pinsRequested}, received ${pinsGenerated}`
      );
    }

    const boardNames = board
      ? resolvedPins.map(() => board)
      : resolvedPins.map((pin) => pin.board);

    // Article flow: boards are only matched, never created — an AI-suggested
    // name with no real board stays free text on the Pin (board_id null).
    const boardIdByName = await findOrCreateBoardIds(supabase, projectId, user.id, boardNames, {
      create: !articleSource,
    });

    const allowedBannerTemplates =
      getNicheVisualConvention(project.niche)?.allowedBannerTemplates ??
      DEFAULT_NICHE_CONVENTION.allowedBannerTemplates ??
      [...BANNER_TEMPLATES];

    const angleOccurrences = new Map<string, number>();
    // Auto variety: each saved Pin keeps the archetype planned for its slot.
    const pinArchetypes = articleGrounding?.pinArchetypes
      ? assignPinArchetypes(articleGrounding.sectionPlan, articleGrounding.pinArchetypes, resolvedPins.map((pin) => pin.sourceSectionId))
      : null;

    // TASK-079: composed Pins carry the exact article text OmniFlow renders.
    // Built and checked against the article before anything is saved; an
    // Auto variety Pin whose text cannot be proven falls back to classic.
    const pinTemplates = articleGrounding?.pinTemplates
      ? assignPinArchetypes(articleGrounding.sectionPlan, articleGrounding.pinTemplates, resolvedPins.map((pin) => pin.sourceSectionId))
      : null;
    // TASK-083: every numbered Pin (Listicle / Article Promise, number checked
    // above) is composed on one of the article's own photos — no image model.
    // Without a usable photo it keeps the path it would have had.
    const listicleByPin = new Map<number, ComposerMetadata>();
    if (listicleNumber && articleSource) {
      const numbered = resolvedPins.flatMap((pin, i) => (isNumberedAngle(pin.angle) ? [i] : []));
      const sources = planListicleImageSources(
        articleSource.context,
        numbered.map((i) => resolvedPins[i].sourceSectionId),
        referenceImageHosts(articleSource.siteUrl ?? null)
      );
      numbered.forEach((pinIndex, k) => {
        const source = sources[k];
        if (!source) return;
        const pin = resolvedPins[pinIndex];
        const metadata = buildListicleComposerMetadata({
          pinTitle: pin.title,
          number: listicleNumber.value,
          source,
          context: articleSource.context,
          sectionId: pin.sourceSectionId,
          language,
          hasDestination: Boolean(destination.linkUrl),
          ctaIndex: pinIndex,
        });
        const issues = metadata ? verifyComposerText(metadata, articleSource.context, { pinTitle: pin.title }) : [];
        if (metadata && issues.length === 0) listicleByPin.set(pinIndex, metadata);
        // Codes and fields only — never the text or the image URL.
        else console.warn(`[${PROMPT_ID}] Numbered Pin composition rejected: ${JSON.stringify({ pin: pinIndex + 1, issues })}`);
      });
      // Counts only: no Pin text, no URL.
      console.log(
        `[${PROMPT_ID}] Listicle: ${JSON.stringify({ source: listicleNumber.source, pins: resolvedPins.length, numbered: numbered.length, articleImages: listicleByPin.size })}`
      );
    }
    const composerByPin: (ComposerMetadata | null)[] = resolvedPins.map((pin, i) => {
      const listicle = listicleByPin.get(i);
      if (listicle) return listicle;
      const template = pinTemplates?.[i];
      if (!template || !articleSource) return null;
      const metadata = buildComposerMetadata(template, articleSource.context, {
        sectionId: pin.sourceSectionId,
        language,
        hasDestination: Boolean(destination.linkUrl),
        ctaIndex: i,
      });
      const issues = metadata ? verifyComposerText(metadata, articleSource.context) : [];
      if (metadata && issues.length === 0) return metadata;
      // Codes and fields only — never the text itself.
      console.warn(`[${PROMPT_ID}] Composer text rejected: ${JSON.stringify({ pin: i + 1, template, issues })}`);
      return null;
    });
    if (explicitTemplate && composerByPin.some((metadata) => metadata === null)) {
      const message = COMPOSER_INELIGIBLE_MESSAGES[explicitTemplate];
      await supabase.from('generations').update({ status: 'failed', error_message: message }).eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message, code: 'visual_format_unavailable' } },
        { status: 422 }
      );
    }

    const pinsToInsert = resolvedPins.map((pin, i) => {
      const angleOccurrence = angleOccurrences.get(pin.angle) ?? 0;
      angleOccurrences.set(pin.angle, angleOccurrence + 1);

      const composer = composerByPin[i];
      const legacyVisualFormat = pin.visualFormat;
      // A composed Pin is always a photo without text: OmniFlow draws the words.
      const visualFormat = composer
        ? 'photo-only'
        : generationMode === 'ai-integrated'
          ? 'ai-integrated'
          : generationMode === 'photo-only'
            ? 'photo-only'
            : legacyVisualFormat;
      const legacyComposite = generationMode === 'legacy-composite' && !composer;
      const strategyMetadata = attachPinterestStrategyMetadata(imageAnalysisJson, pin.angle);
      const integratedAnalysis = aiIntegrated && !composer
        ? attachAiIntegratedMetadata(strategyMetadata, {
            language,
            settings: aiIntegrated,
            text: resolveAiIntegratedText(aiIntegrated, pin.integratedText),
          })
        : strategyMetadata;
      // Article flow: the Pin keeps its source section and visual brief — the
      // image step appends the brief to the image prompt.
      const sourceBrief = pin.sourceSectionId ? articleGrounding?.briefs[pin.sourceSectionId] : undefined;
      const groundedAnalysis = articleGrounding && sourceBrief
        ? attachArticleSourceMetadata(integratedAnalysis, {
            sourceType: articleGrounding.sourceType,
            sectionId: sourceBrief.sectionId,
            brief: withVisualArchetype(sourceBrief, composer ? null : pinArchetypes?.[i] ?? null),
          })
        : integratedAnalysis;
      const persistedAnalysis = composer ? attachComposerMetadata(groundedAnalysis, composer) : groundedAnalysis;

      return {
        generation_id: generation.id,
        language,
        title: pin.title,
        description: pin.description,
        keywords: pin.keywords,
        board: boardNames[i],
        board_id: boardIdByName.get(boardNames[i].trim()) ?? null,
        // Zod already rejects a boardSection without a manually-set board,
        // so this only ever applies when every pin shares the same board.
        board_section: boardSection ?? null,
        link_url: destination.linkUrl,
        image_prompt: pin.image_prompt,
        visual_format: visualFormat,
        overlay_text: legacyComposite ? pin.overlayText ?? null : null,
        // Angle stays transient in Phase 4: it selects an existing persisted
        // template value without requiring a new pins column or migration.
        title_banner_template:
          legacyComposite && legacyVisualFormat === 'text-overlay'
            ? selectHeadlineTemplateForAngle(
                pin.angle,
                angleOccurrence,
                allowedBannerTemplates
              )
            : null,
        cta_banner_template:
          legacyComposite
            ? clampBannerTemplate(pin.ctaBannerTemplate, allowedBannerTemplates)
            : null,
        // Reuse the existing JSON text column so image rendering can recover
        // the structured angle without a schema migration. Reference-style
        // fields remain unchanged at the top level for compatibility.
        image_analysis: persistedAnalysis,
      };
    });

    const { error: pinsError } = await supabase.from('pins').insert(pinsToInsert);

    if (pinsError) {
      console.error('Failed to insert pins:', pinsError);
      const errorMessage = 'Failed to save generated pins. Try again.';
      await supabase.from('generations').update({ status: 'failed', error_message: errorMessage }).eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: errorMessage, code: 'server_error' } },
        { status: 500 }
      );
    }

    await supabase.from('generations').update({ status: 'completed' }).eq('id', generation.id);

    if (articleSource?.articleId) {
      // Traceability only (migration 040). Best-effort and separate from the
      // insert above, so the generation still succeeds before the migration
      // is applied. An internal id — never a destination URL.
      const { error: sourceError } = await supabase
        .from('generations')
        .update({ source_wordpress_generation_id: articleSource.articleId })
        .eq('id', generation.id);
      if (sourceError) {
        console.warn('Could not record the source article on the generation (migration 040 applied?):', sourceError.message);
      }
    }
    if (articleSource) {
      // Source kind + existing post reference (migration 044). Same
      // best-effort rule; ids only — never the post's permalink.
      const { error: sourceTypeError } = await supabase
        .from('generations')
        .update(generationSourceColumns(articleSource))
        .eq('id', generation.id);
      if (sourceTypeError) {
        console.warn('Could not record the generation source type (migration 044 applied?):', sourceTypeError.message);
      }
    }

    return NextResponse.json<ApiResponse<{
      generationId: string;
      status: string;
      pinsGenerated: number;
      linkUrl: string | null;
      destinationWarning: string | null;
    }>>(
      {
        data: {
          generationId: generation.id,
          status: 'completed',
          pinsGenerated,
          linkUrl: destination.linkUrl,
          destinationWarning: destination.warning,
        },
        error: null,
      },
      { status: 201 }
    );
  } catch (err) {
    const failure = classifyGenerationError(err);
    // Error name and code only on a timeout — the abort carries no useful stack.
    if (failure.code === 'ai_timeout') console.error(`[${PROMPT_ID}] Generation failed: AI text call timed out (${(err as Error).name})`);
    else console.error('Generation failed:', err);
    await supabase.from('generations').update({ status: 'failed', error_message: failure.message }).eq('id', generation.id);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: failure.message, code: failure.code } },
      { status: failure.status }
    );
  }
}
