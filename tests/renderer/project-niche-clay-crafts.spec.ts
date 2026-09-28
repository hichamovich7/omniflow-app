import { expect, test } from 'playwright/test';
import { NICHE_SUGGESTIONS } from '@/components/projects/project-form';
import { createProjectSchema, updateProjectSchema } from '@/lib/validations/project';
import { createContentStreamSchema } from '@/lib/validations/content-streams';
import {
  DEFAULT_NICHE_CONVENTION,
  NICHE_VISUAL_CONVENTIONS,
  getNicheVisualConvention,
} from '@/lib/ai/niche-visual-conventions';
import { buildPinterestPinsPrompt } from '@/lib/prompts';
import { buildArticlePinterestSource } from '@/lib/social/pinterest-from-article';

/**
 * "Clay Crafts & DIY" niche. Niches are stored by label (free text,
 * projects.niche, no DB constraint), so the stable identifier `clay-crafts-diy`
 * is documentary only. No visual convention entry on purpose: the niche uses
 * DEFAULT_NICHE_CONVENTION. Offline — no AI call, no Supabase.
 */
const CLAY = 'Clay Crafts & DIY';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const PREVIOUS_NICHES = [
  'Insurance',
  'Mortgages & Home Loans',
  'Legal / Attorney Services',
  'Addiction Treatment & Rehab',
  'Credit Cards & Credit Repair',
  'Cryptocurrency & Investing',
  'B2B Software / SaaS',
  'Web Hosting & Domains',
  'Personal Finance / Budgeting',
  'Real Estate',
  'Online Education & Degrees',
  'Cybersecurity / VPN',
  'Productivity & AI Tools',
  'Health & Wellness',
  'Home Organization & Decor',
  'Beauty & Personal Care',
  'Parenting & Baby',
  'Pets',
  'Travel',
  'Food & Recipes',
  'Crochet',
];

function prompt(niche: string | null, textOverlayMode: 'always' | 'never' = 'always') {
  const { system, user } = buildPinterestPinsPrompt({
    keyword: 'clay earrings ideas',
    language: 'en',
    pinsRequested: 3,
    niche,
    textOverlayMode,
  });
  return `${system}\n${user}`;
}

test.describe('Clay Crafts & DIY niche', () => {
  test('appears exactly once in the niche selector suggestions', () => {
    expect(NICHE_SUGGESTIONS.filter((n) => n === CLAY)).toHaveLength(1);
  });

  test('existing niches are unchanged, in the same order', () => {
    expect(NICHE_SUGGESTIONS.slice(0, PREVIOUS_NICHES.length)).toEqual(PREVIOUS_NICHES);
    expect(NICHE_SUGGESTIONS).toHaveLength(PREVIOUS_NICHES.length + 1);
  });

  test('a project can be created and updated with the niche; the label is saved verbatim', () => {
    const created = createProjectSchema.safeParse({ name: 'Clay Studio', niche: CLAY, default_language: 'en' });
    expect(created.success).toBe(true);
    expect(created.data?.niche).toBe(CLAY);

    const updated = updateProjectSchema.safeParse({ niche: `  ${CLAY}  ` });
    expect(updated.success).toBe(true);
    expect(updated.data?.niche).toBe(CLAY);
  });

  test('a Content Stream can be created under a Clay Crafts & DIY project (niche is inherited from the project)', () => {
    const parsed = createContentStreamSchema.safeParse({ projectId: PROJECT_ID, name: 'Clay Earrings', status: 'planned' });
    expect(parsed.success).toBe(true);
    expect(parsed.data && 'niche' in parsed.data).toBe(false);
  });

  test('uses the default visual convention (no dedicated entry)', () => {
    expect(NICHE_VISUAL_CONVENTIONS[CLAY]).toBeUndefined();
    expect(getNicheVisualConvention(CLAY)).toBeNull();
    expect(DEFAULT_NICHE_CONVENTION.allowTextOverlay).toBe(false);
  });

  test('is passed to the prompt builder and resolves to the default: same prompt as no niche, text overlay forced off', () => {
    const source = buildArticlePinterestSource(
      { id: 'g', project_id: PROJECT_ID, language: 'en', seo_keywords: 'clay earrings' },
      { title: 'T', meta_title: null, meta_description: 'D', content: 'C', featured_image_url: null, featured_image_prompt: null },
      'clay earrings',
      { niche: CLAY, description: null }
    );
    expect(source.niche).toBe(CLAY);

    expect(prompt(CLAY)).toBe(prompt(null));
    // Requested 'always' is clamped to 'never' because the default convention disallows overlays.
    expect(prompt(CLAY, 'always')).toBe(prompt(CLAY, 'never'));
    // Crochet keeps its own convention — Clay does not inherit it.
    expect(prompt('Crochet')).not.toBe(prompt(CLAY));
  });

  test('an unknown niche is still accepted (free text) and falls back to the default convention', () => {
    const parsed = createProjectSchema.safeParse({ name: 'Other', niche: 'Pottery Wheel Throwing' });
    expect(parsed.success).toBe(true);
    expect(getNicheVisualConvention('Pottery Wheel Throwing')).toBeNull();
    expect(prompt('Pottery Wheel Throwing')).toBe(prompt(null));
    // The slug form is not a label and is not mapped to the niche.
    expect(NICHE_SUGGESTIONS).not.toContain('clay-crafts-diy');
    // Length limit still enforced.
    expect(createProjectSchema.safeParse({ name: 'X', niche: 'a'.repeat(101) }).success).toBe(false);
  });
});
