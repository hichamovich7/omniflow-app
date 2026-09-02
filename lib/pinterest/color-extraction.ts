import sharp from 'sharp';

// Deterministic accent-color extraction for the banner compositing (TASK-FIX-020).
// No color-extraction library added: sharp's own `.stats().dominant` was tested
// first (see docs/DECISIONS.md) and returns the single most-common histogram
// color, which for real generated photos is consistently a near-neutral
// wall/floor gray or beige — not a vibrant accent. node-vibrant would fix that,
// but its Node image backend (@vibrant/image-node) depends on Jimp purely to
// decode pixels, duplicating what sharp (already a direct dependency) does
// natively and faster. This file reimplements just the needed piece —
// quantize-then-score-by-saturation, the same core idea Android Palette /
// Vibrant.js use — directly on sharp's raw pixel output. No new dependency.

export interface AccentColorResult {
  /** null means extraction failed or produced no usable accent — callers must fall back to the existing neutral dark banner style. */
  accentColor: { r: number; g: number; b: number } | null;
  /** Chosen deterministically from WCAG contrast ratio against the accent color — never a guess. Meaningless (ignored by callers) when accentColor is null. */
  textColor: '#ffffff' | '#141414';
}

const NEUTRAL_RESULT: AccentColorResult = { accentColor: null, textColor: '#ffffff' };

// Point-sampling grid (TASK-FIX-022): reading real pixels directly at evenly
// spaced coordinates, no resize/interpolation. A prior resize-to-64x64 pass
// blended small saturated objects (e.g. a yarn ball ~150px wide in a
// 1696px-wide photo) into ~5 blurred pixels, erasing their saturation before
// they could ever be scored. A 96x96 point grid samples ~9.2k real pixels
// directly from the source buffer, cheap to compute and immune to that blur.
const GRID_POINTS_PER_AXIS = 96;
const BUCKET_STEP = 24; // per-channel quantization bucket width (0-255)
const MIN_SATURATION = 0.18; // below this, the image is too desaturated for a "vibrant" accent to mean anything
// Raised from 0.08 (TASK-FIX-022): HSL saturation is unstable near-black — a
// small absolute channel spread (e.g. rgb(51,28,8)) yields a deceptively high
// "saturation" for what is really a dark shadow fleck, not a vibrant color.
const MIN_LIGHTNESS = 0.15;
const MAX_LIGHTNESS = 0.92; // guards against a near-pure-white candidate slipping through
const MIN_CONTRAST_RATIO = 3.0; // WCAG AA minimum for large/bold text (our banner text qualifies)
// Hard floor (TASK-FIX-022): a bucket below this share of sampled pixels is
// excluded from scoring entirely, not merely down-weighted — a handful of
// stray pixels must never outrank a well-represented color.
const MIN_POPULATION_RATIO = 0.02;

function getSaturationLightness(r: number, g: number, b: number): { s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  return { s, l };
}

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

// WCAG 2.0 relative luminance — the standard, deterministic basis for contrast
// ratio, not a hand-tuned brightness heuristic.
function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export async function extractAccentColor(imageBuffer: Buffer): Promise<AccentColorResult> {
  try {
    const { data, info } = await sharp(imageBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    const buckets = new Map<string, { count: number; rSum: number; gSum: number; bSum: number }>();
    let totalSamples = 0;

    for (let gy = 0; gy < GRID_POINTS_PER_AXIS; gy++) {
      const y = Math.min(height - 1, Math.floor(((gy + 0.5) * height) / GRID_POINTS_PER_AXIS));
      for (let gx = 0; gx < GRID_POINTS_PER_AXIS; gx++) {
        const x = Math.min(width - 1, Math.floor(((gx + 0.5) * width) / GRID_POINTS_PER_AXIS));
        const idx = (y * width + x) * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const key = `${Math.round(r / BUCKET_STEP)}_${Math.round(g / BUCKET_STEP)}_${Math.round(b / BUCKET_STEP)}`;
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.count++;
          bucket.rSum += r;
          bucket.gSum += g;
          bucket.bSum += b;
        } else {
          buckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
        }
        totalSamples++;
      }
    }

    let best: { r: number; g: number; b: number; score: number } | null = null;

    for (const bucket of buckets.values()) {
      // Hard population floor — excluded from the competition entirely, not
      // just down-weighted, so a stray fleck can never outscore a
      // well-represented color regardless of its saturation.
      if (bucket.count / totalSamples < MIN_POPULATION_RATIO) continue;

      const r = bucket.rSum / bucket.count;
      const g = bucket.gSum / bucket.count;
      const b = bucket.bSum / bucket.count;
      const { s, l } = getSaturationLightness(r, g, b);

      if (l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) continue;

      // Same spirit as Android Palette / Vibrant.js's target-based swatch
      // scoring: favor saturated, mid-lightness, well-represented colors —
      // never just "whatever is most common" (that's sharp's own `dominant`,
      // proven too neutral on real photos).
      const lightnessConfidence = 1 - Math.abs(l - 0.5) * 2; // 1 at l=0.5, 0 at the extremes
      // Saturation is dampened by the same confidence factor, so a color
      // near black/white can no longer dominate purely on a raw-HSL-saturation
      // artifact — it must also sit near mid-lightness to score highly.
      const dampenedSaturation = s * lightnessConfidence;
      const populationScore = Math.sqrt(bucket.count / totalSamples);
      const score = dampenedSaturation * 0.6 + lightnessConfidence * 0.2 + populationScore * 0.2;

      if (!best || score > best.score) {
        best = { r, g, b, score };
      }
    }

    if (!best) return NEUTRAL_RESULT;

    const { s: bestSaturation, l: bestLightness } = getSaturationLightness(best.r, best.g, best.b);
    if (bestSaturation < MIN_SATURATION || bestLightness < MIN_LIGHTNESS || bestLightness > MAX_LIGHTNESS) {
      return NEUTRAL_RESULT;
    }

    const luminance = relativeLuminance(best.r, best.g, best.b);
    const contrastWithWhite = contrastRatio(luminance, 1);
    const contrastWithBlack = contrastRatio(luminance, 0);
    const bestContrast = Math.max(contrastWithWhite, contrastWithBlack);

    if (bestContrast < MIN_CONTRAST_RATIO) return NEUTRAL_RESULT;

    return {
      accentColor: { r: Math.round(best.r), g: Math.round(best.g), b: Math.round(best.b) },
      textColor: contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#141414',
    };
  } catch {
    return NEUTRAL_RESULT;
  }
}
