import type { createClient } from '@/lib/supabase/server';
import { generateImage, resolveImageModel } from '@/lib/ai/engine';
import { buildImagePrompt } from '@/lib/ai/prompt-engine/engine';
import { compositeBanner } from '@/lib/pinterest/compositing';
import { extractAccentColor } from '@/lib/pinterest/color-extraction';
import { pickCtaMessage } from '@/lib/pinterest/cta-messages';
import { readPinterestStrategyAngle } from '@/lib/pinterest/strategy';
import {
  attachPinterestCreativeDiagnostics,
  type PersistedCreativeDiagnostics,
} from '@/lib/pinterest/creative-diagnostics';
import {
  selectHeadlineTemplate,
  type TemplateSelectionHistoryItem,
} from '@/lib/pinterest/template-selection';
import {
  composeHeadlineWithQualityGate,
  type PinQualityHistoryItem,
} from '@/lib/pinterest/quality-gate';
import { getPinImageObjectKey, getPinSourceStoragePath } from '@/lib/pinterest/pin-image-storage';
import type { MediaStorage, StoredMedia } from '@/lib/storage';
import { describeOptimization, optimizeImage } from '@/lib/media/optimize-image';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import { IMAGE_CONFIG } from '@/lib/prompts/image-generator';
import { appendArticleVisualBrief } from '@/lib/pinterest/article-briefs';
import type { Pin } from '@/types/database';
import {
  buildAiIntegratedImagePrompt,
  generationModeForVisualFormat,
  readAiIntegratedMetadata,
  sanitizeFinalPinterestImage,
} from '@/lib/pinterest/ai-integrated';
import {
  ARTICLE_IMAGE_MODEL,
  isListicleArticleImage,
  isListicleV2,
  isStepByStepV2,
  listicleTextTreatment,
  markComposerRendered,
  readComposerMetadata,
  type ComposerMetadata,
} from '@/lib/pinterest/composer/content';
import { composePinImage, composerImagePrompt, metadataForRender } from '@/lib/pinterest/composer/pipeline';
import { buildListicleAiDesignPrompt, prepareAiDesignReference } from '@/lib/pinterest/composer/ai-design';
import { COMPOSER_CANVAS } from '@/lib/pinterest/composer/render';
import type { OptimizedImage } from '@/lib/media/optimize-image';
import { loadArticlePhoto } from '@/lib/pinterest/composer/article-image';
import { referenceImageHosts } from '@/lib/pinterest/article-vision';

/**
 * TASK-099: the per-Pin image pipeline of POST /api/pinterest/generate-images,
 * moved here unchanged so "Regenerate complete Pins" uses exactly the same
 * rendering. `generatePinImage` makes at most the image calls the Pin's mode
 * needs and writes pin_images + the Pin row only once the image is stored.
 * `pinUpdate` (complete regeneration) adds the new text and image prompt to
 * that single Pin-row update; a failed update is then rolled back to the
 * previous active image and reported as a failure.
 */

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * TASK-088: a Pin whose image could not be made, with a message the user may
 * see (no prompt, no URL, no provider payload). The Pin keeps its image.
 */
export class PinImageError extends Error {
  constructor(readonly pinId: string, message: string) {
    super(message);
    this.name = 'PinImageError';
  }
}


export interface PinImageContext {
  supabase: SupabaseServerClient;
  mediaStorage: MediaStorage;
  userId: string;
  generationId: string;
  niche: string | null;
  allowedBannerTemplates: BannerTemplate[];
}

/** Batch ordering of the local headline decision (generate-images); a single Pin uses `singlePinSlot()`. */
export interface PinImageSlot {
  index: number;
  previousSelection: Promise<void>;
  releaseSelection: () => void;
  selectionHistory: TemplateSelectionHistoryItem[];
  qualityHistory: PinQualityHistoryItem[];
}

export function singlePinSlot(): PinImageSlot {
  return { index: 0, previousSelection: Promise.resolve(), releaseSelection: () => undefined, selectionHistory: [], qualityHistory: [] };
}

export interface PinImageOptions {
  /** Extra Pin fields written in the same update as the new image (TASK-099). */
  pinUpdate?: Partial<Pick<Pin, 'title' | 'description' | 'keywords' | 'image_prompt'>>;
}

