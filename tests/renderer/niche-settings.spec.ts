import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addCustomValue,
  applyNicheSettings,
  customValueError,
  normalizeNicheSettings,
  parseNicheSettings,
  recommendedFieldValues,
  removeCustomValue,
  resetNicheSettings,
  resolveNicheField,
  saveNicheSettingsSchema,
  setRecommendedDisabled,
  setSubNicheDisabled,
  type NicheSettings,
} from '@/lib/niche/settings';
import { recommendedNicheSections, resolveNicheContext } from '@/lib/niche/resolve';
import { GENERIC_NICHE_SECTIONS } from '@/lib/niche/profiles';
import { buildWordPressOutlinePrompt } from '@/lib/ai/prompts/wordpress-outline-prompt';
import { buildWordPressArticlePrompt } from '@/lib/ai/prompts/wordpress-article-prompt';
import { buildWordPressFromPinsPrompt } from '@/lib/ai/prompts/wordpress-from-pins-prompt';
import { buildPinterestPinsPrompt } from '@/lib/prompts';
import { buildArticlePinterestSource, regenerateArticlePin } from '@/lib/social/pinterest-from-article';
import {
  NICHE_SETTINGS_MIGRATION_MESSAGE,
  getProjectNicheSettings,
  isMissingNicheSettingsColumn,
  readProjectNicheSettings,
  saveProjectNicheSettings,
} from '@/lib/queries/niche-settings';
import type { WordPressOutline } from '@/lib/validations/wordpress';

/**
 * Niche Profiles Phase 2 — per-project niche settings (TASK-045, migration
 * 041). Offline: pure functions, prompt builders, a stubbed generateText and
 * a recording fake Supabase client. No AI call, no network, no database.
 */

const CUSTOM_TONE = 'playful but precise';
const CUSTOM_KEYWORD = 'clay coasters';
const CUSTOM_ANGLE = 'before / after sealing comparison';
const CUSTOM_STYLE = 'Scandinavian minimal clay styling';
const CUSTOM_CTA = 'Pin it for your next craft night';
const CUSTOM_AUDIENCE = 'Teachers running classroom clay workshops';

const CLAY_TONE = ['friendly', 'creative', 'practical', 'beginner-friendly voice'];

const SETTINGS: NicheSettings = {
  version: 1,
  fields: {
    tone: { custom: [CUSTOM_TONE], disabled: ['beginner-friendly voice'] },
    audience: { custom: [CUSTOM_AUDIENCE], disabled: [] },
    keywords: { custom: [CUSTOM_KEYWORD], disabled: ['sealing air dry clay'] },
    pinterestAngles: { custom: [CUSTOM_ANGLE], disabled: [] },
    visualStyle: { custom: [CUSTOM_STYLE], disabled: ['Modern Handmade: finished clay pieces clearly visible as the main subject.'] },
    cta: { custom: [CUSTOM_CTA], disabled: [] },
  },
};

const OUTLINE: WordPressOutline = {
  title: 'Air Dry Clay Coasters',
  metaTitle: 'Air Dry Clay Coasters',
  slug: 'air-dry-clay-coasters',
  metaDescription: 'D'.repeat(155),
  quickAnswerAngle: 'Shape and seal coasters.',
  keyTakeawaysThemes: ['shape', 'dry', 'seal', 'paint'],
  sections: [1, 2, 3, 4, 5].map((i) => ({ heading: `S${i}`, summary: `Summary ${i}` })),
  includeComparisonTable: false,
  comparisonTableReason: 'Nothing to compare.',
  commonMistakesThemes: ['a', 'b', 'c'],
  faqQuestions: ['q1?', 'q2?', 'q3?', 'q4?'],
  featuredImage: { prompt: 'p', altText: 'a' },
  images: [{ placementMarker: 'IMAGE_1', prompt: 'p', altText: 'a' }],
};

function ctx(niche: string | null, settings: NicheSettings | null, streams: string[] = []) {
  return resolveNicheContext({ niche, contentStreams: streams, settings });
}

function pinterest(niche: string | null, nicheSettings: NicheSettings | null, contentStreams: string[] = []) {
  return buildPinterestPinsPrompt({ keyword: 'clay coasters', language: 'en', pinsRequested: 5, niche, textOverlayMode: 'auto', nicheSettings, contentStreams }).user;
}

// ------------------------------------------------------------ fake Supabase

type Op = { table: string; method: string; args: unknown[] };
type Result = { data: unknown; error: unknown };

