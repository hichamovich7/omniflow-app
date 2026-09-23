import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { generatePinsSchema } from '@/lib/validations/pinterest';
import { buildPinterestPinsPrompt } from '@/lib/prompts/pinterest-pins';
import { parsePinterestGenerationPlan } from '@/lib/pinterest/generation-plan';
import {
  attachAiIntegratedMetadata,
  buildAiIntegratedImagePrompt,
  readAiIntegratedMetadata,
  resolveAiIntegratedText,
  type AiIntegratedSettings,
} from '@/lib/pinterest/ai-integrated';

// Offline: pure functions and static source checks only. No provider is called.

const baseRequest = {
  projectId: '11111111-1111-4111-8111-111111111111',
  keyword: 'small bathroom ideas',
  language: 'en',
  pinsRequested: 5,
};

const settings: AiIntegratedSettings = {
  creativeFormat: 'hero-pin',
  strategy: 'ai-recommends',
  headline: { mode: 'generate' },
  subtitle: { mode: 'generate' },
  cta: { mode: 'generate' },
  maximumTextLines: 4,
  importance: { headline: 'high', subtitle: 'medium', cta: 'low' },
};

const ELEMENTS = ['headline', 'subtitle', 'cta'] as const;
type Element = (typeof ELEMENTS)[number];

const generated = { headline: 'Generated headline', subtitle: 'Generated subtitle', cta: 'Generated cta' };

function withNone(element: Element): AiIntegratedSettings {
  return { ...settings, importance: { ...settings.importance, [element]: 'none' } };
}

function request(aiIntegrated: unknown) {
  return generatePinsSchema.safeParse({ ...baseRequest, generationMode: 'ai-integrated', aiIntegrated });
}

function imagePrompt(text: { headline: string | null; subtitle: string | null; cta: string | null }, s = settings) {
  return buildAiIntegratedImagePrompt(
    { image_prompt: 'A realistic crochet cat on a craft table.', language: 'en', board: 'Crochet' },
    { language: 'en', settings: s, text }
  );
}

function planningPrompt(aiIntegrated: AiIntegratedSettings) {
  return buildPinterestPinsPrompt({
    keyword: 'small bathroom ideas',
    language: 'en',
    pinsRequested: 5,
    textOverlayMode: 'auto',
    generationMode: 'ai-integrated',
    aiIntegrated,
  }).user;
}

test('the request schema accepts importance none for Headline, Subtitle and CTA', () => {
  for (const element of ELEMENTS) {
    expect(request(withNone(element)).success, element).toBe(true);
  }
  expect(request({ ...settings, importance: { headline: 'none', subtitle: 'none', cta: 'high' } }).success).toBe(true);
});

test('the request schema rejects a request where every element is disabled', () => {
  const none = request({ ...settings, importance: { headline: 'none', subtitle: 'none', cta: 'none' } });
  expect(none.success).toBe(false);
  if (!none.success) expect(none.error.issues[0].message).toContain('At least one of Headline, Subtitle or CTA');

  const byMode = request({
    ...settings,
    subtitle: { mode: 'none' },
    cta: { mode: 'none' },
    importance: { headline: 'none', subtitle: 'low', cta: 'low' },
  });
  expect(byMode.success).toBe(false);
});

test('exact text combined with importance none is rejected for each element', () => {
  const exact = { mode: 'exact', text: 'My exact text' } as const;
  for (const element of ELEMENTS) {
    const parsed = request({ ...withNone(element), [element]: exact });
    expect(parsed.success, element).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path.join('.')).toContain(`importance.${element}`);
      expect(parsed.error.issues[0].message).toContain('importance is None');
    }
  }
});

test('the form shows None in the three importance selects, with help, and clears a conflicting exact text', () => {
  const form = readFileSync('components/pinterest/pin-form.tsx', 'utf8');
  const start = form.indexOf("['Headline', 'headline', headlineImportance]");
  const block = form.slice(start, form.indexOf('importance-none-help', start));
  expect(start).toBeGreaterThan(-1);
  // One shared render for the three selects, so a single None item covers all of them.
  for (const item of ['value="high"', 'value="medium"', 'value="low"', 'value="none">None</SelectItem>']) {
    expect(block).toContain(item);
  }
  expect(form).toContain("['CTA', 'cta', ctaImportance]");
  expect(form).toContain('None = do not generate this text element.');

  const handler = form.slice(form.indexOf('function handleImportanceChange'), form.indexOf('const boardOptions'));
  expect(handler).toContain("if (next === 'none')");
  for (const reset of ["setHeadlineText('')", "setSubtitleText('')", "setCtaText('')"]) {
    expect(handler).toContain(reset);
  }
  // The text area and the mode select are locked while importance is None.
  expect(form).toContain('disabled={importanceNone}');
  expect(form).toContain("mode === 'exact' && !importanceNone");
});

