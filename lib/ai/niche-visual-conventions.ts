// Per-niche visual conventions for Pinterest image generation. Keyed by the
// exact niche label from the curated suggestion list in
// components/projects/project-form.tsx (NICHE_SUGGESTIONS) — free text that
// doesn't match an entry here falls back to DEFAULT_NICHE_CONVENTION, not an
// error. See docs/DECISIONS.md 2026-07-26 (3) for why this replaced
// keyword-based classification (classifyPinComposition in
// lib/prompts/pinterest-pins.ts, kept there only as a fallback for niches
// with no entry here).

export type FramingMode = 'space' | 'object';

export interface NicheVisualConvention {
  /** 'space': full environment as the subject. 'object': isolated subject, close-up allowed. */
  framingMode: FramingMode;
  /** Whether this niche's image style tolerates a text overlay format (see lib/validations/pinterest.ts). */
  allowTextOverlay: boolean;
  /** Free-text art-direction guidance injected into the image_prompt instructions. */
  styleGuidance: string;
}

export const DEFAULT_NICHE_CONVENTION: NicheVisualConvention = {
  framingMode: 'object',
  allowTextOverlay: false,
  styleGuidance: '',
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
  },
};

export function getNicheVisualConvention(niche: string | null | undefined): NicheVisualConvention | null {
  if (!niche) return null;
  return NICHE_VISUAL_CONVENTIONS[niche.trim()] ?? null;
}
