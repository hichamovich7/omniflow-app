import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildWordPressArticleContext, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import { attachArticleSourceMetadata, buildArticleGrounding } from '@/lib/pinterest/article-briefs';
import { classifyArticleKind } from '@/lib/pinterest/article-kind';
import { attachPinterestStrategyMetadata } from '@/lib/pinterest/strategy';
import { imagePromptProblem, regeneratePinText, type PinTextRegenerationSource } from '@/lib/pinterest/regenerate-text';
import {
  preparePinTextRegeneration,
  regenerateAndSavePinText,
  regenerateCompletePin,
  type RenderPinImageFn,
} from '@/lib/pinterest/pin-text';
import { planCompleteRegeneration } from '@/lib/pinterest/regenerate-text-client';
import {
  completeRegenerationConfirmation,
  REGENERATION_MODE_LABELS,
  textAndPromptsConfirmation,
} from '@/components/pinterest/bulk-regenerate-text-dialog';
import { regeneratePinTextRequestSchema } from '@/lib/validations/pinterest';
import { COMPOSER_METADATA_KEY } from '@/lib/social/pin-display';
import { SocialGenerationError, type ArticlePinterestSource, type GenerateTextFn } from '@/lib/social/pinterest-from-article';
import type { MediaStorage } from '@/lib/storage';
import type { PinterestAngle } from '@/types/pinterest';
import type { Pin } from '@/types/database';

/**
 * TASK-099 — "Regenerate text + image prompts" and "Regenerate complete Pins".
 * Offline: the text model is an injected stub, the image model a fake module,
 * Supabase an in-memory fake recording every write. No network, no AI call.
 */

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const GEN_ID = '44444444-4444-4444-8444-444444444444';
const PIN_ID = '66666666-6666-4666-8666-666666666666';
const PIN_ID_2 = '77777777-7777-4777-8777-777777777777';
const LINK = 'https://crochet.example.test/granny-square-scarf/?utm_source=pinterest&utm_medium=social';
const IMAGE = 'https://media.example.test/images/pinterest/pin.jpg';

const OLD_TITLE = 'The Granny Square Scarf You Will Want to Make';
const OLD_PROMPT = 'A granny square scarf in cotton yarn folded on a white table, photorealistic';
const NEW_TITLE = 'Why This Granny Square Scarf Pattern Gets Saved';
const NEW_PROMPT =
  'A long granny square scarf in cream and sage cotton yarn draped over a light wooden chair, cluster stitch rounds visible, soft daylight, craft product photography, photorealistic, highly detailed';

// ---------------------------------------------------------------------------
// Fakes

type Row = Record<string, unknown>;
interface Write {
  kind: string;
  table: string;
  payload: unknown;
}

function fakeSupabase(tables: Record<string, Row[]>, options: { failPinUpdate?: boolean } = {}) {
  const writes: Write[] = [];
  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let pendingUpdate: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const failing = () => options.failPinUpdate === true && table === 'pins' && pendingUpdate !== null;
    const applyUpdate = () => {
      if (!pendingUpdate) return null;
      if (failing()) {
        pendingUpdate = null;
        return { message: 'update refused' };
      }
      for (const row of rows()) Object.assign(row, pendingUpdate);
      pendingUpdate = null;
      return null;
    };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      order: () => builder,
      limit: () => builder,
      single: async () => {
        const error = applyUpdate();
        const [row] = rows();
        return { data: error ? null : row ?? null, error: error ?? (row ? null : { message: 'not found' }) };
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
        const error = applyUpdate();
        return Promise.resolve({ data: error ? null : rows(), error }).then(resolve);
      },
      update(payload: Row) {
        writes.push({ kind: 'update', table, payload });
        pendingUpdate = payload;
        return builder;
      },
      insert: (payload: Row) => {
        writes.push({ kind: 'insert', table, payload });
        (tables[table] ??= []).push({ id: `row-${(tables[table] ?? []).length + 1}`, ...payload });
        return builder;
      },
      delete: () => (writes.push({ kind: 'delete', table, payload: null }), builder),
    };
    return builder;
  }
  const storage = { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) };
  return { client: { from, storage } as unknown as SupabaseClient, writes, tables };
}

function stub(response: string | (() => never)) {
  const calls: Parameters<GenerateTextFn>[0][] = [];
  const fn: GenerateTextFn = async (params) => {
    calls.push(params);
    if (typeof response === 'function') return response();
    return response;
  };
  return { fn, calls };
}

const plan = (pin: Row) => JSON.stringify({ pins: [pin] });
const promptOf = (calls: Parameters<GenerateTextFn>[0][]) => calls[0].messages.map((m) => m.content).join('\n');

