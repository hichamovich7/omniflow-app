import type { SocialContentGeneration } from '@/lib/social/social-content';
import type { SocialPublication } from '@/lib/social/facebook-publication';

/**
 * Facebook image variants (TASK-101). The person can keep the WordPress
 * article image of a draft (default) or explicitly generate 1 to 3
 * alternatives, preview them and choose one. `image_url` on the draft stays
 * the selected image — the one "Publish now" and "Schedule" send.
 *
 * Rules:
 * - Generating never changes the selected image; only selectFacebookImage().
 * - Nothing here calls Meta or WordPress, or writes `social_publications`.
 * - The trial quota is reserved (1 unit per image call, all or nothing)
 *   before the first paid call.
 * - Partial failure: the successful variants are kept and returned with the
 *   failed positions.
 * - Generation and selection are refused while the post is scheduled,
 *   being published or already on Facebook.
 *
 * Client-safe: type-only imports; the server wiring (AI, optimisation,
 * storage, database) is injected by the routes.
 */

export const FACEBOOK_IMAGE_VARIANT_MAX = 3;
export const FACEBOOK_IMAGE_VARIANT_PROFILE = 'facebook-feed-portrait' as const;
/** Provider output size (2:3), cropped to 4:5 by the media profile. */
export const FACEBOOK_IMAGE_GENERATION_SIZE = '1024x1536';

/** Publication statuses that lock the draft's image (the post is engaged or on Facebook). */
export const IMAGE_LOCKED_STATUSES: ReadonlyArray<SocialPublication['status']> = ['scheduled', 'publishing', 'published', 'partial'];

export interface VariantAngle {
  id: 'hero' | 'lifestyle' | 'detail';
  label: string;
  direction: string;
}

/** Distinct visual angles, used in this order (1 → hero, 2 → + lifestyle, 3 → + detail). */
export const FACEBOOK_VARIANT_ANGLES: readonly VariantAngle[] = [
  {
    id: 'hero',
    label: 'Hero shot',
    direction: 'A clean hero shot of the main subject, front and centre, on a simple uncluttered background, soft natural light.',
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle scene',
    direction: 'A lifestyle scene showing the main subject in real use, in a warm, natural everyday setting, with a person or hands only if it fits the topic.',
  },
  {
    id: 'detail',
    label: 'Close-up detail',
    direction: 'A close-up detail shot of the main subject that shows texture, materials and craftsmanship, shallow depth of field.',
  },
];

export interface FacebookImageVariant {
  id: string;
  user_id: string;
  social_content_generation_id: string;
  batch_id: string;
  position: number;
  angle: string;
  prompt: string;
  image_url: string;
  image_alt: string | null;
  storage_key: string;
  media_profile: string;
  width: number | null;
  height: number | null;
  image_model: string | null;
  created_at: string;
}

export type NewImageVariant = Omit<FacebookImageVariant, 'id' | 'created_at'>;

export type ImageVariantErrorCode =
  | 'not_found'
  | 'invalid_count'
  | 'image_locked'
  | 'trial_limit'
  | 'quota_unavailable'
  | 'variant_not_found'
  | 'update_failed';

export const IMAGE_VARIANT_ERROR_STATUS: Record<ImageVariantErrorCode, number> = {
  not_found: 404,
  invalid_count: 400,
  image_locked: 409,
  trial_limit: 403,
  quota_unavailable: 503,
  variant_not_found: 404,
  update_failed: 500,
};

export const IMAGE_LOCKED_MESSAGE =
  'This post is scheduled, being published or already on Facebook: its image can no longer be changed. Cancel the schedule first to change it.';

export class ImageVariantError extends Error {
  readonly status: number;
  constructor(
    readonly code: ImageVariantErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ImageVariantError';
    this.status = IMAGE_VARIANT_ERROR_STATUS[code];
  }
}

/** True when the draft's image must not change (generation and selection refused). */
export function imageChangeLocked(publication: Pick<SocialPublication, 'status'> | null): boolean {
  return Boolean(publication && IMAGE_LOCKED_STATUSES.includes(publication.status));
}