function recordingSupabase(result: Result): { client: SupabaseClient; ops: Op[] } {
  const ops: Op[] = [];
  const chain = (table: string): unknown =>
    new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === 'then') return (resolve: (value: Result) => void) => resolve(result);
          return (...args: unknown[]) => {
            ops.push({ table, method: String(prop), args });
            return chain(table);
          };
        },
      }
    );
  return { client: { from: (table: string) => chain(table) } as unknown as SupabaseClient, ops };
}

// ------------------------------------------------------------ reading & validation

test.describe('niche_settings reading and validation', () => {
  test('NULL / missing reads as defaults', () => {
    expect(parseNicheSettings(null)).toBeNull();
    expect(parseNicheSettings(undefined)).toBeNull();
    expect(ctx('Clay', null)).toEqual(resolveNicheContext({ niche: 'Clay' }));
  });

  test('a valid configuration is read as-is', () => {
    expect(parseNicheSettings(SETTINGS)).toEqual(SETTINGS);
    expect(parseNicheSettings({ version: 1, fields: {} })).toEqual({ version: 1, fields: {} });
  });

  test('invalid, future-version or legacy garbage values fall back to defaults instead of breaking generation', () => {
    expect(parseNicheSettings({ version: 2, fields: {} })).toBeNull();
    expect(parseNicheSettings({ fields: {} })).toBeNull();
    expect(parseNicheSettings('tone=friendly')).toBeNull();
    expect(parseNicheSettings({ version: 1, fields: { unknownField: { custom: [] } } })).toBeNull();
  });

  test('Zod: save body accepts settings or null, rejects extra keys, long / empty / link values and too many values', () => {
    expect(saveNicheSettingsSchema.safeParse({ settings: null }).success).toBe(true);
    expect(saveNicheSettingsSchema.safeParse({ settings: SETTINGS }).success).toBe(true);
    expect(saveNicheSettingsSchema.safeParse({ settings: SETTINGS, niche: 'x' }).success).toBe(false);
    const withCustom = (custom: string[]) => ({ settings: { version: 1, fields: { tone: { custom, disabled: [] } } } });
    expect(saveNicheSettingsSchema.safeParse(withCustom(['a'.repeat(201)])).success).toBe(false);
    expect(saveNicheSettingsSchema.safeParse(withCustom(['  '])).success).toBe(false);
    expect(saveNicheSettingsSchema.safeParse(withCustom(Array.from({ length: 21 }, (_, i) => `v${i}`))).success).toBe(false);
    expect(saveNicheSettingsSchema.safeParse(withCustom(['Visit https://shop.example.com'])).success).toBe(false);
    expect(customValueError('see www.example.org')).toBe('Custom values cannot contain links or domain names');
    expect(customValueError('mystore.com deals')).not.toBeNull();
    expect(customValueError(CUSTOM_CTA)).toBeNull();
  });
});

// ------------------------------------------------------------ editing

