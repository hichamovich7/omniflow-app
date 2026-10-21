import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import * as wordpressPostSource from '@/lib/social/pinterest-from-wordpress-post';

// Offline route tests for POST /api/pinterest/generate failures (production
// 500 after 66.6s on a 7-Pin existing-WordPress-post generation). Supabase,
// the AI engine, the rate limiter, the board query and the WordPress read are
// replaced and `fetch` is stubbed — same harness pattern as
// pinterest-board-section.spec.ts. No OpenRouter, Vision or WordPress call.

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = '22222222-2222-4222-8222-222222222222';
const SITE = 'https://crochet.example.test';

const keywordRequest = {
  projectId: PROJECT_ID,
  keyword: 'summer appetizers',
  language: 'en',
  pinsRequested: 3,
  generationMode: 'legacy-composite',
};

const articleRequest = {
  projectId: PROJECT_ID,
  keyword: 'Autumn Brioche Crochet Cardigan',
  language: 'en',
  pinsRequested: 3,
  generationMode: 'photo-only',
  wordpressPost: { siteId: SITE_ID, postId: 1957 },
};

const ANGLES = ['curiosity', 'problem-solution', 'listicle'] as const;
const TITLES = [
  'The Detail Most Summer Spreads Overlook',
  'Stuck On What To Serve? Start Here',
  'Appetizer Ideas Worth Saving For Later',
];

function validPlan(count = 3) {
  return JSON.stringify({
    pins: Array.from({ length: count }, (_, index) => ({
      angle: ANGLES[index % ANGLES.length],
      title: TITLES[index % TITLES.length],
      description:
        'Short on inspiration for your next gathering? These appetizer ideas keep the table light, colorful and shareable. Save them for your next summer get-together.',
      keywords: 'summer appetizers, party food, summer entertaining',
      board: 'AI Suggested Board',
      image_prompt: `A bright summer appetizer spread, scene variant ${index}, styled on a linen tablecloth with fresh herbs, warm natural light, editorial food photography, photorealistic.`,
      visualFormat: 'photo',
    })),
  });
}

/** Three copies of one Pin: rejected by the strategy safeguards (duplicate titles/angles). */
function duplicatePlan() {
  const one = JSON.parse(validPlan(1)).pins[0];
  return JSON.stringify({ pins: [one, one, one] });
}

function abortError(name: 'AbortError' | 'TimeoutError') {
  return new DOMException('This operation was aborted', name);
}

const BRIOCHE_HTML = `
<p>This autumn crochet cardigan uses a textured stitch and a sideways body.</p>
<h2>Step-by-Step Construction Roadmap</h2>
<h3>1. Measure yourself and select a size</h3><p>Measure around the fullest part of your bust and compare it with a cardigan you already like.</p>
<h3>2. Make and measure a textured gauge swatch</h3><p>Work a swatch in the main stitch pattern and measure it after blocking.</p>
<h3>3. Prepare yarn and mark your size information</h3><p>Wind the yarn and note your size numbers before starting.</p>
<h3>4. Work the body sideways</h3><p>The body is worked sideways in rows.</p>`;

type TextCall = { timeoutMs?: number; maxTokens?: number };
type ModelStep = string | Error;

interface RecordedEvent {
  table: string;
  op: 'insert' | 'update';
  row: unknown;
}

interface Harness {
  post: (body: unknown) => Promise<Response>;
  events: RecordedEvent[];
  textCalls: TextCall[];
}