export async function generatePinImage(
  context: PinImageContext,
  pin: Pin,
  slot: PinImageSlot,
  options: PinImageOptions = {}
): Promise<string> {
  const { supabase, mediaStorage, generationId, allowedBannerTemplates } = context;
  const user = { id: context.userId };
  const project = { niche: context.niche };
  const { index, previousSelection, releaseSelection, selectionHistory, qualityHistory } = slot;
  const { pinUpdate } = options;
  try {
    const { data: existingVersions } = await supabase
      .from('pin_images')
      .select('version')
      .eq('pin_id', pin.id)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (existingVersions?.[0]?.version ?? 0) + 1;
    // TASK-079: a composed Pin keeps its template on every regeneration.
    const composer = readComposerMetadata(pin.image_analysis);
    if (composer) {
      releaseSelection();
      return await generateComposedPin({
        supabase,
        mediaStorage,
        pin,
        composer,
        userId: user.id,
        generationId,
        nextVersion,
        niche: project?.niche ?? null,
        pinUpdate,
      });
    }
    const generationMode = generationModeForVisualFormat(pin.visual_format);
    const integratedMetadata = generationMode === 'ai-integrated'
      ? readAiIntegratedMetadata(pin.image_analysis)
      : null;
    if (generationMode === 'ai-integrated' && !integratedMetadata) {
      throw new Error('AI Integrated pin is missing its validated rendering contract');
    }
    const { model: imageModel } = resolveImageModel(pin.visual_format);
    // Article-grounded Pins carry their section's visual brief; any
    // other Pin gets its prompt back unchanged.
    const rawImageBuffer = await generateImage({
      prompt: appendArticleVisualBrief(
        integratedMetadata
          ? buildAiIntegratedImagePrompt(pin, integratedMetadata, nextVersion)
          : buildImagePrompt(pin, nextVersion),
        pin.image_analysis
      ),
      size: IMAGE_CONFIG.size,
      visualFormat: pin.visual_format,
    });

    let imageBuffer = rawImageBuffer;
    let selectedHeadlineTemplate = pin.title_banner_template ?? 'clean-band';
    let selectedHeadlinePosition: 'top' | 'bottom' | undefined;
    let creativeDiagnostics: PersistedCreativeDiagnostics | null = null;
    const angle = readPinterestStrategyAngle(pin.image_analysis);

    if (generationMode !== 'legacy-composite') {
      // Strip embedded metadata (EXIF, XMP, C2PA content credentials —
      // TASK-FIX-033) by re-encoding the provider file, then validate it.
      // No pixel changes and no text or banner is ever drawn on this path.
      const sanitized = await sanitizeFinalPinterestImage(rawImageBuffer);
      imageBuffer = sanitized.buffer;
      releaseSelection();
    } else {
      const { accentColor, textColor } = await extractAccentColor(rawImageBuffer);
      const ctaText = pickCtaMessage(pin.language, index);
      imageBuffer = await compositeBanner(
        rawImageBuffer,
        ctaText,
        'bottom',
        accentColor,
        textColor,
        pin.cta_banner_template ?? 'clean-band'
      );
      let headlineComposed = false;

      // Provider calls remain concurrent. Only this small local decision is
      // ordered, making repetition penalties stable for the whole batch.
      await previousSelection;
      if (pin.visual_format === 'text-overlay' && pin.overlay_text && angle) {
        const selection = await selectHeadlineTemplate(
          {
            imageBuffer,
            text: pin.overlay_text,
            angle,
            accentColor,
            allowedTemplates: allowedBannerTemplates,
          },
          selectionHistory
        );
        const composition = await composeHeadlineWithQualityGate({
          imageBuffer,
          text: pin.overlay_text,
          angle,
          accentColor,
          textColor,
          selectedTemplate: selection.template,
          selectedPosition: selection.position,
          allowedTemplates: allowedBannerTemplates,
          history: qualityHistory,
        });
        imageBuffer = composition.buffer;
        selectedHeadlineTemplate = composition.template;
        selectedHeadlinePosition = composition.position;
        creativeDiagnostics = {
          status: composition.quality.status,
          warnings: composition.quality.issues.map((issue) => issue.code),
          template: composition.template,
          position: composition.position,
        };
        headlineComposed = true;
        selectionHistory.push({
          angle,
          template: composition.template,
          position: composition.position,
        });
        qualityHistory.push(composition.historyItem);
      }
      releaseSelection();

      if (pin.visual_format === 'text-overlay' && pin.overlay_text && !headlineComposed) {
        imageBuffer = await compositeBanner(
          imageBuffer,
          pin.overlay_text,
          'top',
          accentColor,
          textColor,
          selectedHeadlineTemplate,
          selectedHeadlinePosition
        );
      }
    }

    // TASK-050: one stored variant per Pin — the pinterest-pin profile
    // (1000x1500 JPEG). Fails the Pin rather than storing the raw PNG.
    const optimized = await optimizeImage(imageBuffer, 'pinterest-pin');
    console.log(`[pinterest images] pin ${pin.id} ${describeOptimization(optimized)}`);

    const filePath = getPinImageObjectKey(mediaStorage.provider, {
      userId: user.id,
      generationId,
      pinId: pin.id,
      version: nextVersion,
      extension: optimized.extension,
    });
    const sourcePath = getPinSourceStoragePath(filePath);
    const storesRecompositionSource =
      pin.visual_format === 'text-overlay' && Boolean(pin.overlay_text && angle);
    if (storesRecompositionSource) {
      const { error: sourceUploadError } = await supabase.storage
        .from('generated-images')
        .upload(sourcePath, rawImageBuffer, { contentType: 'image/png' });

      if (sourceUploadError) {
        throw new Error(`Source storage upload failed: ${sourceUploadError.message}`);
      }
    }

    let stored: StoredMedia;
    try {
      stored = await mediaStorage.upload({ key: filePath, body: optimized.buffer, contentType: optimized.contentType });
    } catch (uploadError) {
      if (storesRecompositionSource) {
        await supabase.storage.from('generated-images').remove([sourcePath]);
      }
      throw new Error(
        `Storage upload failed: ${uploadError instanceof Error ? uploadError.message : 'unknown error'}`
      );
    }

    // TASK-099: a complete regeneration can restore the previous image.
    const previousActiveIds = pinUpdate ? await activeImageIds(supabase, pin.id) : [];

    await supabase
      .from('pin_images')
      .update({ is_active: false })
      .eq('pin_id', pin.id)
      .eq('is_active', true);

    await supabase.from('pin_images').insert({
      pin_id: pin.id,
      storage_path: filePath,
      url: stored.publicUrl,
      is_active: true,
      version: nextVersion,
      image_model: imageModel,
    });

    const { error: pinError } = await supabase
      .from('pins')
      .update({
        ...(pinUpdate ?? {}),
        media_url: stored.publicUrl,
        ...(angle && pin.visual_format === 'text-overlay'
          ? { title_banner_template: selectedHeadlineTemplate }
          : {}),
        ...(creativeDiagnostics
          ? {
              image_analysis: attachPinterestCreativeDiagnostics(
                pin.image_analysis,
                creativeDiagnostics
              ),
            }
          : {}),
      })
      .eq('id', pin.id);

    if (pinUpdate && pinError) {
      // Back to the image and text the Pin had: nothing of this regeneration stays active.
      await supabase.from('pin_images').update({ is_active: false }).eq('pin_id', pin.id).eq('storage_path', filePath);
      if (previousActiveIds.length > 0) {
        await supabase.from('pin_images').update({ is_active: true }).in('id', previousActiveIds);
      }
      await mediaStorage.remove([filePath]).catch(() => undefined);
      throw new PinImageError(pin.id, `The Pin "${pin.title}" could not be saved. Its previous text and image are kept.`);
    }

    return pin.id;
  } catch (error) {
    await previousSelection;
    releaseSelection();
    throw error;
  }
}