test('each element set to none is absent from the planning prompt, the result and the image prompt', () => {
  for (const element of ELEMENTS) {
    const s = withNone(element);
    const label = element === 'cta' ? 'cta' : element;

    const planning = planningPrompt(s);
    expect(planning, element).toContain(`Omit ${label}.`);
    expect(planning).not.toContain(`"${element}": "..."`);
    for (const other of ELEMENTS.filter((name) => name !== element)) {
      expect(planning).toContain(`"${other}": "..."`);
    }
    expect(planning).toContain('never write "None", "N/A", or an empty string');

    // Whatever the model returned for the disabled element (even a fake) is dropped.
    const resolved = resolveAiIntegratedText(s, { ...generated, [element]: 'N/A' });
    expect(resolved[element]).toBeNull();
    for (const other of ELEMENTS.filter((name) => name !== element)) {
      expect(resolved[other]).toBe(generated[other]);
    }

    const prompt = imagePrompt(resolved, s);
    expect(prompt).toContain('Do NOT render a');
    expect(prompt).toContain('NONE — render no element for this field');
    expect(prompt).not.toContain(generated[element]);
    expect(prompt).toContain(`${element === 'cta' ? 'CTA' : element[0].toUpperCase() + element.slice(1)} (omitted)`);
  }
});

test('Subtitle none removes the subtitle from the prompt and the persisted result', () => {
  const s = withNone('subtitle');
  const resolved = resolveAiIntegratedText(s, generated);
  expect(resolved).toEqual({ headline: 'Generated headline', subtitle: null, cta: 'Generated cta' });

  const prompt = imagePrompt(resolved, s);
  expect(prompt).toContain('Do NOT render a subtitle');
  expect(prompt).toContain('Keep a clear hierarchy between headline and CTA.');
  expect(prompt).not.toContain('Generated subtitle');

  const stored = readAiIntegratedMetadata(attachAiIntegratedMetadata(null, { language: 'en', settings: s, text: resolved }));
  expect(stored?.text.subtitle).toBeNull();
});

test('Headline none persists a null headline and still produces a valid plan without one', () => {
  const s = withNone('headline');
  const resolved = resolveAiIntegratedText(s, { subtitle: 'Generated subtitle', cta: 'Generated cta' });
  expect(resolved.headline).toBeNull();

  const stored = readAiIntegratedMetadata(attachAiIntegratedMetadata(null, { language: 'en', settings: s, text: resolved }));
  expect(stored?.text).toEqual({ headline: null, subtitle: 'Generated subtitle', cta: 'Generated cta' });

  const pin = {
    angle: 'curiosity',
    title: 'A title',
    description: 'A description',
    keywords: 'a, b',
    board: 'Board',
    image_prompt: 'A scene.',
    visualFormat: 'photo',
    integratedText: { subtitle: 'Generated subtitle', cta: 'Generated cta' },
  };
  expect(parsePinterestGenerationPlan(JSON.stringify({ pins: [pin] })).pins[0].integratedText?.headline).toBeUndefined();
});

test('pins persisted before the option (string headline) remain readable', () => {
  const stored = readAiIntegratedMetadata(
    attachAiIntegratedMetadata(null, {
      language: 'en',
      settings,
      text: { headline: 'OLD HEADLINE', subtitle: null, cta: null },
    })
  );
  expect(stored?.text.headline).toBe('OLD HEADLINE');
});

