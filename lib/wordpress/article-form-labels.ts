import type { ARTICLE_TYPES, ARTICLE_SIZES, TONES_OF_VOICE, POINTS_OF_VIEW } from '@/lib/validations/wordpress';

// Display labels for the Core Settings / Advanced Options selects
// (TASK-FIX-034, "1-Click Blog Post" / Option 1 only). Centralized here so
// the Article Settings section, the Advanced Options section, and the
// Generation Summary can all render the same label for a given stored
// value without duplicating the mapping.
export const ARTICLE_TYPE_LABELS: Record<(typeof ARTICLE_TYPES)[number], string> = {
  'how-to': 'How-to guide',
  listicle: 'Listicle',
  'product-review': 'Product review',
  news: 'News',
  comparison: 'Comparison',
};

export const ARTICLE_SIZE_LABELS: Record<(typeof ARTICLE_SIZES)[number], string> = {
  small: 'Small (~1200-2400 words, 5-8 sections)',
  medium: 'Medium (~2400-3600 words, 9-12 sections)',
  large: 'Large (~3600-5000 words, 13-16 sections)',
};

export const TONE_OF_VOICE_LABELS: Record<(typeof TONES_OF_VOICE)[number], string> = {
  friendly: 'Friendly',
  professional: 'Professional',
  informational: 'Informational',
  transactional: 'Transactional',
  inspirational: 'Inspirational',
  neutral: 'Neutral',
  witty: 'Witty',
  casual: 'Casual',
};

export const POINT_OF_VIEW_LABELS: Record<(typeof POINTS_OF_VIEW)[number], string> = {
  'first-singular': 'First person singular',
  'first-plural': 'First person plural',
  second: 'Second person',
  third: 'Third person',
};
