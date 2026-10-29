import sharp from 'sharp';
import { RENDERER_FONT_PATHS } from '@/lib/pinterest/text-layout';
import {
  isStepByStepV2,
  type ComposerHeroText,
  type ComposerMaterialsText,
  type ComposerMetadata,
  type ComposerStepsText,
  type ComposerStepsV2Text,
  type StepByStepV2Metadata,
} from './content';

/**
 * Pinterest Template Composer (TASK-079) — deterministic rendering. The
 * provider photo (no text) becomes the background; every word is drawn by
 * Sharp/Pango with the bundled Inter fonts (accents, ß, ñ…), wrapped and
 * shrunk to fit its box, on opaque panels so contrast never depends on the
 * photo. In memory only: no temporary file is written. A text that cannot fit
 * throws — no partial image is ever returned.
 */

export const COMPOSER_CANVAS = { width: 1000, height: 1500 } as const;
// Same safe margins as the banner renderer (5 % / 4 %), rounded up.
const MARGIN_X = 60;
const MARGIN_Y = 64;
const CONTENT_WIDTH = COMPOSER_CANVAS.width - MARGIN_X * 2;
export const COMPOSER_MIN_CONTRAST = 4.5;

export const COMPOSER_PALETTE = {
  ink: '#1E2427',
  muted: '#454B4F',
  panel: '#FAF6F0',
  card: '#FFFFFF',
  cardBorder: '#E4DACD',
  accent: '#8A3A1C',
  onAccent: '#FFFFFF',
} as const;

export class ComposerRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComposerRenderError';
  }
}

export interface ComposedPin {
  /** PNG, 1000×1500 — optimized to the pinterest-pin JPEG profile by the caller. */
  buffer: Buffer;
  width: number;
  height: number;
  /** Lowest WCAG contrast ratio among the drawn text/background pairs. */
  minContrast: number;
  /** Where the Hero title panel was placed; null for the other templates. */
  heroPlacement: 'top' | 'bottom' | null;
}

// ── Colour contrast ────────────────────────────────────────────────────────

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio of two opaque colours. */
export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

// ── Text ─────────────────────────────────────────────────────────────────

