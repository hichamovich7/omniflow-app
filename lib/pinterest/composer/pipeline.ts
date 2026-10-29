import { optimizeImage, type OptimizedImage } from '@/lib/media/optimize-image';
import { composerPhotoInstruction, isStepByStepV2, STEP_PANEL_COUNT, type ComposerMetadata } from './content';
import { COMPOSER_CANVAS, ComposerRenderError, renderComposedPin, type ComposedPin } from './render';

/**
 * Pinterest Template Composer (TASK-079) — from the provider photos to the
 * stored Pin file. One image call per Pin (Step-by-step v2: one more per step
 * panel), made by the caller; the rest is local and in memory. Throws on any
 * failure: the caller stores nothing.
 */

export interface ComposedPinImage {
  optimized: OptimizedImage;
  composed: ComposedPin;
  /** The contract actually rendered (a CTA is dropped once the Pin has no Destination URL). */
  metadata: ComposerMetadata;
}

const STEP_V2_FINISHED_PHOTO = [
  'COMPOSED STEP-BY-STEP PIN — FINISHED PROJECT PHOTO. OmniFlow places this photo in a framed panel and adds every title, number and step itself.',
  'Generate one single photograph of the finished project: no collage, no panels, no grid, no frames, no split layout, no step sequence.',
  'No text, letters, numbers, labels, logos or lists anywhere in the image.',
  'Keep the whole finished project centred with calm space around it.',
].join('\n');

/** The image prompt of a composed Pin's main photo: the usual prompt and brief, then the photo-only instruction. */
export function composerImagePrompt(basePrompt: string, metadata: ComposerMetadata): string {
  const instruction = isStepByStepV2(metadata) ? STEP_V2_FINISHED_PHOTO : composerPhotoInstruction(metadata.templateType);
  return [basePrompt, '', instruction].join('\n');
}

/** Image calls one composed Pin makes: 1, or 1 + one per step panel for Step-by-step v2. */
export function composerImageCallCount(metadata: ComposerMetadata): number {
  return isStepByStepV2(metadata) ? 1 + STEP_PANEL_COUNT : 1;
}

/**
 * The stored text is rendered as is — a regeneration never rewrites it. The
 * only change: a Hero CTA is left out when the Pin no longer has a
 * Destination URL (never added when one appears later).
 */
export function metadataForRender(metadata: ComposerMetadata, hasDestination: boolean): ComposerMetadata {
  if (metadata.templateType !== 'hero' || hasDestination || metadata.text.cta === null) return metadata;
  return { ...metadata, text: { ...metadata.text, cta: null } };
}

export async function composePinImage(input: {
  photo: Buffer;
  /** Step-by-step v2 only: one photo per step panel, in panel order. */
  stepPhotos?: Buffer[];
  metadata: ComposerMetadata;
  hasDestination: boolean;
}): Promise<ComposedPinImage> {
  const metadata = metadataForRender(input.metadata, input.hasDestination);
  const composed = await renderComposedPin(input.photo, metadata, input.stepPhotos ?? []);
  const optimized = await optimizeImage(composed.buffer, 'pinterest-pin');
  if (optimized.width !== COMPOSER_CANVAS.width || optimized.height !== COMPOSER_CANVAS.height) {
    throw new ComposerRenderError(`Composed Pin is ${optimized.width}x${optimized.height}, expected 1000x1500`);
  }
  return { optimized, composed, metadata };
}