test('with all three elements enabled the behavior and both prompts are unchanged', () => {
  expect(request(settings).success).toBe(true);
  expect(resolveAiIntegratedText(settings, generated)).toEqual(generated);

  const prompt = imagePrompt(generated as { headline: string; subtitle: string; cta: string });
  expect(prompt).not.toContain('Do NOT render');
  expect(prompt).toContain(
    'Use no more than 4 total visible text lines. Keep a clear hierarchy between headline, subtitle, and CTA.'
  );
  expect(prompt).toContain('Headline (primary): "Generated headline"');
  expect(prompt).toContain('Subtitle (secondary): "Generated subtitle"');
  expect(prompt).toContain('CTA (subtle): "Generated cta"');

  const planning = planningPrompt(settings);
  expect(planning).toContain('"integratedText": { "headline": "...", "subtitle": "...", "cta": "..." }');
  expect(planning).not.toContain('Omit ');
  expect(planning).toContain('Generate a concise, compelling headline.');
});

test('Maximum text lines counts only enabled elements', () => {
  // Enabled exact headline uses all 3 lines; the two disabled elements use none.
  const parsed = request({
    ...settings,
    headline: { mode: 'exact', text: 'one\ntwo\nthree' },
    maximumTextLines: 3,
    importance: { headline: 'high', subtitle: 'none', cta: 'none' },
  });
  expect(parsed.success).toBe(true);

  // Disabled by importance: even a multi-line model answer never consumes a line.
  const s: AiIntegratedSettings = {
    ...settings,
    headline: { mode: 'exact', text: 'one\ntwo' },
    maximumTextLines: 2,
    importance: { headline: 'high', subtitle: 'none', cta: 'none' },
  };
  expect(() => resolveAiIntegratedText(s, { subtitle: 'a\nb\nc', cta: 'x\ny' })).not.toThrow();

  // The same lines on an enabled element still overflow.
  expect(
    request({
      ...settings,
      headline: { mode: 'exact', text: 'one\ntwo\nthree' },
      subtitle: { mode: 'exact', text: 'four' },
      maximumTextLines: 3,
    }).success
  ).toBe(false);
});

test('Legacy Composite and Photo Only are unchanged', () => {
  expect(generatePinsSchema.safeParse(baseRequest).success).toBe(true);
  expect(generatePinsSchema.safeParse({ ...baseRequest, generationMode: 'photo-only' }).success).toBe(true);
  // Text importance is an AI Integrated setting only.
  expect(
    generatePinsSchema.safeParse({ ...baseRequest, generationMode: 'photo-only', aiIntegrated: settings }).success
  ).toBe(true);

  for (const generationMode of ['photo-only', 'legacy-composite'] as const) {
    const prompt = buildPinterestPinsPrompt({
      keyword: 'small bathroom ideas',
      language: 'en',
      pinsRequested: 5,
      textOverlayMode: 'auto',
      generationMode,
    }).user;
    expect(prompt).not.toContain('integratedText');
    expect(prompt).not.toContain('Omit headline');
  }

  const legacyRoute = readFileSync('app/api/pinterest/generate-images/route.ts', 'utf8');
  expect(legacyRoute).toContain("if (generationMode !== 'legacy-composite')");
});

// --- All three importances None: inline alert, client guard, server backstop ---

const ALL_NONE_MESSAGE =
  'Headline, subtitle and CTA cannot all be set to None. Select at least one text element, or use Photo Only for an image without text.';