function escapeMarkup(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface TextBox {
  width: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  weight: 600 | 700;
  color: string;
  align?: 'left' | 'centre';
  /** Extra line spacing, as a share of the font size. */
  leading?: number;
}

interface RenderedText {
  input: Buffer;
  width: number;
  height: number;
  fontSize: number;
}

async function rasterize(markup: string, box: TextBox, size: number, wrapWidth: number | null) {
  return sharp({
    text: {
      text: `<span foreground="${box.color}" weight="${box.weight}">${markup}</span>`,
      font: `Inter ${size}`,
      fontfile: box.weight >= 700 ? RENDERER_FONT_PATHS[700] : RENDERER_FONT_PATHS[600],
      ...(wrapWidth ? { width: wrapWidth, wrap: 'word-char' as const } : {}),
      align: box.align ?? 'left',
      spacing: Math.round(size * (box.leading ?? 0.14)),
      dpi: 72,
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

/**
 * Wraps (word, then character for long compounds) and shrinks until the text
 * fits its box. With `noWrapDownTo`, sizes down to that one are first tried
 * without any wrapped line (lists keep one line per item when it stays
 * readable); only then may lines wrap.
 */
async function renderMarkup(markup: string, box: TextBox, role: string, options: { noWrapDownTo?: number } = {}): Promise<RenderedText> {
  if (options.noWrapDownTo) {
    for (let size = box.maxSize; size >= Math.max(options.noWrapDownTo, box.minSize); size -= 2) {
      const unwrapped = await rasterize(markup, box, size, null);
      if (unwrapped.info.width > box.width) continue;
      const { data, info } = await rasterize(markup, box, size, box.width);
      if (info.width <= box.width && info.height <= box.maxHeight) {
        return { input: data, width: info.width, height: info.height, fontSize: size };
      }
    }
  }
  for (let size = box.maxSize; size >= box.minSize; size -= 2) {
    const { data, info } = await rasterize(markup, box, size, box.width);
    if (info.width <= box.width && info.height <= box.maxHeight) {
      return { input: data, width: info.width, height: info.height, fontSize: size };
    }
  }
  throw new ComposerRenderError(`${role} does not fit its area at the minimum font size`);
}

function renderText(text: string, box: TextBox, role: string): Promise<RenderedText> {
  return renderMarkup(escapeMarkup(text), box, role);
}

// ── Canvas helpers ─────────────────────────────────────────────────────────

async function coverPhoto(photo: Buffer, width: number, height: number): Promise<Buffer> {
  try {
    return await sharp(photo)
      .rotate()
      .resize({ width, height, fit: 'cover', position: sharp.strategy.attention })
      .removeAlpha()
      .png()
      .toBuffer();
  } catch {
    throw new ComposerRenderError('The generated photo could not be read');
  }
}

/** The calmer of the top and bottom thirds (lower luminance spread) — the main subject is usually elsewhere. */
async function quieterEdge(photo: Buffer): Promise<'top' | 'bottom'> {
  const height = Math.round(COMPOSER_CANVAS.height * 0.3);
  const spread = async (top: number) => {
    const stats = await sharp(photo)
      .extract({ left: 0, top, width: COMPOSER_CANVAS.width, height })
      .greyscale()
      .stats();
    return stats.channels[0].stdev;
  };
  const [top, bottom] = await Promise.all([spread(0), spread(COMPOSER_CANVAS.height - height)]);
  return top < bottom ? 'top' : 'bottom';
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  radius?: number;
  stroke?: string;
}

function shapesSvg(rects: Rect[]): Buffer {
  const body = rects
    .map(
      (rect) =>
        `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${rect.radius ?? 0}" fill="${rect.fill}"${
          rect.stroke ? ` stroke="${rect.stroke}" stroke-width="2"` : ''
        }/>`
    )
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${COMPOSER_CANVAS.width}" height="${COMPOSER_CANVAS.height}">${body}</svg>`
  );
}

interface Placed {
  text: RenderedText;
  left: number;
  top: number;
}

class ContrastLog {
  private ratios: number[] = [];
  use(foreground: string, background: string) {
    this.ratios.push(contrastRatio(foreground, background));
  }
  get min(): number {
    return this.ratios.length ? Math.min(...this.ratios) : 21;
  }
}

async function finish(
  background: Buffer,
  rects: Rect[],
  placed: Placed[],
  contrast: ContrastLog,
  heroPlacement: ComposedPin['heroPlacement']
): Promise<ComposedPin> {
  if (contrast.min < COMPOSER_MIN_CONTRAST) {
    throw new ComposerRenderError(`Text contrast ${contrast.min.toFixed(2)} is below ${COMPOSER_MIN_CONTRAST}`);
  }
  for (const item of placed) {
    const inside =
      item.left >= MARGIN_X &&
      item.top >= MARGIN_Y / 2 &&
      item.left + item.text.width <= COMPOSER_CANVAS.width - MARGIN_X &&
      item.top + item.text.height <= COMPOSER_CANVAS.height - MARGIN_Y / 2;
    if (!inside) throw new ComposerRenderError('A text block would touch the edge of the Pin');
  }
  const buffer = await sharp({
    create: { width: COMPOSER_CANVAS.width, height: COMPOSER_CANVAS.height, channels: 3, background: COMPOSER_PALETTE.panel },
  })
    .composite([
      { input: background, left: 0, top: 0 },
      { input: shapesSvg(rects), left: 0, top: 0 },
      ...placed.map((item) => ({ input: item.text.input, left: Math.round(item.left), top: Math.round(item.top) })),
    ])
    .png()
    .toBuffer();
  return { buffer, width: COMPOSER_CANVAS.width, height: COMPOSER_CANVAS.height, minContrast: contrast.min, heroPlacement };
}

// ── Templates ──────────────────────────────────────────────────────────────

async function renderHero(photo: Buffer, text: ComposerHeroText): Promise<ComposedPin> {
  const background = await coverPhoto(photo, COMPOSER_CANVAS.width, COMPOSER_CANVAS.height);
  const placement = await quieterEdge(background);
  const contrast = new ContrastLog();
  const pad = 44;
  const innerWidth = CONTENT_WIDTH - pad * 2;
  const gap = 26;

  const title = await renderText(text.title, { width: innerWidth, maxHeight: 330, maxSize: 76, minSize: 44, weight: 700, color: COMPOSER_PALETTE.ink, leading: 0.08 }, 'Hero title');
  contrast.use(COMPOSER_PALETTE.ink, COMPOSER_PALETTE.panel);
  const subtitle = text.subtitle
    ? await renderText(text.subtitle, { width: innerWidth, maxHeight: 120, maxSize: 38, minSize: 26, weight: 600, color: COMPOSER_PALETTE.muted }, 'Hero subtitle')
    : null;
  if (subtitle) contrast.use(COMPOSER_PALETTE.muted, COMPOSER_PALETTE.panel);
  const cta = text.cta
    ? await renderText(text.cta, { width: innerWidth - 56, maxHeight: 44, maxSize: 30, minSize: 22, weight: 700, color: COMPOSER_PALETTE.onAccent }, 'Hero CTA')
    : null;
  if (cta) contrast.use(COMPOSER_PALETTE.onAccent, COMPOSER_PALETTE.accent);

  const ctaHeight = cta ? cta.height + 24 : 0;
  const cardHeight = pad + title.height + (subtitle ? gap + subtitle.height : 0) + (cta ? gap + 6 + ctaHeight : 0) + pad;
  if (cardHeight > COMPOSER_CANVAS.height * 0.4) {
    throw new ComposerRenderError('The Hero text panel would cover too much of the photo');
  }
  const cardY = placement === 'top' ? MARGIN_Y : COMPOSER_CANVAS.height - MARGIN_Y - cardHeight;
  const rects: Rect[] = [{ x: MARGIN_X, y: cardY, width: CONTENT_WIDTH, height: cardHeight, fill: COMPOSER_PALETTE.panel, radius: 28 }];
  const placed: Placed[] = [];
  let cursor = cardY + pad;
  placed.push({ text: title, left: MARGIN_X + pad, top: cursor });
  cursor += title.height;
  if (subtitle) {
    cursor += gap;
    placed.push({ text: subtitle, left: MARGIN_X + pad, top: cursor });
    cursor += subtitle.height;
  }
  if (cta) {
    cursor += gap + 6;
    rects.push({ x: MARGIN_X + pad, y: cursor, width: cta.width + 56, height: ctaHeight, fill: COMPOSER_PALETTE.accent, radius: ctaHeight / 2 });
    placed.push({ text: cta, left: MARGIN_X + pad + 28, top: cursor + 12 });
  }
  return finish(background, rects, placed, contrast, placement);
}

/** One list block (stable line spacing), accent bullets, one line per item whenever a size allows it. */
function renderList(items: string[], width: number, maxHeight: number, role: string, maxSize = 34): Promise<RenderedText> {
  const markup = items
    .map((item) => `<span foreground="${COMPOSER_PALETTE.accent}">•</span>  ${escapeMarkup(item)}`)
    .join('\n');
  return renderMarkup(markup, { width, maxHeight, maxSize, minSize: 22, weight: 600, color: COMPOSER_PALETTE.ink, leading: 0.32 }, role, { noWrapDownTo: 28 });
}

async function renderMaterials(photo: Buffer, text: ComposerMaterialsText): Promise<ComposedPin> {
  const photoHeight = 800;
  const background = await coverPhoto(photo, COMPOSER_CANVAS.width, photoHeight);
  const contrast = new ContrastLog();
  const placed: Placed[] = [];
  const rects: Rect[] = [{ x: 0, y: photoHeight, width: COMPOSER_CANVAS.width, height: 8, fill: COMPOSER_PALETTE.accent }];
  const bottom = COMPOSER_CANVAS.height - MARGIN_Y;
  let cursor = photoHeight + 44;

  if (text.title) {
    const title = await renderText(text.title, { width: CONTENT_WIDTH, maxHeight: 120, maxSize: 46, minSize: 30, weight: 700, color: COMPOSER_PALETTE.ink }, 'Materials title');
    contrast.use(COMPOSER_PALETTE.ink, COMPOSER_PALETTE.panel);
    placed.push({ text: title, left: MARGIN_X, top: cursor });
    cursor += title.height + 26;
  }

  const hasTools = Boolean(text.toolsLabel) && text.tools.length > 0;
  const gutter = 40;
  const leftWidth = hasTools ? Math.round((CONTENT_WIDTH - gutter) * 0.58) : CONTENT_WIDTH;
  const rightWidth = CONTENT_WIDTH - gutter - leftWidth;
  const columns: Array<{ label: string; items: string[]; left: number; width: number }> = [
    { label: text.label, items: text.items, left: MARGIN_X, width: leftWidth },
    ...(hasTools && text.toolsLabel ? [{ label: text.toolsLabel, items: text.tools, left: MARGIN_X + leftWidth + gutter, width: rightWidth }] : []),
  ];
  const rendered = [];
  for (const column of columns) {
    const label = await renderText(column.label, { width: column.width, maxHeight: 50, maxSize: 34, minSize: 24, weight: 700, color: COMPOSER_PALETTE.accent }, 'Materials label');
    contrast.use(COMPOSER_PALETTE.accent, COMPOSER_PALETTE.panel);
    const listTop = cursor + label.height + 16;
    const list = await renderList(column.items, column.width, bottom - listTop, 'Materials list');
    contrast.use(COMPOSER_PALETTE.ink, COMPOSER_PALETTE.panel);
    rendered.push({ column, label, listTop, list });
  }
  // Both columns share one list size.
  const listSize = Math.min(...rendered.map((item) => item.list.fontSize));
  for (const item of rendered) {
    const list = item.list.fontSize === listSize
      ? item.list
      : await renderList(item.column.items, item.column.width, bottom - item.listTop, 'Materials list', listSize);
    placed.push({ text: item.label, left: item.column.left, top: cursor }, { text: list, left: item.column.left, top: item.listTop });
  }
  return finish(background, rects, placed, contrast, null);
}

async function renderSteps(photo: Buffer, text: ComposerStepsText): Promise<ComposedPin> {
  const photoHeight = 640;
  const background = await coverPhoto(photo, COMPOSER_CANVAS.width, photoHeight);
  const contrast = new ContrastLog();
  const placed: Placed[] = [];
  const rects: Rect[] = [{ x: 0, y: photoHeight, width: COMPOSER_CANVAS.width, height: 8, fill: COMPOSER_PALETTE.accent }];
  let cursor = photoHeight + 36;

  if (text.title) {
    const title = await renderText(text.title, { width: CONTENT_WIDTH, maxHeight: 110, maxSize: 44, minSize: 30, weight: 700, color: COMPOSER_PALETTE.ink }, 'Steps title');
    contrast.use(COMPOSER_PALETTE.ink, COMPOSER_PALETTE.panel);
    placed.push({ text: title, left: MARGIN_X, top: cursor });
    cursor += title.height + 24;
  }

  const gap = 14;
  const count = text.steps.length;
  const cardHeight = Math.floor((COMPOSER_CANVAS.height - MARGIN_Y - cursor - gap * (count - 1)) / count);
  if (cardHeight < 72) throw new ComposerRenderError('The step cards do not fit below the photo');
  const pad = 22;
  const labels: RenderedText[] = [];
  for (const step of text.steps) {
    labels.push(await renderText(step.label, { width: 220, maxHeight: Math.min(48, cardHeight - 24), maxSize: 28, minSize: 18, weight: 700, color: COMPOSER_PALETTE.onAccent }, 'Step label'));
    contrast.use(COMPOSER_PALETTE.onAccent, COMPOSER_PALETTE.accent);
  }
  // One badge width for every card, so the step titles line up.
  const badgeWidth = Math.max(...labels.map((label) => Math.max(label.width + 32, label.height + 16)));

  for (const [index, step] of text.steps.entries()) {
    const top = cursor + index * (cardHeight + gap);
    rects.push({ x: MARGIN_X, y: top, width: CONTENT_WIDTH, height: cardHeight, fill: COMPOSER_PALETTE.card, radius: 20, stroke: COMPOSER_PALETTE.cardBorder });
    const label = labels[index];
    const badgeHeight = label.height + 14;
    const badgeTop = top + Math.round((cardHeight - badgeHeight) / 2);
    rects.push({ x: MARGIN_X + pad, y: badgeTop, width: badgeWidth, height: badgeHeight, fill: COMPOSER_PALETTE.accent, radius: badgeHeight / 2 });
    placed.push({ text: label, left: MARGIN_X + pad + Math.round((badgeWidth - label.width) / 2), top: badgeTop + 7 });

    const titleLeft = MARGIN_X + pad + badgeWidth + 22;
    const stepTitle = await renderText(step.title, { width: MARGIN_X + CONTENT_WIDTH - pad - titleLeft, maxHeight: cardHeight - 20, maxSize: 30, minSize: 18, weight: 600, color: COMPOSER_PALETTE.ink }, 'Step title');
    contrast.use(COMPOSER_PALETTE.ink, COMPOSER_PALETTE.card);
    placed.push({ text: stepTitle, left: titleLeft, top: top + Math.round((cardHeight - stepTitle.height) / 2) });
  }
  return finish(background, rects, placed, contrast, null);
}

// ── Step-by-step v2: one photo per panel, three layouts ──────────────────────

interface StepPalette {
  accent: string;
  tint: string;
}

const DEFAULT_STEP_PALETTE: StepPalette = { accent: COMPOSER_PALETTE.accent, tint: COMPOSER_PALETTE.panel };
// Niche-adapted backgrounds; every pair is checked against COMPOSER_MIN_CONTRAST at render time.
export const STEP_PALETTES: Record<string, StepPalette> = {
  crochet: { accent: '#8E3354', tint: '#FBF2F4' },
  'clay-crafts-diy': { accent: '#8A3A1C', tint: '#FAF1EA' },
  recipes: { accent: '#4A6328', tint: '#F4F6EC' },
  'home-decor': { accent: '#35566A', tint: '#F2F5F7' },
};

export function stepPalette(niche: string | null): StepPalette {
  return (niche && STEP_PALETTES[niche]) || DEFAULT_STEP_PALETTE;
}

interface PlacedPhoto {
  input: Buffer;
  left: number;
  top: number;
}

async function framedPhoto(photo: Buffer, left: number, top: number, width: number, height: number, radius: number): Promise<PlacedPhoto> {
  const cover = await coverPhoto(photo, width, height);
  if (radius === 0) return { input: cover, left, top };
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`
  );
  const input = await sharp(cover).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return { input, left, top };
}

interface StepLayers {
  fill: string;
  under: Rect[];
  photos: PlacedPhoto[];
  over: Rect[];
  placed: Placed[];
}

async function finishLayers(layers: StepLayers, contrast: ContrastLog): Promise<ComposedPin> {
  if (contrast.min < COMPOSER_MIN_CONTRAST) {
    throw new ComposerRenderError(`Text contrast ${contrast.min.toFixed(2)} is below ${COMPOSER_MIN_CONTRAST}`);
  }
  for (const item of layers.placed) {
    const inside =
      item.left >= MARGIN_X / 2 &&
      item.top >= MARGIN_Y / 2 &&
      item.left + item.text.width <= COMPOSER_CANVAS.width - MARGIN_X / 2 &&
      item.top + item.text.height <= COMPOSER_CANVAS.height - MARGIN_Y / 2;
    if (!inside) throw new ComposerRenderError('A text block would touch the edge of the Pin');
  }
  const buffer = await sharp({
    create: { width: COMPOSER_CANVAS.width, height: COMPOSER_CANVAS.height, channels: 3, background: layers.fill },
  })
    .composite([
      { input: shapesSvg(layers.under), left: 0, top: 0 },
      ...layers.photos.map((photo) => ({ input: photo.input, left: photo.left, top: photo.top })),
      { input: shapesSvg(layers.over), left: 0, top: 0 },
      ...layers.placed.map((item) => ({ input: item.text.input, left: Math.round(item.left), top: Math.round(item.top) })),
    ])
    .png()
    .toBuffer();
  return { buffer, width: COMPOSER_CANVAS.width, height: COMPOSER_CANVAS.height, minContrast: contrast.min, heroPlacement: null };
}

interface StepContext {
  text: ComposerStepsV2Text;
  palette: StepPalette;
  contrast: ContrastLog;
  layers: StepLayers;
}

async function placeTitle(ctx: StepContext, top: number, background: string, maxHeight: number, maxSize: number): Promise<number> {
  if (!ctx.text.title) return top;
  const title = await renderText(ctx.text.title, { width: CONTENT_WIDTH, maxHeight, maxSize, minSize: 28, weight: 700, color: COMPOSER_PALETTE.ink, leading: 0.08 }, 'Steps title');
  ctx.contrast.use(COMPOSER_PALETTE.ink, background);
  ctx.layers.placed.push({ text: title, left: MARGIN_X, top });
  return top + title.height;
}

/** A numbered badge (OmniFlow numbers the panels 1-3) centred on (cx, cy). */
async function placeBadge(ctx: StepContext, number: number, cx: number, cy: number, diameter: number): Promise<void> {
  const digit = await renderText(String(number), { width: diameter, maxHeight: diameter, maxSize: Math.round(diameter * 0.55), minSize: 18, weight: 700, color: COMPOSER_PALETTE.onAccent, align: 'centre' }, 'Step number');
  ctx.contrast.use(COMPOSER_PALETTE.onAccent, ctx.palette.accent);
  ctx.layers.over.push(
    { x: cx - diameter / 2 - 4, y: cy - diameter / 2 - 4, width: diameter + 8, height: diameter + 8, fill: COMPOSER_PALETTE.card, radius: diameter / 2 + 4 },
    { x: cx - diameter / 2, y: cy - diameter / 2, width: diameter, height: diameter, fill: ctx.palette.accent, radius: diameter / 2 }
  );
  ctx.layers.placed.push({ text: digit, left: cx - digit.width / 2, top: cy - digit.height / 2 });
}

interface Caption {
  height: number;
  place: (left: number, top: number) => void;
}

/** The article's step label (when it has one) above the step title, measured before it is placed. */
async function buildCaption(
  ctx: StepContext,
  index: number,
  box: { width: number; maxHeight: number; maxSize: number; background: string }
): Promise<Caption> {
  const step = ctx.text.steps[index];
  const label = step.label
    ? await renderText(step.label.toLocaleUpperCase(), { width: box.width, maxHeight: 30, maxSize: 20, minSize: 15, weight: 700, color: ctx.palette.accent }, 'Step label')
    : null;
  if (label) ctx.contrast.use(ctx.palette.accent, box.background);
  const gap = label ? 8 : 0;
  const title = await renderText(step.title, { width: box.width, maxHeight: box.maxHeight - (label ? label.height + gap : 0), maxSize: box.maxSize, minSize: 18, weight: 700, color: COMPOSER_PALETTE.ink, leading: 0.1 }, 'Step title');
  ctx.contrast.use(COMPOSER_PALETTE.ink, box.background);
  return {
    height: (label ? label.height + gap : 0) + title.height,
    place: (left, top) => {
      if (label) ctx.layers.placed.push({ text: label, left, top });
      ctx.layers.placed.push({ text: title, left, top: top + (label ? label.height + gap : 0) });
    },
  };
}

async function placeCaption(
  ctx: StepContext,
  index: number,
  box: { left: number; top: number; width: number; maxHeight: number; maxSize: number; background: string; centreY?: boolean }
): Promise<void> {
  const caption = await buildCaption(ctx, index, box);
  caption.place(box.left, box.centreY ? box.top + Math.round((box.maxHeight - caption.height) / 2) : box.top);
}

/** Layout A — large finished project on top, three stacked rows (photo + number + title). */
async function layoutVertical(ctx: StepContext, main: Buffer, steps: Buffer[]): Promise<void> {
  const mainHeight = 560;
  ctx.layers.photos.push(await framedPhoto(main, 0, 0, COMPOSER_CANVAS.width, mainHeight, 0));
  ctx.layers.over.push({ x: 0, y: mainHeight, width: COMPOSER_CANVAS.width, height: 8, fill: ctx.palette.accent });
  const titleBottom = await placeTitle(ctx, mainHeight + 36, ctx.palette.tint, 110, 44);
  const start = titleBottom + 26;
  const gap = 16;
  const rowHeight = Math.floor((COMPOSER_CANVAS.height - MARGIN_Y - start - gap * 2) / 3);
  if (rowHeight < 170) throw new ComposerRenderError('The step rows do not fit below the photo');
  for (let index = 0; index < 3; index += 1) {
    const top = start + index * (rowHeight + gap);
    ctx.layers.under.push({ x: MARGIN_X, y: top, width: CONTENT_WIDTH, height: rowHeight, fill: COMPOSER_PALETTE.card, radius: 22, stroke: COMPOSER_PALETTE.cardBorder });
    const imageWidth = Math.min(300, Math.round((rowHeight - 24) * 1.3));
    ctx.layers.photos.push(await framedPhoto(steps[index], MARGIN_X + 12, top + 12, imageWidth, rowHeight - 24, 16));
    await placeBadge(ctx, index + 1, MARGIN_X + 12 + 34, top + 12 + 34, 50);
    const textLeft = MARGIN_X + 12 + imageWidth + 28;
    await placeCaption(ctx, index, { left: textLeft, top: top + 16, width: MARGIN_X + CONTENT_WIDTH - 24 - textLeft, maxHeight: rowHeight - 32, maxSize: 34, background: COMPOSER_PALETTE.card, centreY: true });
  }
}

/** Layout B — title, dominant finished project, then a grid of three numbered step tiles. */
async function layoutGrid(ctx: StepContext, main: Buffer, steps: Buffer[]): Promise<void> {
  const titleBottom = await placeTitle(ctx, MARGIN_Y, ctx.palette.tint, 130, 52);
  const mainTop = titleBottom + 28;
  const gap = 20;
  const tile = Math.floor((CONTENT_WIDTH - gap * 2) / 3);
  // Captions first: the finished-project photo takes all the height they leave.
  const captions = [];
  for (let index = 0; index < 3; index += 1) {
    captions.push(await buildCaption(ctx, index, { width: tile, maxHeight: 190, maxSize: 30, background: ctx.palette.tint }));
  }
  const captionHeight = Math.max(...captions.map((caption) => caption.height));
  const captionTop = COMPOSER_CANVAS.height - MARGIN_Y - captionHeight;
  const tileTop = captionTop - 14 - tile;
  const mainHeight = tileTop - 30 - mainTop;
  if (mainHeight < 420) throw new ComposerRenderError('The finished-project photo would be too small');
  ctx.layers.photos.push(await framedPhoto(main, MARGIN_X, mainTop, CONTENT_WIDTH, mainHeight, 26));
  for (let index = 0; index < 3; index += 1) {
    const left = MARGIN_X + index * (tile + gap);
    ctx.layers.photos.push(await framedPhoto(steps[index], left, tileTop, tile, tile, 18));
    await placeBadge(ctx, index + 1, left + 36, tileTop + 36, 48);
    captions[index].place(left, captionTop);
  }
}

/** Layout C — finished project across the top, one large step, then two smaller ones side by side. */
async function layoutAlternating(ctx: StepContext, main: Buffer, steps: Buffer[]): Promise<void> {
  const titleBottom = await placeTitle(ctx, MARGIN_Y, ctx.palette.tint, 120, 50);
  const mainTop = titleBottom + 24;
  const gap = 24;
  const smallWidth = Math.floor((CONTENT_WIDTH - gap) / 2);
  const firstWidth = 460;
  const firstTextLeft = MARGIN_X + firstWidth + 32;
  // Captions first: the photos share the height they leave (finished project largest, step 1 next).
  const small = [];
  for (const index of [1, 2]) {
    small.push(await buildCaption(ctx, index, { width: smallWidth, maxHeight: 150, maxSize: 30, background: ctx.palette.tint }));
  }
  const captionHeight = Math.max(...small.map((caption) => caption.height));
  const captionTop = COMPOSER_CANVAS.height - MARGIN_Y - captionHeight;
  const available = captionTop - 12 - mainTop - 32 - 26;
  const mainHeight = Math.round(available * 0.5);
  const firstHeight = Math.round(available * 0.28);
  const smallHeight = available - mainHeight - firstHeight;
  if (mainHeight < 380 || smallHeight < 160) throw new ComposerRenderError('The step panels do not fit');

  ctx.layers.photos.push(await framedPhoto(main, 0, mainTop, COMPOSER_CANVAS.width, mainHeight, 0));
  ctx.layers.over.push({ x: 0, y: mainTop + mainHeight, width: COMPOSER_CANVAS.width, height: 8, fill: ctx.palette.accent });

  const firstTop = mainTop + mainHeight + 32;
  ctx.layers.photos.push(await framedPhoto(steps[0], MARGIN_X, firstTop, firstWidth, firstHeight, 20));
  await placeBadge(ctx, 1, MARGIN_X + 38, firstTop + 38, 54);
  await placeCaption(ctx, 0, { left: firstTextLeft, top: firstTop, width: MARGIN_X + CONTENT_WIDTH - firstTextLeft, maxHeight: firstHeight, maxSize: 40, background: ctx.palette.tint, centreY: true });

  const smallTop = firstTop + firstHeight + 26;
  for (const index of [1, 2]) {
    const left = MARGIN_X + (index - 1) * (smallWidth + gap);
    ctx.layers.photos.push(await framedPhoto(steps[index], left, smallTop, smallWidth, smallHeight, 18));
    await placeBadge(ctx, index + 1, left + 34, smallTop + 34, 48);
    small[index - 1].place(left, captionTop);
  }
}

async function renderStepsV2(main: Buffer, steps: Buffer[], metadata: StepByStepV2Metadata): Promise<ComposedPin> {
  if (steps.length !== metadata.panelCount) {
    throw new ComposerRenderError(`Step-by-step needs ${metadata.panelCount} step photos, got ${steps.length}`);
  }
  const palette = stepPalette(metadata.niche);
  const ctx: StepContext = {
    text: metadata.text,
    palette,
    contrast: new ContrastLog(),
    layers: { fill: palette.tint, under: [], photos: [], over: [], placed: [] },
  };
  if (metadata.layout === 'vertical-progression') await layoutVertical(ctx, main, steps);
  else if (metadata.layout === 'editorial-grid') await layoutGrid(ctx, main, steps);
  else await layoutAlternating(ctx, main, steps);
  return finishLayers(ctx.layers, ctx.contrast);
}

/**
 * The final Pin image for a composer contract. Step-by-step v2 also needs one
 * photo per step panel. Throws ComposerRenderError — never a partial image.
 */
export async function renderComposedPin(photo: Buffer, metadata: ComposerMetadata, stepPhotos: Buffer[] = []): Promise<ComposedPin> {
  if (metadata.templateType === 'hero') return renderHero(photo, metadata.text);
  if (metadata.templateType === 'materials_and_tools') return renderMaterials(photo, metadata.text);
  if (isStepByStepV2(metadata)) return renderStepsV2(photo, stepPhotos, metadata);
  return renderSteps(photo, metadata.text);
}