test.describe('editing: add, disable, reset', () => {
  test('adding a custom value keeps recommended values and never duplicates', () => {
    let s = addCustomValue(null, 'tone', CUSTOM_TONE);
    s = addCustomValue(s, 'tone', `  ${CUSTOM_TONE.toUpperCase()} `);
    expect(s.fields.tone?.custom).toEqual([CUSTOM_TONE]);
    const field = resolveNicheField(CLAY_TONE, s.fields.tone);
    expect(field.active).toEqual([...CLAY_TONE, CUSTOM_TONE]);
    expect(field.items.find((i) => i.value === CUSTOM_TONE)?.source).toBe('custom');
    expect(field.items.filter((i) => i.source === 'recommended')).toHaveLength(CLAY_TONE.length);
  });

  test('disabling a recommended value removes it from the prompts but keeps it visible as disabled; enabling restores it', () => {
    let s = setRecommendedDisabled(null, 'tone', 'beginner-friendly voice', true);
    let field = resolveNicheField(CLAY_TONE, s.fields.tone);
    expect(field.active).not.toContain('beginner-friendly voice');
    expect(field.items.find((i) => i.value === 'beginner-friendly voice')).toEqual({ value: 'beginner-friendly voice', source: 'recommended', disabled: true });
    s = setRecommendedDisabled(s, 'tone', 'beginner-friendly voice', false);
    field = resolveNicheField(CLAY_TONE, s.fields.tone);
    expect(field.active).toEqual(CLAY_TONE);
  });

  test('replacing a recommended value = disable it + add a custom one', () => {
    let s = setRecommendedDisabled(null, 'cta', 'Optional — when used, invite the reader to save the idea.', true);
    s = addCustomValue(s, 'cta', CUSTOM_CTA);
    expect(ctx('Clay', s)?.pinterest.cta).toBe(CUSTOM_CTA);
  });

  test('removing a custom value and resetting a field or everything returns to the defaults', () => {
    let s: NicheSettings | null = addCustomValue(null, 'keywords', CUSTOM_KEYWORD);
    s = removeCustomValue(s, 'keywords', CUSTOM_KEYWORD);
    expect(normalizeNicheSettings(s)).toBeNull();
    expect(resetNicheSettings(SETTINGS, 'tone')?.fields.tone).toBeUndefined();
    expect(resetNicheSettings(SETTINGS, 'tone')?.fields.cta).toEqual(SETTINGS.fields.cta);
    expect(resetNicheSettings(SETTINGS)).toBeNull();
    expect(ctx('Clay', resetNicheSettings(SETTINGS))).toEqual(ctx('Clay', null));
  });

  test('custom values survive a profile update: only customizations are stored, never recommended values', () => {
    const stored = normalizeNicheSettings(SETTINGS)!;
    // Enabled recommended values are never stored; only custom / disabled ones.
    expect(JSON.stringify(stored)).not.toContain('"creative"');
    expect(JSON.stringify(stored)).not.toContain('"practical"');
    // A custom value identical to a recommended one is still kept as the user's.
    const same = normalizeNicheSettings(addCustomValue(null, 'tone', 'friendly'));
    expect(same?.fields.tone?.custom).toEqual(['friendly']);
  });
});

// ------------------------------------------------------------ resolution

test.describe('resolution with project settings', () => {
  for (const niche of ['Crochet', 'Clay', 'Home Decor', 'Recipes']) {
    test(`"${niche}": defaults unchanged without settings; custom values win and recommended ones stay`, () => {
      const base = ctx(niche, null)!;
      expect(base.customized).toBe(false);
      const custom = ctx(niche, { version: 1, fields: { tone: { custom: [CUSTOM_TONE], disabled: [] } } })!;
      expect(custom.customized).toBe(true);
      expect(custom.profileSlug).toBe(base.profileSlug);
      expect(custom.shared.tone).toEqual([...base.shared.tone, CUSTOM_TONE]);
      expect(custom.wordpress).toEqual(base.wordpress);
    });
  }

  test('an unknown niche keeps the generic profile and accepts custom values', () => {
    const resolved = ctx('Pottery Wheel Throwing', SETTINGS)!;
    expect(resolved.isGeneric).toBe(true);
    expect(resolved.nicheLabel).toBe('Pottery Wheel Throwing');
    expect(resolved.shared.priorityTopics).toEqual([CUSTOM_KEYWORD]);
    expect(recommendedNicheSections('Pottery Wheel Throwing').sections).toBe(GENERIC_NICHE_SECTIONS);
  });

  test('no niche, no stream but customizations: the settings still reach the prompts', () => {
    expect(ctx(null, null)).toBeNull();
    const resolved = ctx(null, SETTINGS)!;
    expect(resolved.isGeneric).toBe(true);
    expect(resolved.shared.tone).toContain(CUSTOM_TONE);
  });

  test('priority: project settings > Content Stream sub-niche > niche', () => {
    const niche = ctx('Clay', null)!;
    const stream = ctx('Clay', null, ['Air Dry Clay'])!;
    const all = ctx('Clay', SETTINGS, ['Air Dry Clay'])!;
    expect(stream.shared.priorityTopics).not.toEqual(niche.shared.priorityTopics);
    // The sub-niche's topics, minus the one the user disabled, plus the custom keyword.
    expect(all.shared.priorityTopics).toEqual(['air dry clay projects', 'drying and cracking', CUSTOM_KEYWORD]);
    expect(all.shared.audience).toBe(`${niche.shared.audience}; ${CUSTOM_AUDIENCE}`);
    expect(all.shared.tone).toEqual(['friendly', 'creative', 'practical', CUSTOM_TONE]);
    expect(all.visual.style).toBe(CUSTOM_STYLE);
    expect(all.visual.lighting).toBe(niche.visual.lighting);
  });

  test('a disabled recommended sub-niche no longer matches its Content Stream (kept as a plain label)', () => {
    const disabled = setSubNicheDisabled(null, 'polymer-clay', true);
    const resolved = ctx('Clay', disabled, ['Polymer Clay'])!;
    expect(resolved.subNiche).toBeNull();
    expect(resolved.contentStream).toBe('Polymer Clay');
    expect(ctx('Clay', null, ['Polymer Clay'])?.subNiche?.slug).toBe('polymer-clay');
  });

  test('recommended values per field come from the profile (pre-filled editor)', () => {
    const { sections, profile } = recommendedNicheSections('clay crafts & diy');
    expect(profile?.slug).toBe('clay-crafts-diy');
    expect(recommendedFieldValues(sections, 'tone')).toEqual(CLAY_TONE);
    expect(recommendedFieldValues(sections, 'keywords')).toContain('Polymer Clay');
    expect(recommendedFieldValues(sections, 'visualStyle')[0]).toContain('Modern Handmade');
    expect(applyNicheSettings(sections, null)).toBe(sections);
  });
});