function pinRow(overrides: Partial<Pin> = {}): Row {
  const pin: Pin = {
    id: PIN_ID,
    generation_id: GEN_ID,
    language: 'en',
    title: OLD_TITLE,
    description: 'Old description.',
    keywords: 'granny square scarf, old keyword',
    board: 'Crochet Scarves',
    board_id: 'board-1',
    board_section: 'Scarves',
    image_prompt: OLD_PROMPT,
    image_analysis: attachPinterestStrategyMetadata(null, 'curiosity'),
    media_url: IMAGE,
    link_url: LINK,
    publish_date: '2026-11-02T09:00:00Z',
    visual_format: 'photo-only',
    overlay_text: null,
    title_banner_template: null,
    cta_banner_template: null,
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
    ...overrides,
  };
  return pin as unknown as Row;
}

function db(pin: Partial<Pin> = {}, options: { failPinUpdate?: boolean; imageStatus?: string } = {}) {
  return fakeSupabase(
    {
      pins: [pinRow(pin), pinRow({ id: PIN_ID_2, title: 'Cozy Cotton Scarf Rounds to Try This Weekend' })],
      generations: [
        {
          id: GEN_ID,
          user_id: USER,
          project_id: PROJECT_ID,
          keyword: 'granny square scarf',
          language: 'en',
          status: 'completed',
          image_status: options.imageStatus ?? 'completed',
          source_type: null,
          source_wordpress_generation_id: null,
        },
      ],
      projects: [{ id: PROJECT_ID, user_id: USER, niche: 'Crochet', description: 'Cozy crochet blog.' }],
      boards: [{ id: 'board-1', name: 'Crochet Scarves', user_id: USER, project_id: PROJECT_ID }],
      content_stream_boards: [],
      pin_images: [{ id: 'image-1', pin_id: PIN_ID, version: 1, is_active: true, url: IMAGE, storage_path: 'old.jpg' }],
    },
    options
  );
}

const answer = (overrides: Row = {}) =>
  plan({
    title: NEW_TITLE,
    description: 'Cluster stitch rounds in cotton yarn, joined in one long strip — save it for your next scarf.',
    keywords: ['granny square scarf', 'cotton yarn scarf'],
    image_prompt: NEW_PROMPT,
    ...overrides,
  });

const PRESERVED = ['link_url', 'board', 'board_id', 'board_section', 'publish_date', 'media_url', 'visual_format', 'overlay_text', 'image_analysis'] as const;

function pinOf(fake: ReturnType<typeof db>, id = PIN_ID): Row {
  return fake.tables.pins.find((row) => row.id === id) as Row;
}

function expectOldPin(fake: ReturnType<typeof db>) {
  expect(fake.writes.filter((w) => w.table === 'pins' || w.table === 'pin_images')).toEqual([]);
  expect(pinOf(fake)).toMatchObject({ title: OLD_TITLE, image_prompt: OLD_PROMPT, media_url: IMAGE, link_url: LINK });
}

/** Runs `fn` with console output captured — what a failure writes to the server logs. */
async function capturingLogs<T>(fn: () => Promise<T>): Promise<{ result: T | unknown; logs: string[] }> {
  const logs: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const sink = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === 'string' ? arg : arg instanceof Error ? `${arg.name}: ${arg.message}` : JSON.stringify(arg))).join(' '));
  };
  console.log = sink;
  console.warn = sink;
  console.error = sink;
  try {
    const result = await fn().catch((error: unknown) => error);
    return { result, logs };
  } finally {
    Object.assign(console, original);
  }
}

async function runTextAndPrompt(fake: ReturnType<typeof db>, response: string | (() => never)) {
  const ai = stub(response);
  const prepared = await preparePinTextRegeneration(fake.client, USER, PIN_ID);
  const { result, logs } = await capturingLogs(() =>
    regenerateAndSavePinText(fake.client, prepared, { generateText: ai.fn }, { withImagePrompt: true })
  );
  return { ai, result, logs };
}

async function runComplete(fake: ReturnType<typeof db>, response: string | (() => never), renderImage?: RenderPinImageFn) {
  const ai = stub(response);
  const renders: Array<{ pin: Pin; pinUpdate: Row }> = [];
  const render: RenderPinImageFn =
    renderImage ??
    (async (pin, pinUpdate) => {
      renders.push({ pin, pinUpdate });
      // What generatePinImage writes on success: the new image with the text, in one update.
      await fake.client.from('pins').update({ ...pinUpdate, media_url: 'https://media.example.test/new.jpg' }).eq('id', pin.id);
    });
  const prepared = await preparePinTextRegeneration(fake.client, USER, PIN_ID);
  const { result, logs } = await capturingLogs(() =>
    regenerateCompletePin(fake.client, prepared, {
      generateText: ai.fn,
      renderImage: async (pin, pinUpdate) => {
        if (!renderImage) return render(pin, pinUpdate);
        renders.push({ pin, pinUpdate });
        return renderImage(pin, pinUpdate);
      },
    })
  );
  return { ai, result, logs, renders };
}

