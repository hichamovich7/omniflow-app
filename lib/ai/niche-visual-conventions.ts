// Per-niche visual conventions for Pinterest image generation. Keyed by the
// exact niche label from the curated suggestion list in
// components/projects/project-form.tsx (NICHE_SUGGESTIONS), also reached
// through niche profile aliases (getNicheVisualConvention) — free text that
// doesn't match an entry here falls back to DEFAULT_NICHE_CONVENTION, not an
// error. See docs/DECISIONS.md 2026-07-26 (3) for why this replaced
// keyword-based classification (classifyPinComposition in
// lib/prompts/pinterest-pins.ts, kept there only as a fallback for niches
// with no entry here).

import type { BannerTemplate } from '@/lib/validations/pinterest';
import { BANNER_TEMPLATES } from '@/lib/validations/pinterest';
import { findNicheProfile, normalizeNicheKey } from '@/lib/niche/resolve';

export type FramingMode = 'space' | 'object';

export interface NicheVisualConvention {
  /** 'space': full environment as the subject. 'object': isolated subject, close-up allowed. */
  framingMode: FramingMode;
  /** Whether this niche's image style tolerates a text overlay format (see lib/validations/pinterest.ts). */
  allowTextOverlay: boolean;
  /** Free-text art-direction guidance injected into the image_prompt instructions. */
  styleGuidance: string;
  /** Which banner shapes (lib/pinterest/banner-templates/) are eligible for this niche's pins (TASK-FIX-024). Falls back to DEFAULT_NICHE_CONVENTION.allowedBannerTemplates when omitted. */
  allowedBannerTemplates?: BannerTemplate[];
}

export const DEFAULT_NICHE_CONVENTION: NicheVisualConvention = {
  framingMode: 'object',
  allowTextOverlay: false,
  styleGuidance: '',
  // 'torn-paper' excluded by default — a craft/rustic shape that reads wrong
  // outside niches that are actually about crafting (see Crochet below).
  allowedBannerTemplates: BANNER_TEMPLATES.filter((template) => template !== 'torn-paper'),
};

export const NICHE_VISUAL_CONVENTIONS: Record<string, NicheVisualConvention> = {
  'Home Organization & Decor': {
    framingMode: 'space',
    allowTextOverlay: false,
    styleGuidance:
      'Full-room interior photography: show the entire space as one coherent, real environment — walls, floor, visible furniture or layout, and ceiling in context. Never isolate a single object, surface, or detail in a tight close-up.',
  },
  'Personal Finance / Budgeting': {
    framingMode: 'object',
    allowTextOverlay: true,
    styleGuidance:
      'Styled flat-lay or desk scene: a calculator, a closed notebook or journal (cover only, no visible pages or writing), an abstract bar-chart illustration shown as plain colored bars with no numbers or labels, stylized coins, a small potted plant growing out of a jar of coins, a set of keys. Never depict people. Never depict banknotes, printed charts with numbers, or any object showing legible text or writing. Overhead or 45-degree framing only.',
    // Restricted to sober legacy/v2 families; playful and craft shapes stay
    // excluded for this audience.
    allowedBannerTemplates: ['clean-band', 'corner-tag', 'editorial', 'minimal', 'magazine'],
  },
  'Food & Recipes': {
    framingMode: 'object',
    allowTextOverlay: false,
    styleGuidance:
      'Culinary food styling: the finished dish in appetizing close detail, or ingredients artfully arranged, with warm inviting textures and colors. Overhead or 45-degree framing only.',
  },
  Travel: {
    framingMode: 'space',
    allowTextOverlay: false,
    styleGuidance:
      'Wide establishing shots of destinations, landscapes, or architecture shown in their real surrounding context. Golden hour or soft natural light.',
  },
  Crochet: {
    framingMode: 'object',
    allowTextOverlay: true,
    styleGuidance:
      'Close-up craft photography of a finished crochet or knit piece — amigurumi, blanket, garment, or accessory — showing stitch texture and detail, optionally with yarn skeins or a hook nearby. Soft, warm, cozy lighting. Overhead or 45-degree framing only.',
    // Only niche where 'torn-paper' fits the craft/DIY mood — all 5 shapes eligible.
    allowedBannerTemplates: [...BANNER_TEMPLATES],
  },
  // Own "Modern Handmade" direction — nothing inherited from Crochet. Text
  // overlay and banner templates keep the default behavior Clay had before
  // this entry existed (no overlay, no torn-paper, no mandatory CTA).
  'Clay Crafts & DIY': {
    framingMode: 'object',
    allowTextOverlay: false,
    styleGuidance:
      'Modern Handmade craft photography: the finished air-dry or polymer clay piece is clearly visible as the main subject, showing its handmade texture — sculpted edges, matte or glazed surfaces, subtle tool marks — on a clean, lightly styled surface such as light wood, linen or plaster. Soft natural daylight. Soft or earthy colors such as terracotta, sand, sage, cream or blush. Overhead or 45-degree framing only.',
  },
};

/**
 * Exact label first (unchanged behavior), then case/accent/punctuation-
 * insensitive label, then a niche profile alias ("Home Decor" → "Home
 * Organization & Decor", "Recipes" → "Food & Recipes", "Clay" → "Clay Crafts &
 * DIY" — see lib/niche/profiles.ts). Unknown niches still return null.
 */
export function getNicheVisualConvention(niche: string | null | undefined): NicheVisualConvention | null {
  if (!niche?.trim()) return null;
  const exact = NICHE_VISUAL_CONVENTIONS[niche.trim()];
  if (exact) return exact;
  const key = normalizeNicheKey(niche);
  const byKey = Object.keys(NICHE_VISUAL_CONVENTIONS).find((label) => normalizeNicheKey(label) === key);
  if (byKey) return NICHE_VISUAL_CONVENTIONS[byKey];
  const profileLabel = findNicheProfile(niche)?.label;
  return profileLabel ? NICHE_VISUAL_CONVENTIONS[profileLabel] ?? null : null;
}