// ------------------------------------------------------------ prompts

test.describe('final values reach the prompts', () => {
  const resolved = () => ctx('Clay', SETTINGS, ['Air Dry Clay']);

  test('WordPress outline (keyword / URL): shared values + custom visual style; no Pinterest-only values', () => {
    const { user } = buildWordPressOutlinePrompt({ keyword: 'clay coasters', language: 'en', niche: resolved(), researchNotes: 'Source summary' });
    expect(user).toContain(CUSTOM_TONE);
    expect(user).toContain(CUSTOM_AUDIENCE);
    expect(user).toContain(CUSTOM_KEYWORD);
    expect(user).toContain(`Style: ${CUSTOM_STYLE}`);
    expect(user).toContain('Project settings: customized by the user');
    expect(user).toContain("4. this project's own niche settings");
    expect(user).not.toContain('beginner-friendly voice');
    expect(user).not.toContain(CUSTOM_ANGLE);
    expect(user).not.toContain(CUSTOM_CTA);
  });

  test('WordPress article and Pins outline receive the final shared values', () => {
    const article = buildWordPressArticlePrompt({ outline: OUTLINE, language: 'en', primaryKeyword: 'clay coasters', niche: resolved() }).user;
    expect(article).toContain(CUSTOM_TONE);
    expect(article).toContain(CUSTOM_KEYWORD);
    expect(article).not.toContain(CUSTOM_STYLE);
    expect(article).not.toContain(CUSTOM_ANGLE);
    expect(article).not.toContain(CUSTOM_CTA);
    const pins = buildWordPressFromPinsPrompt({
      primaryKeyword: 'clay coasters',
      pins: [{ title: 't', description: 'd', keywords: 'k', contentStream: 'Air Dry Clay' }],
      language: 'en',
      imageCount: 0,
      niche: resolved(),
    }).user;
    expect(pins).toContain(CUSTOM_TONE);
    expect(pins).toContain(`Style: ${CUSTOM_STYLE}`);
  });

  test('Pinterest normal: custom angle, CTA, keyword and visual style reach the prompt and the image rules', () => {
    const user = pinterest('Clay', SETTINGS, ['Air Dry Clay']);
    expect(user).toContain(CUSTOM_ANGLE);
    // Recommended CTA kept (not disabled), custom CTA appended.
    expect(user).toContain(`CTA: Optional — when used, invite the reader to save the idea.; ${CUSTOM_CTA}`);
    expect(user).toContain(CUSTOM_KEYWORD);
    expect(user).toContain(`Style: ${CUSTOM_STYLE}`);
    expect(user).toContain('Apply <visual_rules> to every image_prompt');
    expect(user).not.toContain('<wordpress_rules>');
    expect(user).toContain('Destination link: none.');
    expect(user).not.toMatch(/https?:\/\//);
  });

  test('Pinterest from a WordPress article and Pin regeneration use the project settings', async () => {
    const source = {
      ...buildArticlePinterestSource(
        { id: 'g', project_id: 'p', language: 'en', seo_keywords: 'clay coasters' },
        { title: 'T', meta_title: null, meta_description: 'D', content: 'C', featured_image_url: null, featured_image_prompt: null },
        'clay coasters',
        { niche: 'Clay', description: null }
      ),
      contentStreams: ['Air Dry Clay'],
      nicheSettings: SETTINGS,
    };
    expect(pinterest(source.niche, source.nicheSettings, source.contentStreams)).toContain(CUSTOM_ANGLE);

    let captured = '';
    await expect(
      regenerateArticlePin(
        {
          pin: { id: 'p1', title: 'Old', description: 'd', keywords: 'k', image_prompt: 'i', image_analysis: null, visual_format: 'photo', overlay_text: null },
          siblingTitles: [],
          keyword: 'clay coasters',
          language: 'en',
          source,
        },
        {
          generateText: (async (options: { messages: { content: string }[] }) => {
            captured = options.messages.map((m) => m.content).join('\n');
            throw new Error('stub: no AI call');
          }) as never,
        }
      )
    ).rejects.toThrow();
    expect(captured).toContain(CUSTOM_ANGLE);
    expect(captured).toContain(CUSTOM_STYLE);
  });

  test('legacy data: no settings (or migration not applied) → exactly the Phase 1 prompts', () => {
    expect(pinterest('Clay', null)).toBe(buildPinterestPinsPrompt({ keyword: 'clay coasters', language: 'en', pinsRequested: 5, niche: 'Clay', textOverlayMode: 'auto', contentStreams: [] }).user);
    expect(pinterest(null, null)).not.toMatch(/^<niche_context>$/m);
    const legacy = buildWordPressOutlinePrompt({ keyword: 'k', language: 'en', niche: ctx(null, null) }).user;
    expect(legacy).not.toMatch(/^<niche_context>$/m);
  });
});

// ------------------------------------------------------------ persistence

test.describe('persistence (fake Supabase)', () => {
  test('migration not applied: reads fall back to defaults, the save reports a clear error', async () => {
    const missing = { code: '42703', message: 'column projects.niche_settings does not exist' };
    expect(isMissingNicheSettingsColumn(missing)).toBe(true);
    expect(isMissingNicheSettingsColumn({ code: 'PGRST204', message: "Could not find the 'niche_settings' column" })).toBe(true);
    expect(isMissingNicheSettingsColumn({ code: '23505', message: 'duplicate' })).toBe(false);

    const { client } = recordingSupabase({ data: null, error: missing });
    expect(await readProjectNicheSettings(client, 'u', 'p')).toEqual({ settings: null, available: false });
    expect(await getProjectNicheSettings(client, 'u', 'p')).toBeNull();
    expect(await saveProjectNicheSettings(client, 'u', 'p', SETTINGS)).toEqual({
      ok: false,
      code: 'migration_required',
      message: NICHE_SETTINGS_MIGRATION_MESSAGE,
    });
  });

  test('reading never writes: only one select of niche_settings, scoped to the owner', async () => {
    const { client, ops } = recordingSupabase({ data: { niche_settings: SETTINGS }, error: null });
    expect(await getProjectNicheSettings(client, 'user-1', 'project-1')).toEqual(SETTINGS);
    expect(ops.map((o) => o.method)).toEqual(['select', 'eq', 'eq', 'maybeSingle']);
    expect(ops[0]).toEqual({ table: 'projects', method: 'select', args: ['niche_settings'] });
    expect(ops.some((o) => ['update', 'insert', 'upsert', 'delete'].includes(o.method))).toBe(false);
  });

  test('saving writes only projects.niche_settings of the owned project, normalized; reset writes NULL', async () => {
    const { client, ops } = recordingSupabase({ data: { id: 'project-1' }, error: null });
    const result = await saveProjectNicheSettings(client, 'user-1', 'project-1', addCustomValue(addCustomValue(null, 'tone', 'x'), 'tone', 'X'));
    expect(result).toEqual({ ok: true, settings: { version: 1, fields: { tone: { custom: ['x'], disabled: [] } } } });
    const update = ops.find((o) => o.method === 'update');
    expect(update?.table).toBe('projects');
    expect(Object.keys(update?.args[0] as object)).toEqual(['niche_settings']);
    expect(ops.filter((o) => o.method === 'eq').map((o) => o.args)).toEqual([['id', 'project-1'], ['user_id', 'user-1']]);
    expect(ops.filter((o) => o.method === 'update')).toHaveLength(1);

    const reset = recordingSupabase({ data: { id: 'project-1' }, error: null });
    expect(await saveProjectNicheSettings(reset.client, 'user-1', 'project-1', null)).toEqual({ ok: true, settings: null });
    expect(reset.ops.find((o) => o.method === 'update')?.args[0]).toEqual({ niche_settings: null });
  });

  test('a project that is not the user’s is reported as not found', async () => {
    const { client } = recordingSupabase({ data: null, error: null });
    expect((await saveProjectNicheSettings(client, 'u', 'p', SETTINGS)).ok).toBe(false);
  });
});