// ---------------------------------------------------------------------------
// Mode 1 — text + image prompts

test.describe('TASK-099 — Regenerate text + image prompts', () => {
  test('one text call: title, description, keywords and a new image_prompt saved in one update; image kept', async () => {
    const fake = db();
    const { ai, result } = await runTextAndPrompt(fake, answer());
    expect(ai.calls).toHaveLength(1);
    expect(result).toMatchObject({ title: NEW_TITLE, image_prompt: NEW_PROMPT, media_url: IMAGE });

    const pinWrites = fake.writes.filter((w) => w.table === 'pins');
    expect(pinWrites).toHaveLength(1);
    expect(Object.keys(pinWrites[0].payload as Row).sort()).toEqual(['description', 'image_prompt', 'keywords', 'title']);
    // No image row, no image of the Pin touched.
    expect(fake.writes.filter((w) => w.table === 'pin_images')).toEqual([]);
    const stored = pinOf(fake);
    expect(stored.image_prompt).toBe(NEW_PROMPT);
    expect(stored.image_prompt).not.toBe(OLD_PROMPT);
    for (const field of PRESERVED) expect(stored[field]).toEqual(pinRow()[field]);
    // The other Pin of the generation is never written.
    expect(pinOf(fake, PIN_ID_2).title).toBe('Cozy Cotton Scarf Rounds to Try This Weekend');
  });

  test('the prompt asks for a brand-new image_prompt and never sends the previous one', async () => {
    const fake = db();
    const { ai } = await runTextAndPrompt(fake, answer());
    const prompt = promptOf(ai.calls);
    expect(prompt).toContain('"image_prompt": "..."');
    expect(prompt).toContain('Write a brand-new image_prompt from the new title and description');
    expect(prompt).toContain('Never reuse, copy or paraphrase a previous image description');
    expect(prompt).not.toContain(OLD_PROMPT);
    // The angle of the Pin is the one asked for.
    expect(prompt).toContain('using the "curiosity" angle');
  });

  test('the new prompt no longer carries the old title or the old prompt: such answers are refused, nothing written', async () => {
    for (const image_prompt of [OLD_PROMPT, `${OLD_PROMPT}.`, `A scarf photo for "${OLD_TITLE}", cotton yarn on a white table, photorealistic`]) {
      const fake = db();
      const { result } = await runTextAndPrompt(fake, answer({ image_prompt }));
      expect(result).toBeInstanceOf(SocialGenerationError);
      expect((result as SocialGenerationError).toApiError()).toMatchObject({
        code: 'invalid_pin_plan',
        issues: [{ code: 'INVALID_PIN_TEXT', field: 'image_prompt' }],
      });
      expectOldPin(fake);
    }
    expect(imagePromptProblem(NEW_PROMPT, { previousPrompt: OLD_PROMPT, previousTitle: OLD_TITLE, newTitle: NEW_TITLE, forbiddenNumber: null })).toBeNull();
    // The old title quoted is fine only when the title did not change.
    expect(
      imagePromptProblem(`A scarf for ${OLD_TITLE}`, { previousPrompt: OLD_PROMPT, previousTitle: OLD_TITLE, newTitle: OLD_TITLE, forbiddenNumber: null })
    ).toBeNull();
  });

  test('a missing, empty or URL-only image_prompt is refused — never a silent fallback to the old prompt', async () => {
    for (const overrides of [{ image_prompt: undefined }, { image_prompt: '' }, { image_prompt: 'https://example.test/photo.jpg' }]) {
      const fake = db();
      const { ai, result } = await runTextAndPrompt(fake, answer(overrides));
      expect(ai.calls).toHaveLength(1);
      expect((result as SocialGenerationError).code).toBe('invalid_pin_plan');
      expectOldPin(fake);
    }
  });

  test('provider failure: nothing written, the Pin keeps its text, prompt and image', async () => {
    const fake = db();
    const { result } = await runTextAndPrompt(fake, () => {
      throw new Error('OpenRouter error: 500');
    });
    expect((result as SocialGenerationError).code).toBe('generation_failed');
    expectOldPin(fake);
  });

  test('the text step never reaches an image model', () => {
    for (const file of ['lib/pinterest/regenerate-text.ts', 'lib/pinterest/pin-text.ts']) {
      expect(read(file)).not.toMatch(/generateImage|resolveImageModel|pin-image-generation/);
    }
  });
});

// ---------------------------------------------------------------------------
// Mode 2 — complete Pins