/** Text of the draft reduced to plain words for the prompt: no links, no markdown, no hashtags. */
function plainExcerpt(markdown: string, max = 600): string {
  const text = markdown
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_`>[\]()~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text;
}

/** One image prompt per angle, from the draft's title and content only (no visual reference in V1). */
export function buildVariantPrompt(source: { title: string; content: string }, angle: VariantAngle): string {
  return [
    `Photograph for a Facebook post about: "${source.title.trim()}".`,
    `Context from the post: ${plainExcerpt(source.content)}`,
    `Visual angle: ${angle.direction}`,
    'Vertical 4:5 composition: keep the main subject centred with generous empty margins at the top and bottom (the image is cropped from 2:3 to 4:5).',
    'Photorealistic, high quality, natural colours.',
    'No text, no letters, no words, no logos, no watermark, no frames, no collage.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Generation

export interface StoredVariantImage {
  url: string;
  key: string;
  width: number | null;
  height: number | null;
}

export interface VariantStore {
  insertVariant(row: NewImageVariant): Promise<FacebookImageVariant | null>;
  /** Only the caller's own variant (user filter + RLS). */
  getVariant(id: string): Promise<FacebookImageVariant | null>;
  /** Only the caller's own Facebook draft. */
  updateDraftImage(
    generationId: string,
    patch: Pick<SocialContentGeneration, 'image_url' | 'image_alt'> & {
      selected_image_variant_id: string | null;
      source_image_url?: string | null;
      source_image_alt?: string | null;
    }
  ): Promise<SocialContentGeneration | null>;
}

export interface GenerateVariantsDeps {
  store: VariantStore;
  /** Atomic all-or-nothing reservation of `units` trial units, before any paid call. */
  reserveUnits(units: number): Promise<'reserved' | 'trial_limit' | 'unavailable'>;
  generateImage(params: { prompt: string; size: string }): Promise<Buffer>;
  /** Optimises to facebook-feed-portrait and stores under images/facebook/. */
  storeImage(input: { userId: string; generationId: string; batchId: string; position: number; body: Buffer }): Promise<StoredVariantImage>;
  newId(): string;
  imageModel?: string | null;
}

export type DraftForVariants = Pick<
  SocialContentGeneration,
  'id' | 'user_id' | 'platform' | 'title' | 'content_markdown' | 'image_url' | 'image_alt' | 'source_image_url' | 'source_image_alt' | 'selected_image_variant_id'
>;

export interface VariantFailure {
  position: number;
  angle: string;
  message: string;
}

export interface GenerateVariantsResult {
  batchId: string;
  /** Image calls launched = trial units counted. */
  unitsUsed: number;
  variants: FacebookImageVariant[];
  failures: VariantFailure[];
}

export const VARIANT_FAILED_MESSAGE = 'This image could not be generated (the attempt still counts as 1 image call). Try again later.';

function assertDraft(draft: DraftForVariants | null): asserts draft is DraftForVariants {
  if (!draft || draft.platform !== 'facebook') throw new ImageVariantError('not_found', 'Content not found');
}

export async function generateFacebookImageVariants(
  input: { draft: DraftForVariants | null; publication: Pick<SocialPublication, 'status'> | null; count: number },
  deps: GenerateVariantsDeps
): Promise<GenerateVariantsResult> {
  const { draft, publication, count } = input;
  assertDraft(draft);
  if (!Number.isInteger(count) || count < 1 || count > FACEBOOK_IMAGE_VARIANT_MAX) {
    throw new ImageVariantError('invalid_count', `Choose between 1 and ${FACEBOOK_IMAGE_VARIANT_MAX} images.`);
  }
  if (imageChangeLocked(publication)) throw new ImageVariantError('image_locked', IMAGE_LOCKED_MESSAGE);

  // Quota first: nothing is generated unless every call of the request is counted.
  const reservation = await deps.reserveUnits(count);
  if (reservation === 'trial_limit') {
    throw new ImageVariantError('trial_limit', `Not enough trial generations left for ${count} image${count > 1 ? 's' : ''}.`);
  }
  if (reservation !== 'reserved') {
    throw new ImageVariantError('quota_unavailable', 'Your generation quota could not be checked. Nothing was generated — try again in a moment.');
  }

  const batchId = deps.newId();
  const angles = FACEBOOK_VARIANT_ANGLES.slice(0, count);
  const settled = await Promise.allSettled(
    angles.map(async (angle, index) => {
      const position = index + 1;
      const prompt = buildVariantPrompt({ title: draft.title, content: draft.content_markdown }, angle);
      const buffer = await deps.generateImage({ prompt, size: FACEBOOK_IMAGE_GENERATION_SIZE });
      const stored = await deps.storeImage({ userId: draft.user_id, generationId: draft.id, batchId, position, body: buffer });
      const row = await deps.store.insertVariant({
        user_id: draft.user_id,
        social_content_generation_id: draft.id,
        batch_id: batchId,
        position,
        angle: angle.id,
        prompt,
        image_url: stored.url,
        image_alt: draft.title,
        storage_key: stored.key,
        media_profile: FACEBOOK_IMAGE_VARIANT_PROFILE,
        width: stored.width,
        height: stored.height,
        image_model: deps.imageModel ?? null,
      });
      if (!row) throw new Error('variant not saved');
      return row;
    })
  );

  const variants: FacebookImageVariant[] = [];
  const failures: VariantFailure[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      variants.push(result.value);
    } else {
      // Error class only — never the prompt, a URL or provider details.
      console.error(`[facebook] image variant ${index + 1} failed: ${result.reason instanceof Error ? result.reason.name : 'unknown error'}`);
      failures.push({ position: index + 1, angle: angles[index].label, message: VARIANT_FAILED_MESSAGE });
    }
  });
  return { batchId, unitsUsed: count, variants, failures };
}

// ---------------------------------------------------------------------------
// Selection

/**
 * Makes a variant the draft's image, or (variantId null) goes back to the
 * WordPress image. The variant must belong to this draft and this user. The
 * WordPress image is kept in source_image_url the first time a variant is
 * chosen, so going back always restores it.
 */
export async function selectFacebookImage(
  input: { draft: DraftForVariants | null; publication: Pick<SocialPublication, 'status'> | null; variantId: string | null },
  deps: { store: VariantStore }
): Promise<SocialContentGeneration | DraftForVariants> {
  const { draft, publication, variantId } = input;
  assertDraft(draft);
  if (imageChangeLocked(publication)) throw new ImageVariantError('image_locked', IMAGE_LOCKED_MESSAGE);
  const current = draft.selected_image_variant_id ?? null;

  let patch: Parameters<VariantStore['updateDraftImage']>[1];
  if (variantId === null) {
    if (!current) return draft; // Already the WordPress image.
    patch = { image_url: draft.source_image_url ?? null, image_alt: draft.source_image_alt ?? null, selected_image_variant_id: null };
  } else {
    const variant = await deps.store.getVariant(variantId);
    if (!variant || variant.user_id !== draft.user_id || variant.social_content_generation_id !== draft.id) {
      throw new ImageVariantError('variant_not_found', 'This image does not belong to this post.');
    }
    if (current === variant.id) return draft;
    patch = {
      image_url: variant.image_url,
      image_alt: variant.image_alt,
      selected_image_variant_id: variant.id,
      // First switch away from the WordPress image: keep it to go back later.
      ...(current ? {} : { source_image_url: draft.image_url, source_image_alt: draft.image_alt }),
    };
  }
  const updated = await deps.store.updateDraftImage(draft.id, patch);
  if (!updated) throw new ImageVariantError('update_failed', 'The image could not be changed. Please try again.');
  return updated;
}

/** The WordPress image of a draft (what "Use the WordPress image" restores). */
export function wordpressImageOf(draft: Pick<DraftForVariants, 'image_url' | 'image_alt' | 'source_image_url' | 'source_image_alt' | 'selected_image_variant_id'>) {
  return draft.selected_image_variant_id
    ? { url: draft.source_image_url ?? null, alt: draft.source_image_alt ?? null }
    : { url: draft.image_url, alt: draft.image_alt };
}