async function withRoute(
  steps: ModelStep[],
  options: { failPinsInsert?: boolean },
  run: (harness: Harness) => Promise<void>
): Promise<void> {
  const events: RecordedEvent[] = [];
  const textCalls: TextCall[] = [];
  let generationCount = 0;
  const harness: Harness = {
    post: async () => {
      throw new Error('not initialised');
    },
    events,
    textCalls,
  };

  const project = { id: PROJECT_ID, description: null, niche: 'Crochet', user_id: 'user-1', default_language: 'en' };

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }) },
    from(table: string) {
      let op: RecordedEvent['op'] | null = null;
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        insert: (row: unknown) => {
          op = 'insert';
          events.push({ table, op, row });
          return query;
        },
        update: (row: unknown) => {
          op = 'update';
          events.push({ table, op, row });
          return query;
        },
        single: async () => {
          if (table === 'projects') return { data: project, error: null };
          if (table === 'generations') return { data: { id: `generation-${++generationCount}` }, error: null };
          return { data: null, error: null };
        },
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data: null,
            error: table === 'pins' && op === 'insert' && options.failPinsInsert ? { message: 'insert failed', code: '23502' } : null,
          }),
      };
      return query;
    },
  };

  const post = {
    id: 1957,
    title: 'Autumn Brioche Crochet Cardigan: Size Guide, Steps & 6 Color Ideas',
    date: '2026-10-01T00:00:00',
    status: 'publish',
    categories: ['Crochet Cardigans'],
    featuredImage: null,
    categoryIds: [],
    excerpt: 'A textured autumn cardigan with a size guide and steps.',
    contentHtml: BRIOCHE_HTML,
    tags: [],
    link: `${SITE}/autumn-brioche-cardigan-guide/`,
  };

  const fakes: Record<string, unknown> = {
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/rate-limit': {
      checkRateLimit: async () => ({ allowed: true }),
      rateLimitErrorResponse: () => {
        throw new Error('rate limit response must not be reached');
      },
    },
    '@/lib/ai/engine': {
      generateText: async (params: TextCall) => {
        textCalls.push({ timeoutMs: params.timeoutMs, maxTokens: params.maxTokens });
        const step = steps.shift();
        if (step === undefined) throw new Error('unexpected AI call');
        if (step instanceof Error) throw step;
        return step;
      },
      analyzeImage: async () => {
        throw new Error('Vision must not be called');
      },
      generateImage: async () => {
        throw new Error('Image generation must not be called');
      },
      resolveImageModel: () => {
        throw new Error('Image routing must not be called');
      },
    },
    '@/lib/queries/boards': {
      findOrCreateBoardIds: async (_client: unknown, _project: string, _user: string, names: string[]) =>
        new Map(names.map((name, index) => [name.trim(), `board-${index}`])),
    },
    '@/lib/queries/niche-context': { listContentStreamNamesForBoard: async () => [], listContentStreamNamesForCategory: async () => [] },
    '@/lib/queries/niche-settings': { getProjectNicheSettings: async () => null },
    '@/lib/social/pinterest-from-wordpress-post': {
      ...wordpressPostSource,
      loadWordPressPostPinterestSource: async () => ({
        ...wordpressPostSource.buildWordPressPostPinterestSource(
          post,
          { id: SITE_ID, project_id: PROJECT_ID, site_url: SITE },
          { niche: 'Crochet', description: null, default_language: 'en' }
        ),
        contentStreams: [],
        nicheSettings: null,
      }),
    },
  };

  const routeKey = require.resolve('@/app/api/pinterest/generate/route');
  const originals = new Map<string, NodeJS.Module | undefined>();
  const keys = [...Object.keys(fakes).map((specifier) => require.resolve(specifier)), routeKey];
  for (const key of keys) originals.set(key, require.cache[key]);

  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  try {
    for (const [specifier, exports] of Object.entries(fakes)) {
      const filename = require.resolve(specifier);
      require.cache[filename] = {
        id: filename,
        filename,
        loaded: true,
        exports,
        children: [],
        paths: [],
        path: '',
        parent: null,
        isPreloading: false,
        require,
      } as unknown as NodeJS.Module;
    }
    delete require.cache[routeKey];

    globalThis.fetch = (async () => {
      throw new Error('No network call is allowed in this test');
    }) as typeof fetch;
    console.error = () => {};
    console.log = () => {};

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require('@/app/api/pinterest/generate/route') as { POST: (request: Request) => Promise<Response> };
    harness.post = (body) =>
      route.POST(
        new Request('http://localhost/api/pinterest/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );

    await run(harness);
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    globalThis.fetch = originalFetch;
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }
}

const pinInserts = (events: RecordedEvent[]) => events.filter((event) => event.table === 'pins' && event.op === 'insert');
const generationUpdates = (events: RecordedEvent[]) =>
  events.filter((event) => event.table === 'generations' && event.op === 'update').map((event) => event.row as Record<string, unknown>);

test.describe('AI timeout', () => {
  for (const name of ['AbortError', 'TimeoutError'] as const) {
    test(`${name}: structured 504, generation marked failed, no Pin saved`, async () => {
      await withRoute([abortError(name)], {}, async ({ post, events }) => {
        const res = await post(keywordRequest);
        expect(res.status).toBe(504);
        const body = await res.json();
        expect(body.data).toBeNull();
        expect(body.error.code).toBe('ai_timeout');
        expect(body.error.message).toContain('took too long');
        expect(body.error.message).toContain('Nothing was saved');
        expect(pinInserts(events)).toHaveLength(0);
        expect(generationUpdates(events)).toEqual([{ status: 'failed', error_message: body.error.message }]);
      });
    });
  }

  test('an article-grounded generation gives the text call 120s; the keyword flow keeps the provider default', async () => {
    await withRoute([abortError('AbortError'), abortError('AbortError')], {}, async ({ post, textCalls }) => {
      expect((await post(articleRequest)).status).toBe(504);
      expect((await post(keywordRequest)).status).toBe(504);
      expect(textCalls.map((call) => call.timeoutMs)).toEqual([120_000, undefined]);
    });
  });
});

test.describe('Other failures keep their structured answer and leave no partial data', () => {
  test('Pins rejected by the safeguards: 422, nothing saved', async () => {
    await withRoute([duplicatePlan()], {}, async ({ post, events }) => {
      const res = await post(keywordRequest);
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe('strategy_safeguard_failed');
      expect(pinInserts(events)).toHaveLength(0);
      expect(generationUpdates(events)).toHaveLength(1);
      expect(generationUpdates(events)[0].status).toBe('failed');
    });
  });

  test('article flow: a step Pin showing only a gauge swatch → 422 IMAGE_SUBJECT_MISMATCH, nothing saved', async () => {
    const answer = JSON.stringify({
      pins: [
        ['s1', 'curiosity', 'Choosing a Crochet Cardigan Size? Start With Your Measurements', 'A crochet cardigan centered on a plain cream surface while a flexible tape measures the bust, soft natural light.'],
        ['s2', 'problem-solution', 'Crochet Gauge Feeling Too Dense? Check Your Swatch First', 'A single textured crochet gauge swatch sits front and center on a plain light gray surface, soft natural light.'],
        ['s3', 'listicle', 'Before the Cardigan Repeats Begin, Set Up These Checkpoints', 'A crochet cardigan body in progress on a plain natural wood surface, overhead, soft natural light.'],
      ].map(([sourceSectionId, angle, title, image_prompt]) => ({
        sourceSectionId,
        angle,
        title,
        description: 'A practical step from the Autumn Brioche Crochet Cardigan guide. Save this pin for your next crochet session.',
        keywords: 'crochet cardigan, autumn crochet, crochet pattern',
        board: 'Crochet',
        image_prompt,
        visualFormat: 'photo',
      })),
    });
    await withRoute([answer], {}, async ({ post, events }) => {
      const res = await post(articleRequest);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe('strategy_safeguard_failed');
      const mismatch = body.error.issues.find((issue: { code: string }) => issue.code === 'IMAGE_SUBJECT_MISMATCH');
      expect(mismatch).toMatchObject({ pinIndex: 2 });
      expect(mismatch.message).toContain('Expected: cardigan. Detected: no recognizable project. Missing: cardigan.');
      expect(pinInserts(events)).toHaveLength(0);
      expect(generationUpdates(events).map((row) => row.status)).toEqual(['failed']);
    });
  });

  test('invalid AI response (not JSON): 422 invalid_pin_plan, nothing saved', async () => {
    await withRoute(['Sorry, I cannot help with that.'], {}, async ({ post, events }) => {
      const res = await post(keywordRequest);
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe('invalid_pin_plan');
      expect(pinInserts(events)).toHaveLength(0);
      expect(generationUpdates(events)[0].status).toBe('failed');
    });
  });

  test('provider HTTP error: unchanged 500 generation_failed', async () => {
    await withRoute([new Error('OpenRouter error: 503')], {}, async ({ post, events }) => {
      const res = await post(keywordRequest);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toEqual({ code: 'generation_failed', message: 'AI provider is temporarily unavailable. Try again shortly.' });
      expect(pinInserts(events)).toHaveLength(0);
    });
  });

  test('save error: one atomic insert refused → 500 server_error, generation failed, never completed', async () => {
    await withRoute([validPlan()], { failPinsInsert: true }, async ({ post, events }) => {
      const res = await post(keywordRequest);
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe('server_error');
      expect(pinInserts(events)).toHaveLength(1);
      const statuses = generationUpdates(events).map((row) => row.status);
      expect(statuses).toEqual(['failed']);
    });
  });

  test('a retry after a timeout saves its Pins once, on its own generation', async () => {
    await withRoute([abortError('AbortError'), validPlan()], {}, async ({ post, events }) => {
      expect((await post(keywordRequest)).status).toBe(504);
      const retry = await post(keywordRequest);
      expect(retry.status).toBe(201);
      expect((await retry.json()).data.generationId).toBe('generation-2');
      const inserts = pinInserts(events);
      expect(inserts).toHaveLength(1);
      const rows = inserts[0].row as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(3);
      expect(new Set(rows.map((row) => row.generation_id))).toEqual(new Set(['generation-2']));
    });
  });
});

test('the route declares a 180s maxDuration (longer than the 120s text timeout)', () => {
  const source = readFileSync('app/api/pinterest/generate/route.ts', 'utf8');
  expect(source).toMatch(/export const maxDuration = 180;/);
  expect(source).toMatch(/const ARTICLE_GROUNDED_TEXT_TIMEOUT_MS = 120_000;/);
});
