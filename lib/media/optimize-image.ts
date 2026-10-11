import sharp from 'sharp';
import { getMediaProfile, type MediaProfile, type MediaProfileId } from './media-profiles';

/**
 * Converts, resizes and compresses a new image for one media profile
 * (TASK-050), right before storage. Pure with respect to its input: the
 * source Buffer is never modified (and `.source` photos are never passed
 * here). On failure it throws — callers never fall back to storing the
 * original PNG.
 */

export interface OptimizedImage {
  buffer: Buffer;
  profileId: MediaProfileId;
  format: MediaProfile['format'];
  extension: MediaProfile['extension'];
  contentType: MediaProfile['contentType'];
  width: number;
  height: number;
  bytes: number;
  quality: number;
  originalBytes: number;
  originalWidth: number;
  originalHeight: number;
}

export class ImageOptimizationError extends Error {
  constructor(message: string, readonly profileId: MediaProfileId) {
    super(message);
    this.name = 'ImageOptimizationError';
  }
}

const QUALITY_STEP = 6;

function encode(pipeline: sharp.Sharp, profile: MediaProfile, quality: number): sharp.Sharp {
  switch (profile.format) {
    case 'jpeg':
      // 4:4:4 keeps thin coloured text (Pin headlines) sharp.
      return pipeline.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' });
    case 'webp':
      return pipeline.webp({ quality, alphaQuality: 100, effort: 4 });
    case 'png':
      return pipeline.png({ compressionLevel: 9 });
  }
}

async function readOrientedSize(input: Buffer, profileId: MediaProfileId) {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    throw new ImageOptimizationError('Image could not be read for optimization', profileId);
  }
  const width = metadata.autoOrient?.width ?? metadata.width;
  const height = metadata.autoOrient?.height ?? metadata.height;
  if (!width || !height) throw new ImageOptimizationError('Image has no readable dimensions', profileId);
  return { width, height };
}

async function encodeWithProfile(
  input: Buffer,
  profile: MediaProfile,
  original: { width: number; height: number }
): Promise<OptimizedImage> {
  const { resize } = profile;
  if (resize.mode === 'exact') {
    const deviation = Math.abs(original.width / original.height - resize.width / resize.height) / (resize.width / resize.height);
    if (deviation > resize.maxAspectDeviation) {
      throw new ImageOptimizationError(
        `Image is ${original.width}x${original.height}; ${profile.id} expects ${resize.width}x${resize.height} proportions (no aggressive crop)`,
        profile.id
      );
    }
  }

  let quality = profile.quality;
  for (;;) {
    // EXIF orientation applied first; sharp drops EXIF / XMP / ICC on output
    // (no withMetadata()), converting to sRGB.
    let pipeline = sharp(input).rotate();
    pipeline =
      resize.mode === 'exact'
        ? pipeline.resize({ width: resize.width, height: resize.height, fit: 'cover', position: 'centre', withoutEnlargement: true })
        : pipeline.resize({ width: resize.maxWidth, height: resize.maxHeight, fit: 'inside', withoutEnlargement: true });
    if (profile.transparency.mode === 'flatten') pipeline = pipeline.flatten({ background: profile.transparency.background });

    const { data, info } = await encode(pipeline, profile, quality).toBuffer({ resolveWithObject: true });
    if (data.byteLength <= profile.maxBytes) {
      return {
        buffer: data,
        profileId: profile.id,
        format: profile.format,
        extension: profile.extension,
        contentType: profile.contentType,
        width: info.width,
        height: info.height,
        bytes: data.byteLength,
        quality,
        originalBytes: input.byteLength,
        originalWidth: original.width,
        originalHeight: original.height,
      };
    }
    if (profile.format === 'png' || quality - QUALITY_STEP < profile.minQuality) {
      throw new ImageOptimizationError(
        `Optimized image is ${data.byteLength} bytes, above the ${profile.maxBytes}-byte limit of ${profile.id}`,
        profile.id
      );
    }
    quality -= QUALITY_STEP;
  }
}

export async function optimizeImage(
  input: Buffer,
  profileId: MediaProfileId,
  options: { log?: (message: string) => void } = {}
): Promise<OptimizedImage> {
  const profile = getMediaProfile(profileId);
  if (profile.status !== 'active') {
    // Future platforms are configuration only until a feature asks for them.
    throw new ImageOptimizationError(`Media profile ${profileId} is planned, not active`, profileId);
  }
  if (input.byteLength === 0) throw new ImageOptimizationError('Image is empty', profileId);

  const original = await readOrientedSize(input, profileId);
  try {
    return await encodeWithProfile(input, profile, original);
  } catch (error) {
    if (!profile.fallbackProfileId || error instanceof ImageOptimizationError) {
      throw error instanceof ImageOptimizationError
        ? error
        : new ImageOptimizationError(`Image optimization failed for ${profileId}`, profileId);
    }
    (options.log ?? console.warn)(`[media] ${profileId} encoding failed; using explicit fallback ${profile.fallbackProfileId}`);
    try {
      return await encodeWithProfile(input, getMediaProfile(profile.fallbackProfileId), original);
    } catch (fallbackError) {
      throw fallbackError instanceof ImageOptimizationError
        ? fallbackError
        : new ImageOptimizationError(`Image optimization failed for ${profileId} and its fallback`, profileId);
    }
  }
}

/** One technical log line — sizes and formats only. */
export function describeOptimization(image: OptimizedImage): string {
  const kb = (bytes: number) => `${Math.round(bytes / 1024)}KB`;
  return `${image.profileId} ${image.originalWidth}x${image.originalHeight} ${kb(image.originalBytes)} → ${image.width}x${image.height} ${image.format} q${image.quality} ${kb(image.bytes)}`;
}
