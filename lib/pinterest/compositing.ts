import sharp from 'sharp';

// Deterministic, code-side replacement for asking the image model to render
// the "save this pin" banner (TASK-FIX-018). Measured real-world success rate
// asking flux.2-pro to do it in-prompt: 1/10 (7/10 banner missing entirely,
// 2/10 corrupted or truncated text) — see docs/DECISIONS.md. This function
// guarantees identical placement and legible, correct text on every pin.

const BANNER_HEIGHT_RATIO = 0.09; // of image height
const BANNER_BOTTOM_MARGIN_RATIO = 0.035; // of image height, gap below the banner
const FONT_SIZE_RATIO = 0.42; // of banner height
const BANNER_HORIZONTAL_PADDING_RATIO = 0.06; // of image width, each side
const MIN_FONT_SIZE = 18;

// Rough average glyph width for a bold sans-serif font, as a fraction of
// font-size — used only to pre-shrink text that would otherwise overflow the
// fixed-width banner, since SVG <text> does not wrap or auto-fit on its own.
const AVG_GLYPH_WIDTH_RATIO = 0.56;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Composites a fixed-position, fixed-style "save this pin" CTA banner onto an
 * already-generated pin image. Position, colors, and font size are always
 * derived the same way from the image's real dimensions — never left to a
 * model's interpretation.
 */
export async function compositeCtaBanner(imageBuffer: Buffer, text: string): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1536;

  const bannerHeight = Math.round(height * BANNER_HEIGHT_RATIO);
  const bannerY = height - bannerHeight - Math.round(height * BANNER_BOTTOM_MARGIN_RATIO);
  const horizontalPadding = Math.round(width * BANNER_HORIZONTAL_PADDING_RATIO);
  const maxTextWidth = width - horizontalPadding * 2;

  let fontSize = Math.round(bannerHeight * FONT_SIZE_RATIO);
  const estimatedTextWidth = text.length * fontSize * AVG_GLYPH_WIDTH_RATIO;
  if (estimatedTextWidth > maxTextWidth) {
    fontSize = Math.max(MIN_FONT_SIZE, Math.round(fontSize * (maxTextWidth / estimatedTextWidth)));
  }

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${bannerY}" width="${width}" height="${bannerHeight}" fill="rgba(17,17,17,0.62)" />
      <text
        x="${width / 2}"
        y="${bannerY + bannerHeight / 2}"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="#ffffff"
      >${escapeXml(text)}</text>
    </svg>
  `;

  return image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