async function activeImageIds(supabase: SupabaseServerClient, pinId: string): Promise<string[]> {
  const { data } = await supabase.from('pin_images').select('id').eq('pin_id', pinId).eq('is_active', true);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

/**
 * Hosts an article photo may be read from at render time: OmniFlow media
 * storage and the user's own connected WordPress sites — checked again here
 * rather than trusting the URL stored on the Pin.
 */
async function articleImageHosts(supabase: SupabaseServerClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from('wordpress_sites').select('site_url').eq('user_id', userId);
  const sites = ((data ?? []) as Array<{ site_url: string | null }>).map((site) => site.site_url);
  return [...new Set([...referenceImageHosts(null), ...sites.flatMap((siteUrl) => referenceImageHosts(siteUrl, {}))])];
}

/**
 * TASK-079: a composed Pin — one photo without text (photo model; Step-by-step
 * v2: plus one per step panel, at most 4 calls), then the stored article text
 * rendered by OmniFlow. Nothing is stored unless the
 * whole composition succeeds; the new version is recorded inactive first and
 * only replaces the current image once everything is saved.
 */
async function generateComposedPin(params: {
  supabase: SupabaseServerClient;
  mediaStorage: MediaStorage;
  pin: Pin;
  composer: ComposerMetadata;
  userId: string;
  generationId: string;
  nextVersion: number;
  niche: string | null;
  pinUpdate?: PinImageOptions['pinUpdate'];
}): Promise<string> {
  const { supabase, pin, composer, nextVersion } = params;
  // TASK-088: a numbered Pin in "AI-generated design" is drawn whole by the image model.
  if (isListicleV2(composer) && listicleTextTreatment(composer) === 'ai-design') {
    const designed = await generateListicleAiDesign({ supabase, pin, composer, userId: params.userId, niche: params.niche });
    return storeComposedPin({ ...params, ...designed });
  }
  // TASK-083: a numbered Pin is composed on the article's own photo, read
  // (GET only) from the connected site or OmniFlow storage — no image model
  // call. Fallback: the featured image when the section photo is unreadable.
  const listicle = isListicleArticleImage(composer) ? composer : null;
  let imageModel: string;
  let photo: Buffer;
  let renderWarnings: string[] = [];
  if (listicle) {
    imageModel = ARTICLE_IMAGE_MODEL;
    const loaded = await loadArticlePhoto(listicle.source, await articleImageHosts(supabase, params.userId));
    photo = loaded.photo;
    renderWarnings = loaded.warnings;
  } else {
    imageModel = resolveImageModel('photo-only').model;
    photo = await generateImage({
      prompt: composerImagePrompt(appendArticleVisualBrief(buildImagePrompt(pin, nextVersion), pin.image_analysis), composer),
      size: IMAGE_CONFIG.size,
      visualFormat: 'photo-only',
    });
  }
  // Step-by-step v2: one photo per step panel, from its stored deterministic
  // prompt, one after the other, in memory. Any failure stores nothing.
  const stepPhotos: Buffer[] = [];
  if (isStepByStepV2(composer)) {
    for (const [index, panel] of composer.panels.entries()) {
      try {
        stepPhotos.push(await generateImage({ prompt: panel.imagePrompt, size: IMAGE_CONFIG.size, visualFormat: 'photo-only' }));
      } catch (error) {
        throw new Error(`Step-by-step panel ${index + 1} image failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
  }
  const { optimized, metadata } = await composePinImage({
    photo,
    stepPhotos,
    metadata: composer,
    hasDestination: Boolean(pin.link_url),
    // Each "Regenerate image" of a numbered Pin moves to the next crop / layout of the same photo.
    ...(listicle ? { cropVariant: listicle.source.crop + nextVersion - 1 } : {}),
  });
  console.log(`[pinterest images] pin ${pin.id} composer ${metadata.templateType} ${describeOptimization(optimized)}`);
  return storeComposedPin({ ...params, optimized, metadata, imageModel, renderWarnings });
}

/**
 * TASK-088 — "AI-generated design" of a numbered Pin: the article photo (read
 * like the overlay path) goes to AI_IMAGE_MODEL_TEXT as a reference, one call,
 * no retry, no fallback. The model's image is stored as is (metadata
 * stripped, 1000×1500): no OmniFlow text is added. Any failure throws a
 * PinImageError before anything is stored.
 */
async function generateListicleAiDesign(params: {
  supabase: SupabaseServerClient;
  pin: Pin;
  composer: ComposerMetadata;
  userId: string;
  niche: string | null;
}): Promise<{ optimized: OptimizedImage; metadata: ComposerMetadata; imageModel: string; renderWarnings: string[] }> {
  const { pin } = params;
  const metadata = metadataForRender(params.composer, Boolean(pin.link_url));
  if (!isListicleV2(metadata)) throw new PinImageError(pin.id, 'This Pin cannot use an AI-generated design');
  const fail = (reason: string) =>
    new PinImageError(pin.id, `AI-generated design failed for the Pin "${pin.title}": ${reason}. Its previous image is kept.`);
  const reason = (error: unknown) => (error instanceof Error ? error.message : 'unknown error');

  let imageModel: string;
  let loaded: Awaited<ReturnType<typeof loadArticlePhoto>>;
  try {
    imageModel = resolveImageModel('ai-integrated').model;
    loaded = await loadArticlePhoto(metadata.source, await articleImageHosts(params.supabase, params.userId));
  } catch (error) {
    throw fail(reason(error));
  }
  const started = Date.now();
  let optimized: OptimizedImage;
  try {
    const reference = await prepareAiDesignReference(loaded.photo);
    const raw = await generateImage({
      prompt: buildListicleAiDesignPrompt({ metadata, niche: params.niche }),
      size: IMAGE_CONFIG.size,
      visualFormat: 'ai-integrated',
      reference,
    });
    const sanitized = await sanitizeFinalPinterestImage(raw);
    optimized = await optimizeImage(sanitized.buffer, 'pinterest-pin');
    if (optimized.width !== COMPOSER_CANVAS.width || optimized.height !== COMPOSER_CANVAS.height) {
      throw new Error(`the image is ${optimized.width}x${optimized.height}, expected 1000x1500`);
    }
  } catch (error) {
    // The reason only — never the prompt, the photo URL or the image data.
    console.warn(`[pinterest images] pin ${pin.id} ai-design failed after ${Date.now() - started} ms: ${reason(error)}`);
    throw fail(reason(error));
  }
  console.log(
    `[pinterest images] pin ${pin.id} composer listicle_article_image ai-design model=${imageModel} ${Date.now() - started} ms ${describeOptimization(optimized)}`
  );
  return {
    optimized,
    metadata: { ...metadata, aiRender: { imageModel, aiTextUnverified: true } },
    imageModel,
    renderWarnings: loaded.warnings,
  };
}

/**
 * Stores a composed Pin image: the new version is recorded inactive first and
 * only replaces the current image once everything is saved.
 */
async function storeComposedPin(params: {
  supabase: SupabaseServerClient;
  mediaStorage: MediaStorage;
  pin: Pin;
  userId: string;
  generationId: string;
  nextVersion: number;
  optimized: OptimizedImage;
  metadata: ComposerMetadata;
  imageModel: string;
  renderWarnings: string[];
  pinUpdate?: PinImageOptions['pinUpdate'];
}): Promise<string> {
  const { supabase, mediaStorage, pin, nextVersion, optimized, metadata, imageModel, renderWarnings, pinUpdate } = params;

  const composedPath = getPinImageObjectKey(mediaStorage.provider, {
    userId: params.userId,
    generationId: params.generationId,
    pinId: pin.id,
    version: nextVersion,
    extension: optimized.extension,
  });
  let storedComposed: StoredMedia;
  try {
    storedComposed = await mediaStorage.upload({ key: composedPath, body: optimized.buffer, contentType: optimized.contentType });
  } catch (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError instanceof Error ? uploadError.message : 'unknown error'}`);
  }
  const removeComposed = () => mediaStorage.remove([composedPath]).catch(() => undefined);

  const { data: inserted, error: insertError } = await supabase
    .from('pin_images')
    .insert({
      pin_id: pin.id,
      storage_path: composedPath,
      url: storedComposed.publicUrl,
      is_active: false,
      version: nextVersion,
      image_model: imageModel,
    })
    .select('id')
    .single();
  if (insertError || !inserted) {
    await removeComposed();
    throw new Error('Composed image record could not be saved');
  }

  const { data: previousActive } = await supabase
    .from('pin_images')
    .select('id')
    .eq('pin_id', pin.id)
    .eq('is_active', true);
  const previousIds = ((previousActive ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (previousIds.length > 0) {
    await supabase.from('pin_images').update({ is_active: false }).in('id', previousIds);
  }
  const { error: activateError } = await supabase.from('pin_images').update({ is_active: true }).eq('id', inserted.id);
  if (activateError) {
    // Back to the image the Pin had: the failed version and its file are removed.
    await supabase.from('pin_images').delete().eq('id', inserted.id);
    if (previousIds.length > 0) {
      await supabase.from('pin_images').update({ is_active: true }).in('id', previousIds);
    }
    await removeComposed();
    throw new Error('Composed image could not be activated');
  }

  // Only the image changes: text, Destination URL, board and schedule stay as they are.
  const { error: pinError } = await supabase
    .from('pins')
    .update({
      ...(pinUpdate ?? {}),
      media_url: storedComposed.publicUrl,
      image_analysis: markComposerRendered(pin.image_analysis, metadata, renderWarnings),
    })
    .eq('id', pin.id);
  if (pinError && pinUpdate) {
    // TASK-099: back to the previous image; the regenerated text is not saved either.
    await supabase.from('pin_images').update({ is_active: false }).eq('id', inserted.id);
    if (previousIds.length > 0) {
      await supabase.from('pin_images').update({ is_active: true }).in('id', previousIds);
    }
    await removeComposed();
    throw new PinImageError(pin.id, `The Pin "${pin.title}" could not be saved. Its previous text and image are kept.`);
  }
  if (pinError) {
    console.warn(`[pinterest images] pin ${pin.id} composed image saved, Pin row not updated: ${pinError.message}`);
  }
  return pin.id;
}