test('the inline alert shows the exact message only when all three importances are None', () => {
  const form = readFileSync('components/pinterest/pin-form.tsx', 'utf8');

  expect(form).toContain(`const ALL_TEXT_NONE_MESSAGE =\n  '${ALL_NONE_MESSAGE}'`);
  // Derived from the three importance states, never stored, so it appears
  // immediately and disappears as soon as any single element is re-enabled.
  const derived = form.slice(form.indexOf('const allTextImportanceNone ='), form.indexOf('async function handleSubmit'));
  expect(derived).toContain("generationMode === 'ai-integrated'");
  for (const state of ['headlineImportance', 'subtitleImportance', 'ctaImportance']) {
    expect(derived).toContain(`${state} === 'none'`);
  }
  expect(derived.match(/&&/g)).toHaveLength(3);
  expect(derived).not.toContain('useState');

  // Rendered inline (no native dialog), announced to assistive tech.
  expect(form.match(/\{allTextImportanceNone && \(/g)).toHaveLength(1);
  const alert = form.slice(form.indexOf('{allTextImportanceNone && ('));
  expect(alert.slice(0, 400)).toContain('role="alert"');
  expect(alert.slice(0, 500)).toContain('{ALL_TEXT_NONE_MESSAGE}');
  expect(form).not.toMatch(/window\.alert|\balert\(/);
  // It sits in the AI Integrated settings section, after the importance help line.
  expect(form.indexOf('importance-none-help')).toBeLessThan(form.indexOf('{allTextImportanceNone && ('));
  expect(form.indexOf('id="ai-integrated-settings"')).toBeLessThan(form.indexOf('{allTextImportanceNone && ('));
});

test('submission is blocked before validation and before any request, and the choices are kept', () => {
  const form = readFileSync('components/pinterest/pin-form.tsx', 'utf8');
  const submit = form.slice(form.indexOf('async function handleSubmit'), form.indexOf('return (\n    <div className="pt-4'));

  const guard = submit.indexOf('if (allTextImportanceNone) return;');
  expect(guard).toBeGreaterThan(-1);
  expect(guard).toBeLessThan(submit.indexOf('generatePinsSchema.safeParse'));
  expect(guard).toBeLessThan(submit.indexOf('setLoading(true)'));
  expect(guard).toBeLessThan(submit.indexOf("fetch('/api/pinterest/generate'"));
  expect(submit.match(/fetch\(/g)).toHaveLength(1);

  // The guard only returns: no importance, mode or text state is reset.
  const guardBlock = submit.slice(guard, guard + 60);
  expect(guardBlock).not.toMatch(/set[A-Z]\w+\(/);
});

test('normal configurations are not blocked by the guard', () => {
  const form = readFileSync('components/pinterest/pin-form.tsx', 'utf8');
  // The guard needs all three to be none; the other combinations keep working.
  for (const importance of [
    { headline: 'high', subtitle: 'medium', cta: 'low' },
    { headline: 'none', subtitle: 'none', cta: 'low' },
    { headline: 'none', subtitle: 'medium', cta: 'none' },
    { headline: 'high', subtitle: 'none', cta: 'none' },
  ]) {
    expect(request({ ...settings, importance }).success, JSON.stringify(importance)).toBe(true);
  }
  expect(form).toContain("headlineImportance === 'none' &&");
});

test('a direct request with three None importances is still rejected by the server with 400 invalid_request', async () => {
  const routeKey = require.resolve('@/app/api/pinterest/generate/route');
  const fakeModules: Record<string, unknown> = {
    '@/lib/supabase/server': {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }) },
        from: () => {
          throw new Error('The database must not be reached');
        },
      }),
    },
    '@/lib/rate-limit': { checkRateLimit: async () => ({ allowed: true }), rateLimitErrorResponse: () => new Response(null, { status: 429 }) },
    '@/lib/ai/engine': {
      generateText: async () => {
        throw new Error('No AI call is allowed');
      },
      analyzeImage: async () => {
        throw new Error('No Vision call is allowed');
      },
    },
    '@/lib/queries/boards': {
      findOrCreateBoardIds: async () => {
        throw new Error('No board work is allowed');
      },
    },
  };

  const originals = new Map<string, NodeJS.Module | undefined>();
  const keys = [...Object.keys(fakeModules).map((specifier) => require.resolve(specifier)), routeKey];
  for (const key of keys) originals.set(key, require.cache[key]);
  const originalFetch = globalThis.fetch;

  try {
    for (const [specifier, exports] of Object.entries(fakeModules)) {
      const filename = require.resolve(specifier);
      require.cache[filename] = {
        id: filename, filename, loaded: true, exports, children: [], paths: [], path: '', parent: null, isPreloading: false, require,
      } as unknown as NodeJS.Module;
    }
    delete require.cache[routeKey];
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error('No network call is allowed');
    }) as typeof fetch;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require('@/app/api/pinterest/generate/route') as { POST: (request: Request) => Promise<Response> };
    const post = (aiIntegrated: unknown) =>
      route.POST(
        new Request('http://localhost/api/pinterest/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseRequest, generationMode: 'ai-integrated', aiIntegrated }),
        })
      );

    const response = await post({ ...settings, importance: { headline: 'none', subtitle: 'none', cta: 'none' } });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toContain('At least one of Headline, Subtitle or CTA');
    expect(fetchCalls).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }
});
