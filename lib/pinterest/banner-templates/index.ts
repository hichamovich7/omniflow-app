import { readFileSync } from 'fs';
import path from 'path';
import type { BannerTemplate } from '@/lib/validations/pinterest';

// Every template SVG is authored on a fixed 1024-wide reference canvas — the
// only width IMAGE_CONFIG.size (lib/prompts/image-generator.ts) ever produces
// — with its own intrinsic height (viewBox) and shape/text geometry baked in.
// No positioning logic lives in code per template: compositing.ts only
// substitutes {{TEXT}}/{{ACCENT_COLOR}}/{{TEXT_COLOR}}/{{FONT_SIZE}} tokens
// and scales the whole file to the actual image width.
export const TEMPLATE_REFERENCE_WIDTH = 1024;

const TEMPLATE_DIR = path.join(process.cwd(), 'lib/pinterest/banner-templates');

// Read eagerly with literal filenames (not a dynamic template-name lookup) so
// Next.js's build-time file tracing (@vercel/nft) can see and bundle each
// file for serverless deployment — a runtime `readFileSync(...${template}.svg)`
// would not be statically analyzable.
const TEMPLATE_SOURCES: Record<BannerTemplate, string> = {
  'clean-band': readFileSync(path.join(TEMPLATE_DIR, 'clean-band.svg'), 'utf-8'),
  ribbon: readFileSync(path.join(TEMPLATE_DIR, 'ribbon.svg'), 'utf-8'),
  pill: readFileSync(path.join(TEMPLATE_DIR, 'pill.svg'), 'utf-8'),
  'torn-paper': readFileSync(path.join(TEMPLATE_DIR, 'torn-paper.svg'), 'utf-8'),
  'corner-tag': readFileSync(path.join(TEMPLATE_DIR, 'corner-tag.svg'), 'utf-8'),
};

// Short, plain-language descriptions injected into the FAST role's prompt
// (lib/prompts/pinterest-pins.ts) so the AI picks a shape by context instead
// of guessing from the enum name alone.
export const BANNER_TEMPLATE_DESCRIPTIONS: Record<BannerTemplate, string> = {
  'clean-band': 'a plain solid full-width horizontal band — neutral, works for any subject',
  ribbon: 'a horizontal ribbon banner with pointed folded ends — festive, promotional feel',
  pill: 'a small centered rounded pill, narrower than the full width — best for very short text (2-4 words), overflows badly with longer text',
  'torn-paper': 'a full-width band with a hand-torn paper edge — rustic, craft, DIY feel',
  'corner-tag': 'a compact flag-shaped tag anchored to the left side, not full width — good for a short label rather than a full sentence',
};

export function getTemplateSource(template: BannerTemplate): string {
  return TEMPLATE_SOURCES[template];
}

const VIEW_BOX_HEIGHT_RE = /viewBox="0 0 1024 (\d+(?:\.\d+)?)"/;

// Every template's intrinsic aspect ratio, read from its own viewBox — the
// value that lets compositing.ts derive the rendered banner's pixel height
// from the actual image width, without hardcoding per-template geometry.
export function getTemplateAspectRatio(template: BannerTemplate): number {
  const source = TEMPLATE_SOURCES[template];
  const match = source.match(VIEW_BOX_HEIGHT_RE);
  if (!match) {
    throw new Error(`Banner template "${template}" is missing a "viewBox=\"0 0 1024 H\"" declaration`);
  }
  return Number(match[1]) / TEMPLATE_REFERENCE_WIDTH;
}