test.describe('TASK-099 — Regenerate complete Pins', () => {
  test('one text call, then exactly one image render made from the new prompt; text + prompt + image saved together', async () => {
    const fake = db();
    const { ai, result, renders } = await runComplete(fake, answer());
    expect(ai.calls).toHaveLength(1);
    expect(renders).toHaveLength(1);
    expect(renders[0].pin).toMatchObject({ title: NEW_TITLE, image_prompt: NEW_PROMPT, link_url: LINK, board_section: 'Scarves' });
    expect(Object.keys(renders[0].pinUpdate).sort()).toEqual(['description', 'image_prompt', 'keywords', 'title']);
    expect(result).toMatchObject({ title: NEW_TITLE, image_prompt: NEW_PROMPT, media_url: 'https://media.example.test/new.jpg', link_url: LINK });
    const stored = pinOf(fake);
    for (const field of ['link_url', 'board', 'board_id', 'board_section', 'publish_date'] as const) expect(stored[field]).toEqual(pinRow()[field]);
  });

  test('a failed image: the Pin keeps its previous text, prompt and image; the error names the Pin', async () => {
    const fake = db();
    const { result, renders } = await runComplete(fake, answer(), async () => {
      throw new Error('provider timeout');
    });
    expect(renders).toHaveLength(1);
    expect(result).toBeInstanceOf(SocialGenerationError);
    expect((result as SocialGenerationError).code).toBe('image_failed');
    expect((result as SocialGenerationError).message).toContain(`"${OLD_TITLE}"`);
    expect((result as SocialGenerationError).message).toContain('previous text and image are kept');
    expectOldPin(fake);
  });

  test('an invalid text answer: no image call at all', async () => {
    const fake = db();
    const { result, renders } = await runComplete(fake, answer({ image_prompt: OLD_PROMPT }));
    expect((result as SocialGenerationError).code).toBe('invalid_pin_plan');
    expect(renders).toHaveLength(0);
    expectOldPin(fake);
  });

  test('a Step-by-step Pin (several images) is refused before any AI call', async () => {
    const fake = db({ image_analysis: JSON.stringify({ [COMPOSER_METADATA_KEY]: { templateType: 'step_by_step', panelCount: 3 } }) });
    const { ai, result, renders } = await runComplete(fake, answer());
    expect((result as SocialGenerationError).code).toBe('multi_image_pin');
    expect((result as SocialGenerationError).status).toBe(422);
    expect(ai.calls).toHaveLength(0);
    expect(renders).toHaveLength(0);
    expect(fake.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The real image pipeline (generatePinImage) with a fake image model

async function providerPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#6b8f71' } }).png().toBuffer();
}

async function withFakeImageModel<T>(
  generateImage: (input: { prompt: string }) => Promise<Buffer>,
  run: (pipeline: typeof import('@/lib/pinterest/pin-image-generation')) => Promise<T>
): Promise<T> {
  const engineKey = require.resolve('@/lib/ai/engine');
  const pipelineKey = require.resolve('@/lib/pinterest/pin-image-generation');
  const originals = new Map([engineKey, pipelineKey].map((key) => [key, require.cache[key]]));
  const fakeEngine = {
    generateImage,
    resolveImageModel: (visualFormat?: string) => ({ provider: 'openrouter', model: `test/${visualFormat ?? 'photo'}-model` }),
    generateText: async () => {
      throw new Error('Text generation must not be called');
    },
  };
  const originalLog = console.log;
  try {
    require.cache[engineKey] = { id: engineKey, filename: engineKey, loaded: true, exports: fakeEngine, children: [], paths: [], path: '', parent: null, isPreloading: false, require } as unknown as NodeJS.Module;
    delete require.cache[pipelineKey];
    console.log = () => undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return await run(require('@/lib/pinterest/pin-image-generation') as typeof import('@/lib/pinterest/pin-image-generation'));
  } finally {
    console.log = originalLog;
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }
}

function fakeMediaStorage() {
  const uploads: string[] = [];
  const removed: string[] = [];
  const storage = {
    provider: 'supabase',
    upload: async ({ key }: { key: string }) => (uploads.push(key), { key, publicUrl: `https://media.example.test/${key}` }),
    read: async () => Buffer.alloc(0),
    remove: async (keys: string[]) => void removed.push(...keys),
  } as unknown as MediaStorage;
  return { storage, uploads, removed };
}

test.describe('TASK-099 — image pipeline of a complete regeneration', () => {
  const pinUpdate = { title: NEW_TITLE, description: 'New description.', keywords: 'granny square scarf', image_prompt: NEW_PROMPT };

  test('photo Pin: one image call from the new prompt, one Pin-row update with text, prompt and image only', async () => {
    const fake = db();
    const media = fakeMediaStorage();
    const prompts: string[] = [];
    await withFakeImageModel(
      async ({ prompt }) => (prompts.push(prompt), providerPhoto()),
      async ({ generatePinImage, singlePinSlot }) => {
        const pin = { ...(pinRow() as unknown as Pin), ...pinUpdate };
        await generatePinImage(
          { supabase: fake.client as never, mediaStorage: media.storage, userId: USER, generationId: GEN_ID, niche: 'Crochet', allowedBannerTemplates: [] },
          pin,
          singlePinSlot(),
          { pinUpdate }
        );
      }
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(NEW_PROMPT);
    expect(prompts[0]).not.toContain(OLD_PROMPT);
    expect(media.uploads).toHaveLength(1);
    const pinWrites = fake.writes.filter((w) => w.table === 'pins');
    expect(pinWrites).toHaveLength(1);
    expect(Object.keys(pinWrites[0].payload as Row).sort()).toEqual(['description', 'image_prompt', 'keywords', 'media_url', 'title']);
    expect(pinOf(fake)).toMatchObject({ title: NEW_TITLE, image_prompt: NEW_PROMPT, link_url: LINK, board_section: 'Scarves', publish_date: '2026-11-02T09:00:00Z' });
  });

  test('image model failure: no upload, no image row, no Pin write', async () => {
    const fake = db();
    const media = fakeMediaStorage();
    let calls = 0;
    const error = await withFakeImageModel(
      async () => {
        calls += 1;
        throw new Error('provider timeout');
      },
      async ({ generatePinImage, singlePinSlot }) =>
        generatePinImage(
          { supabase: fake.client as never, mediaStorage: media.storage, userId: USER, generationId: GEN_ID, niche: 'Crochet', allowedBannerTemplates: [] },
          { ...(pinRow() as unknown as Pin), ...pinUpdate },
          singlePinSlot(),
          { pinUpdate }
        ).catch((e: unknown) => e)
    );
    expect(error).toBeInstanceOf(Error);
    expect(calls).toBe(1);
    expect(media.uploads).toEqual([]);
    expectOldPin(fake);
  });

  test('a refused Pin-row update: the previous image is active again, the new file removed, nothing of the regeneration kept', async () => {
    const fake = db({}, { failPinUpdate: true });
    const media = fakeMediaStorage();
    const error = await withFakeImageModel(
      async () => providerPhoto(),
      async ({ generatePinImage, singlePinSlot }) =>
        generatePinImage(
          { supabase: fake.client as never, mediaStorage: media.storage, userId: USER, generationId: GEN_ID, niche: 'Crochet', allowedBannerTemplates: [] },
          { ...(pinRow() as unknown as Pin), ...pinUpdate },
          singlePinSlot(),
          { pinUpdate }
        ).catch((e: unknown) => e)
    );
    expect((error as Error).name).toBe('PinImageError');
    expect((error as Error).message).toContain('previous text and image are kept');
    expect(media.removed).toEqual(media.uploads);
    expect(fake.tables.pin_images.find((row) => row.id === 'image-1')?.is_active).toBe(true);
    expect(fake.tables.pin_images.filter((row) => row.is_active === true)).toHaveLength(1);
    expect(pinOf(fake)).toMatchObject({ title: OLD_TITLE, image_prompt: OLD_PROMPT, media_url: IMAGE });
  });
});

// ---------------------------------------------------------------------------
// Confirmation

const composed = (value: Row) => JSON.stringify({ [COMPOSER_METADATA_KEY]: value });

test.describe('TASK-099 — confirmation of the paid images', () => {
  test('exact paid count: one per classic / AI-design Pin, none for a numbered Pin on the article photo; Step-by-step excluded', () => {
    const pins = [
      { id: 'a', title: 'Classic', image_analysis: null },
      { id: 'b', title: 'AI design', image_analysis: composed({ templateType: 'listicle_article_image', textTreatment: 'ai-design' }) },
      { id: 'c', title: 'Overlay', image_analysis: composed({ templateType: 'listicle_article_image', textTreatment: 'omniflow-overlay' }) },
      { id: 'd', title: 'Steps', image_analysis: composed({ templateType: 'step_by_step', panelCount: 3 }) },
    ];
    const planned = planCompleteRegeneration(pins);
    expect(planned.paidImages).toBe(2);
    expect(planned.eligible.map((pin) => pin.id)).toEqual(['a', 'b', 'c']);
    expect(planned.excluded.map((pin) => pin.id)).toEqual(['d']);
    expect(completeRegenerationConfirmation(planned.paidImages, planned.eligible.length)).toBe(
      'This will generate exactly 2 paid images for 3 Pins, after one text AI generation per Pin. A Pin whose image fails keeps its previous text and image.'
    );
    expect(completeRegenerationConfirmation(1, 1)).toContain('exactly 1 paid image for 1 Pin');
    expect(textAndPromptsConfirmation(4)).toContain('No image is generated — the current images are kept.');
  });

  test('two explicit modes; the paid run starts only from its confirm button, which states the count', () => {
    expect(REGENERATION_MODE_LABELS).toEqual({
      'text-and-image-prompt': 'Regenerate text + image prompts',
      complete: 'Regenerate complete Pins',
    });
    const dialog = read('components/pinterest/bulk-regenerate-text-dialog.tsx');
    expect(dialog).toContain('completeRegenerationConfirmation(completePlan.paidImages, completePlan.eligible.length)');
    expect(dialog).toContain('`Generate ${completePlan.paidImages} paid image');
    // Only eligible Pins are sent in the complete mode; a paid retry is confirmed again.
    expect(dialog).toContain("? completePlan.eligible.map((pin) => pin.id)");
    expect(dialog).toContain("setPhase({ kind: 'confirm', pinIds: [...phase.summary.failed, ...phase.summary.notProcessed], mode: 'complete' })");
  });

  test('request body: the default mode is text + image prompts; an unknown mode is refused', () => {
    expect(regeneratePinTextRequestSchema.parse({})).toEqual({ mode: 'text-and-image-prompt' });
    expect(regeneratePinTextRequestSchema.parse({ mode: 'complete' })).toEqual({ mode: 'complete' });
    expect(regeneratePinTextRequestSchema.safeParse({ mode: 'image' }).success).toBe(false);
    expect(regeneratePinTextRequestSchema.safeParse({ mode: 'complete', linkUrl: 'x' }).success).toBe(false);
  });

  test('route: complete-mode checks before the rate limit, image budget before the image call, text mode never renders', () => {
    const route = read('app/api/pinterest/pins/[id]/regenerate-text/route.ts');
    const textBranch = route.indexOf("if (mode === 'text-and-image-prompt' || !mediaStorage)");
    expect(route.indexOf('assertCompleteRegenerationAllowed(prepared.pin)')).toBeLessThan(route.indexOf("'pinterest/regenerate-pin'"));
    expect(route.indexOf("image_status === 'processing'")).toBeLessThan(route.indexOf("'pinterest/regenerate-pin'"));
    expect(route.indexOf("createMediaStorage(supabase, 'generated-images')")).toBeLessThan(route.indexOf("'pinterest/regenerate-pin'"));
    expect(textBranch).toBeGreaterThan(route.indexOf("'pinterest/regenerate-pin'"));
    expect(textBranch).toBeLessThan(route.indexOf("'pinterest/generate-images'"));
    expect(route.indexOf("'pinterest/generate-images'")).toBeLessThan(route.indexOf('generatePinImage('));
    expect(route.match(/generatePinImage\(/g)).toHaveLength(1);
    expect(route).not.toMatch(/link_url|board_section|publish_date|addPinterestUtm/);
  });
});

// ---------------------------------------------------------------------------
// Article kinds and numbered Pins

const SITE = 'https://clay.example.test';
function article(title: string, html: string): WordPressArticleContext {
  return buildWordPressArticleContext({
    sourceType: 'external_wordpress_post',
    html,
    title,
    excerpt: '',
    language: 'en',
    featuredImage: null,
    permalink: `${SITE}/post/`,
  });
}

const IDEAS = ['Smiling Cactus in a Mini Pot', 'Leaf-Imprint Trinket Dish', 'Tiny Green Dinosaur Figurine', 'Mossy Green Mushroom Sculpture', 'Four-Leaf Clover Magnet'];
const PROJECT_ARTICLE = article(
  '5 Green Air-Dry Clay Ideas for Cute DIY Decor',
  ['<p>Green air-dry clay makes cute decor.</p>', ...IDEAS.map((idea, i) => `<h2>${i + 1}. ${idea}</h2><p>Shape the ${idea.toLowerCase()} from green air-dry clay and let it dry overnight.</p>`)].join('\n')
);
const TIPS = ['Knead the clay before you start', 'Keep your hands slightly damp', 'Roll slabs to an even thickness', 'Let pieces dry slowly', 'Sand dry pieces gently'];
const TIPS_ARTICLE = article(
  '5 Air Dry Clay Tips for Beginners',
  ['<p>Air dry clay is easy to start with.</p>', ...TIPS.map((tip, i) => `<h2>${i + 1}. ${tip}</h2><p>${tip}: it keeps your air dry clay smooth and helps avoid cracks.</p>`)].join('\n')
);
const GENERIC_ARTICLE = article(
  'Why Air Dry Clay Cracks While It Dries',
  [
    '<p>Air dry clay loses water as it dries, and uneven drying makes it crack.</p>',
    '<h2>Thick and thin parts</h2><p>A clay dish with thick and thin parts dries unevenly on a wooden board.</p>',
    '<h2>Drying too fast</h2><p>A clay dish near a heater dries too fast and cracks at the rim.</p>',
  ].join('\n')
);

function articleSource(context: WordPressArticleContext): ArticlePinterestSource {
  return {
    articleId: null,
    sourceType: 'external_wordpress_post',
    externalPost: { siteId: 'site', postId: 1 },
    projectId: PROJECT_ID,
    title: context.title,
    metaTitle: context.title,
    metaDescription: '',
    content: '',
    primaryKeyword: 'air dry clay',
    seoKeywords: [],
    language: 'en',
    featuredImageUrl: null,
    featuredImagePrompt: null,
    niche: 'Clay Crafts & DIY',
    contentStreams: [],
    nicheSettings: null,
    brandProfileDescription: null,
    context,
  } as ArticlePinterestSource;
}

function articlePin(context: WordPressArticleContext, angle: PinterestAngle, sectionIndex = 0) {
  const kind = classifyArticleKind(context);
  const grounding = buildArticleGrounding(context, 3, {}, { niche: 'Clay Crafts & DIY', articleKind: kind });
  const sectionId = grounding.sectionPlan[sectionIndex];
  const image_analysis = attachArticleSourceMetadata(attachPinterestStrategyMetadata(null, angle), {
    sourceType: 'external_wordpress_post',
    sectionId,
    brief: grounding.briefs[sectionId],
  });
  return {
    pin: { id: PIN_ID, title: 'An Old Air Dry Clay Pin Title', description: 'Old.', keywords: 'air dry clay', image_prompt: 'An old clay scene, photorealistic', image_analysis, visual_format: 'photo-only' as const },
    kind,
    sectionId,
    brief: grounding.briefs[sectionId],
  };
}

function textSource(context: WordPressArticleContext): PinTextRegenerationSource {
  return { keyword: 'air dry clay', language: 'en', niche: 'Clay Crafts & DIY', contentStreams: [], nicheSettings: null, brandProfileDescription: null, article: articleSource(context) };
}

async function regenerateArticle(context: WordPressArticleContext, angle: PinterestAngle, response: Row) {
  const { pin, kind, sectionId } = articlePin(context, angle);
  const ai = stub(plan(response));
  const { result, logs } = await capturingLogs(() =>
    regeneratePinText({ pin, siblingTitles: [], source: textSource(context), withImagePrompt: true }, { generateText: ai.fn })
  );
  return { result, logs, ai, kind, sectionId };
}

test.describe('TASK-099 — project_listicle, tips_guide and generic_article', () => {
  test('the three fixtures classify as their kind', () => {
    expect(classifyArticleKind(PROJECT_ARTICLE)).toBe('project_listicle');
    expect(classifyArticleKind(TIPS_ARTICLE)).toBe('tips_guide');
    expect(classifyArticleKind(GENERIC_ARTICLE)).toBe('generic_article');
  });

  test('project_listicle: a prompt showing the section project is accepted; another project is refused', async () => {
    const ok = await regenerateArticle(PROJECT_ARTICLE, 'curiosity', {
      title: 'The Smiling Cactus Your Shelf Is Missing',
      description: 'Shape a smiling cactus in a mini pot from green air-dry clay. See how it comes together.',
      keywords: ['air dry clay', 'clay cactus'],
      image_prompt: 'A smiling cactus in a mini pot shaped from green air-dry clay on a plain white surface, soft natural light, craft product photography, photorealistic',
    });
    expect(ok.result).toMatchObject({ image_prompt: expect.stringContaining('smiling cactus') });
    expect(promptOf(ok.ai.calls)).toContain('<pin_plan>');

    const off = await regenerateArticle(PROJECT_ARTICLE, 'curiosity', {
      title: 'The Smiling Cactus Your Shelf Is Missing',
      description: 'Shape a smiling cactus in a mini pot from green air-dry clay. See how it comes together.',
      keywords: ['air dry clay', 'clay cactus'],
      image_prompt: 'A crochet cardigan in merino wool on a white table, photorealistic',
    });
    expect(off.result).toBeInstanceOf(SocialGenerationError);
    expect((off.result as SocialGenerationError).toApiError().issues?.some((issue) => issue.field === 'image_prompt')).toBe(true);
  });

  test('tips_guide: the prompt asks for the tip of the section; a prompt without that tip is refused', async () => {
    const ok = await regenerateArticle(TIPS_ARTICLE, 'curiosity', {
      title: 'The First Step Before Any Air Dry Clay Project',
      description: 'Knead the clay before you start to keep air dry clay smooth. See why it helps avoid cracks.',
      keywords: ['air dry clay', 'clay tips'],
      image_prompt: 'Hands kneading a ball of air dry clay on a smooth light wooden surface, soft natural light, craft photography, photorealistic',
    });
    expect(ok.kind).toBe('tips_guide');
    expect(ok.result).toMatchObject({ image_prompt: expect.stringContaining('kneading') });
    expect(promptOf(ok.ai.calls)).toContain('This article gives tips and techniques');

    const off = await regenerateArticle(TIPS_ARTICLE, 'curiosity', {
      title: 'The First Step Before Any Air Dry Clay Project',
      description: 'Knead the clay before you start to keep air dry clay smooth. See why it helps avoid cracks.',
      keywords: ['air dry clay', 'clay tips'],
      image_prompt: 'A finished clay vase on a plain white surface, soft natural light, photorealistic',
    });
    expect(off.result).toBeInstanceOf(SocialGenerationError);
    expect((off.result as SocialGenerationError).toApiError().issues?.map((issue) => issue.code)).toContain('IMAGE_SUBJECT_MISMATCH');
  });

  test('generic_article: a grounded prompt is accepted and saved as the new prompt', async () => {
    const ok = await regenerateArticle(GENERIC_ARTICLE, 'curiosity', {
      title: 'Why Your Air Dry Clay Dish Cracks',
      description: 'Thick and thin parts of air dry clay dry unevenly. Find out what changes the result.',
      keywords: ['air dry clay', 'clay cracks'],
      image_prompt: 'An air dry clay dish with thick and thin parts drying on a wooden board, soft natural light, craft photography, photorealistic',
    });
    expect(ok.kind).toBe('generic_article');
    expect(ok.result).toMatchObject({ image_prompt: expect.stringContaining('clay dish') });
  });

  test('a Pin that is not numbered: no badge or article count asked, and a prompt with them is refused', async () => {
    const response = {
      title: 'The Smiling Cactus Your Shelf Is Missing',
      description: 'Shape a smiling cactus in a mini pot from green air-dry clay. See how it comes together.',
      keywords: ['air dry clay', 'clay cactus'],
    };
    const clean = await regenerateArticle(PROJECT_ARTICLE, 'curiosity', {
      ...response,
      image_prompt: 'A smiling cactus in a mini pot shaped from green air-dry clay on a plain white surface, soft natural light, photorealistic',
    });
    expect(promptOf(clean.ai.calls)).toContain('This Pin is not a numbered Pin: its image_prompt must not show any number, count, badge or list');
    for (const image_prompt of [
      'A smiling cactus in a mini pot shaped from green air-dry clay with a round badge, plain white surface, photorealistic',
      'A smiling cactus in a mini pot shaped from green air-dry clay next to a big 5, plain white surface, photorealistic',
    ]) {
      const refused = await regenerateArticle(PROJECT_ARTICLE, 'curiosity', { ...response, image_prompt });
      expect((refused.result as SocialGenerationError).toApiError()).toMatchObject({ issues: [{ field: 'image_prompt' }] });
    }
  });

  test('a numbered Pin keeps the current count rules: no "not numbered" instruction, its numbered title is accepted', async () => {
    const numbered = await regenerateArticle(PROJECT_ARTICLE, 'listicle', {
      title: '5 Green Air-Dry Clay Ideas Starting With a Smiling Cactus',
      description: 'Shape a smiling cactus in a mini pot from green air-dry clay, then four more ideas. See them all.',
      keywords: ['air dry clay', 'clay ideas'],
      image_prompt: 'A smiling cactus in a mini pot shaped from green air-dry clay on a plain white surface, soft natural light, photorealistic',
    });
    expect(promptOf(numbered.ai.calls)).not.toContain('This Pin is not a numbered Pin');
    expect(numbered.result).toMatchObject({ title: expect.stringContaining('5 ') });
  });
});

// ---------------------------------------------------------------------------
// Logs

test.describe('TASK-099 — no model text and no full prompt in the logs', () => {
  test('rejections and failures log reasons and field names only', async () => {
    const secretTitle = 'A Secret Model Title That Must Stay Private';
    const secretPrompt = 'A secret model image prompt that must never be logged, photorealistic';
    const runs = [
      await runTextAndPrompt(db(), answer({ title: secretTitle, image_prompt: OLD_PROMPT })),
      await runTextAndPrompt(db(), answer({ title: secretTitle, image_prompt: '' })),
      await runTextAndPrompt(db(), 'not json at all — a secret model reply'),
      await runComplete(db(), answer({ title: secretTitle, image_prompt: secretPrompt }), async () => {
        throw new Error('provider timeout');
      }),
      await regenerateArticle(PROJECT_ARTICLE, 'curiosity', {
        title: secretTitle,
        description: 'Shape a smiling cactus in a mini pot from green air-dry clay.',
        keywords: ['air dry clay'],
        image_prompt: `${secretPrompt} with a badge`,
      }),
    ];
    const logs = runs.flatMap((run) => run.logs);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain(secretTitle);
      expect(line).not.toContain(secretPrompt);
      expect(line).not.toContain('secret model reply');
      expect(line).not.toContain(OLD_PROMPT);
      expect(line).not.toContain('You are an expert Pinterest');
    }
  });
});
