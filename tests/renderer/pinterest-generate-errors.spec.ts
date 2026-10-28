import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import * as wordpressPostSource from '@/lib/social/pinterest-from-wordpress-post';
import { buildWordPressArticleContext } from '@/lib/wordpress/article-context';
import { planArticlePinSections } from '@/lib/pinterest/article-briefs';

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

// Post 1489 shape: shelves exist in the bar cart section only, never in the curtain section.
const HOME_DECOR_HTML = `
<p>Neo Deco interpretiert Art déco für das moderne Wohnzimmer mit Geometrie, Samt und glänzenden Details.</p>
<h2>1. Ein geschwungenes Samtsofa als Mittelpunkt</h2><p>Ein Sofa mit weichen Rundungen gibt dem Raum die typische Silhouette. Dunkelgrüner Samt wirkt tief und wohnlich.</p>
<h2>2. Ein Barwagen als funktionales Art-déco-Detail</h2><p>Ein Barwagen auf Rollen mit zwei Regalböden aus Glas verbindet Dekoration und Alltag. Chrom und Glas wirken klassisch.</p>
<h2>3. Samtvorhänge in Waldgrün oder Burgunderrot</h2><p>Schwere, weich fallende Vorhänge rahmen das Fenster neben dem Sofa. Waldgrün passt zu Walnuss und Creme.</p>`;

const HOME_DECOR_POST = {
  id: 1489,
  title: 'Neo Deco Wohnzimmer: elegante Ideen für den Trend',
  date: '2026-10-25T00:00:00',
  status: 'publish',
  categories: ['Wohnzimmer'],
  featuredImage: null,
  categoryIds: [],
  excerpt: 'Neo Deco Ideen für das Wohnzimmer.',
  contentHtml: HOME_DECOR_HTML,
  tags: [],
  link: `${SITE}/neo-deco-wohnzimmer/`,
};

const homeDecorRequest = { ...articleRequest, keyword: 'Neo Deco Wohnzimmer', language: 'de', wordpressPost: { siteId: SITE_ID, postId: 1489 } };

const CURTAINS_PROMPT = 'A bright living room where dark forest green velvet curtains frame a tall window beside a sofa, eye-level, photorealistic.';
const SHELVES_PROMPT = CURTAINS_PROMPT.replace('beside a sofa', 'beside a sofa, with open wooden shelves on the wall');

function homeDecorPlan(curtainPrompt: string, sectionIds: string[]) {
  const prompts = [
    'A moody living room with a curved dark green velvet sofa as the focal point, soft daylight, wide shot, photorealistic.',
    'A modern living room with a chrome bar cart on wheels and two glass shelves, wide shot, photorealistic.',
    curtainPrompt,
  ];
  const titles = ['Was ein Samtsofa mit dem Raumgefühl macht', 'Barwagen im Alltag: Wo er wirklich hilft', 'Samtvorhänge im Wohnzimmer: Welche Farbe wirkt?'];
  return JSON.stringify({
    pins: sectionIds.map((sourceSectionId, index) => ({
      sourceSectionId,
      angle: ANGLES[index],
      title: titles[index],
      description: 'Eine Idee aus dem Neo-Deco-Wohnzimmer, die den Raum ruhiger und eleganter wirken lässt. Merke dir den Pin für dein nächstes Projekt.',
      keywords: 'neo deco, wohnzimmer, art deco',
      board: 'Wohnzimmer',
      image_prompt: prompts[index],
      visualFormat: 'photo',
    })),
  });
}

// Real post 2119 (6 Festive Crochet Cat Patterns…): the production
// "Expected: amigurumi. Detected: hat, ornament." case.
const CAT_FIXTURE = JSON.parse(readFileSync(join(__dirname, '../fixtures/pinterest/crochet-cat-amigurumi-post.json'), 'utf8'));
const CAT_POST = { ...CAT_FIXTURE, id: 2119, date: '2026-10-20T00:00:00', status: 'publish', categories: ['Crochet Christmas'], categoryIds: [], tags: [] };
const catRequest = { ...articleRequest, keyword: 'Christmas crochet cat patterns', wordpressPost: { siteId: SITE_ID, postId: 2119 } };
const KITTEN_ORNAMENT_ONLY = 'A small seated cream crocheted kitten Christmas ornament wearing a red Santa hat, with a hanging loop on top, plain cream surface, soft natural light, photorealistic.';
const KITTEN_AMIGURUMI = 'A small seated cream amigurumi crochet toy kitten wearing a red Santa hat, with a hanging loop on top, plain cream surface, soft natural light, photorealistic.';

function catPlan(kittenPrompt: string, sectionIds: string[]) {
  const prompts = [
    kittenPrompt,
    'A flat heart-shaped crochet ornament with an embroidered cat face, overhead on a plain light gray surface, soft natural light, photorealistic.',
    'A ginger amigurumi crochet toy cat with a Santa hat and a scarf, worked in the round, plain white backdrop, soft natural light, photorealistic.',
  ];
  const titles = ['What Makes a Crochet Kitten Feel Festive?', 'A Flat Cat Ornament for Quick Holiday Gifts', 'Christmas Cat Amigurumi You Can Follow Round by Round'];
  return JSON.stringify({
    pins: sectionIds.map((sourceSectionId, index) => ({
      sourceSectionId,
      angle: ANGLES[index],
      title: titles[index],
      description: 'A festive crochet cat idea from this Christmas pattern roundup. Save this Pin for your next holiday crochet session.',
      keywords: 'crochet cat, christmas crochet, amigurumi',
      board: 'Crochet',
      image_prompt: prompts[index],
      visualFormat: 'photo',
    })),
  });
}

type TextCall = { timeoutMs?: number; maxTokens?: number; system?: string; user?: string };
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
  options: { failPinsInsert?: boolean; homeDecor?: boolean; catPost?: boolean },
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

  const niche = options.homeDecor ? 'Home Decor' : 'Crochet';
  const project = { id: PROJECT_ID, description: null, niche, user_id: 'user-1', default_language: options.homeDecor ? 'de' : 'en' };

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

  const post = options.homeDecor ? HOME_DECOR_POST : options.catPost ? CAT_POST : {
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
      generateText: async (params: TextCall & { messages?: Array<{ content: string }> }) => {
        textCalls.push({ timeoutMs: params.timeoutMs, maxTokens: params.maxTokens, system: params.messages?.[0]?.content, user: params.messages?.[1]?.content });
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
          { niche, description: null, default_language: project.default_language }
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
    await withRoute([answer], {}, async ({ post, events, textCalls }) => {
      const res = await post(articleRequest);
      // Pin 1 also has an unplanned section: a repair cannot fix the batch, so none is tried.
      expect(textCalls).toHaveLength(1);
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

test.describe('Home Decor: section-grounded image elements and one targeted repair', () => {
  const sectionIds = () =>
    planArticlePinSections(
      buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html: HOME_DECOR_HTML, title: HOME_DECOR_POST.title, language: 'de' }),
      3
    );

  test('faithful curtain Pin: saved on the first answer, no repair call', async () => {
    await withRoute([homeDecorPlan(CURTAINS_PROMPT, sectionIds())], { homeDecor: true }, async ({ post, events, textCalls }) => {
      const res = await post(homeDecorRequest);
      expect(res.status).toBe(201);
      expect(textCalls).toHaveLength(1);
      expect(pinInserts(events)).toHaveLength(1);
    });
  });

  test('shelves in the curtain Pin (present only in another section) and a failed repair → 422, nothing saved', async () => {
    const stillShelves = JSON.stringify({ pins: [{ pin: 3, image_prompt: SHELVES_PROMPT }] });
    for (const repair of [stillShelves, 'not json', new Error('OpenRouter error: 503')]) {
      await withRoute([homeDecorPlan(SHELVES_PROMPT, sectionIds()), repair], { homeDecor: true }, async ({ post, events, textCalls }) => {
        const res = await post(homeDecorRequest);
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error.code).toBe('strategy_safeguard_failed');
        expect(body.error.issues).toEqual([expect.objectContaining({ code: 'UNGROUNDED_IMAGE_ELEMENTS', pinIndex: 3, field: 'image_prompt' })]);
        expect(body.error.issues[0].message).toContain('shelves');
        expect(textCalls).toHaveLength(2);
        expect(pinInserts(events)).toHaveLength(0);
        expect(generationUpdates(events).map((row) => row.status)).toEqual(['failed']);
      });
    }
  });

  test('a successful repair replaces only that image_prompt, is revalidated, then saved', async () => {
    const repaired = JSON.stringify({ pins: [{ pin: 3, image_prompt: CURTAINS_PROMPT }] });
    await withRoute([homeDecorPlan(SHELVES_PROMPT, sectionIds()), repaired], { homeDecor: true }, async ({ post, events, textCalls }) => {
      const res = await post(homeDecorRequest);
      expect(res.status).toBe(201);
      expect(textCalls).toHaveLength(2);
      // The repair asks to remove the fixed-vocabulary term, with the section's allowed furniture.
      expect(textCalls[1].user).toContain('Remove: shelves');
      expect(textCalls[1].user).toContain('Furniture and decor allowed: sofa, curtains');
      const rows = pinInserts(events)[0].row as Array<Record<string, unknown>>;
      const original = JSON.parse(homeDecorPlan(SHELVES_PROMPT, sectionIds())).pins;
      expect(rows).toHaveLength(3);
      expect(rows[2].image_prompt).toBe(CURTAINS_PROMPT);
      rows.forEach((row, index) => {
        expect(row.title).toBe(original[index].title);
        expect(row.description).toBe(original[index].description);
      });
      expect(rows[0].image_prompt).toBe(original[0].image_prompt);
      expect(rows[1].image_prompt).toBe(original[1].image_prompt);
    });
  });

  test('other failures are never "repaired": no second AI call', async () => {
    await withRoute([duplicatePlan()], {}, async ({ post, textCalls }) => {
      expect((await post(keywordRequest)).status).toBe(422);
      expect(textCalls).toHaveLength(1);
    });
  });
});

test.describe('Crochet: the amigurumi article and one targeted repair', () => {
  const catSectionIds = () =>
    planArticlePinSections(buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html: CAT_POST.contentHtml, title: CAT_POST.title, language: 'en' }), 3);

  test('a faithful batch is saved on the first answer: no repair, no image call, no destination URL added', async () => {
    await withRoute([catPlan(KITTEN_AMIGURUMI, catSectionIds())], { catPost: true }, async ({ post, events, textCalls }) => {
      const res = await post(catRequest);
      expect(res.status).toBe(201);
      expect(textCalls).toHaveLength(1);
      // The brief sent to the text model asks for the explicit anchor.
      expect(`${textCalls[0].system}\n${textCalls[0].user}`).toContain('(write "amigurumi crochet toy")');
      const rows = pinInserts(events)[0].row as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.link_url === null)).toBe(true);
      // generateImage / analyzeImage / fetch all throw in this harness: reaching 201 proves none ran,
      // and the post is only read through the faked loader — WordPress is never written.
    });
  });

  test('kitten ornament with a hat only → one repair naming amigurumi → only that image_prompt changes, then saved', async () => {
    const repaired = JSON.stringify({ pins: [{ pin: 1, image_prompt: KITTEN_AMIGURUMI }] });
    await withRoute([catPlan(KITTEN_ORNAMENT_ONLY, catSectionIds()), repaired], { catPost: true }, async ({ post, events, textCalls }) => {
      const res = await post(catRequest);
      expect(res.status).toBe(201);
      expect(textCalls).toHaveLength(2);
      expect(textCalls[1].user).toContain('Required primary subject: amigurumi.');
      expect(textCalls[1].user).toContain('write "amigurumi crochet toy" explicitly');
      const rows = pinInserts(events)[0].row as Array<Record<string, unknown>>;
      const original = JSON.parse(catPlan(KITTEN_ORNAMENT_ONLY, catSectionIds())).pins;
      expect(rows[0].image_prompt).toBe(KITTEN_AMIGURUMI);
      rows.forEach((row, index) => {
        expect(row.title).toBe(original[index].title);
        expect(row.description).toBe(original[index].description);
        if (index > 0) expect(row.image_prompt).toBe(original[index].image_prompt);
      });
    });
  });

  test('a failed repair → 422 with the required subject, nothing saved', async () => {
    const stillOrnament = JSON.stringify({ pins: [{ pin: 1, image_prompt: KITTEN_ORNAMENT_ONLY }] });
    for (const repair of [stillOrnament, 'not json', new Error('OpenRouter error: 503')]) {
      await withRoute([catPlan(KITTEN_ORNAMENT_ONLY, catSectionIds()), repair], { catPost: true }, async ({ post, events, textCalls }) => {
        const res = await post(catRequest);
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error.issues).toEqual([expect.objectContaining({ code: 'IMAGE_SUBJECT_MISMATCH', pinIndex: 1, field: 'image_prompt' })]);
        expect(body.error.issues[0].message).toBe(
          'Pin 1 does not clearly represent the article section. Expected: amigurumi. Detected: ornament, hat. Missing: amigurumi. Required subject: amigurumi.'
        );
        expect(body.error.issues[0].action).toContain('the image must show amigurumi as its main subject');
        expect(textCalls).toHaveLength(2);
        expect(pinInserts(events)).toHaveLength(0);
        expect(generationUpdates(events).map((row) => row.status)).toEqual(['failed']);
      });
    }
  });
});

test.describe('Visual style (TASK-078): Auto variety on article Pins, Classic by default', () => {
  const catSectionIds = () =>
    planArticlePinSections(buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html: CAT_POST.contentHtml, title: CAT_POST.title, language: 'en' }), 3);
  const storedBriefs = (events: RecordedEvent[]) =>
    (pinInserts(events)[0].row as Array<Record<string, unknown>>).map(
      (row) => JSON.parse(row.image_analysis as string)._articleSource.brief as { archetype?: { id: string }; subjectContract?: unknown }
    );

  test('Auto variety: one different archetype per Pin in the prompt and on each saved Pin; nothing else changes', async () => {
    await withRoute([catPlan(KITTEN_AMIGURUMI, catSectionIds())], { catPost: true }, async ({ post, events, textCalls }) => {
      const res = await post({ ...catRequest, visualStyle: 'auto-variety' });
      expect(res.status).toBe(201);
      expect(textCalls).toHaveLength(1);
      const prompt = `${textCalls[0].system}\n${textCalls[0].user}`;
      expect(prompt).toContain('Visual archetype for Pin 1:');
      expect(prompt).toContain('Visual archetype for Pin 3:');
      // The subject contract is still in the prompt.
      expect(prompt).toContain('(write "amigurumi crochet toy")');
      const briefs = storedBriefs(events);
      const archetypes = briefs.map((brief) => brief.archetype?.id);
      expect(archetypes.every(Boolean)).toBe(true);
      expect(new Set(archetypes).size).toBe(3);
      const rows = pinInserts(events)[0].row as Array<Record<string, unknown>>;
      const original = JSON.parse(catPlan(KITTEN_AMIGURUMI, catSectionIds())).pins;
      rows.forEach((row, index) => {
        // Destination URL untouched (none given, no permalink added), text and image prompt as returned.
        expect(row.link_url).toBeNull();
        expect(row.title).toBe(original[index].title);
        expect(row.image_prompt).toBe(original[index].image_prompt);
      });
    });
  });

  test('Classic (no visualStyle sent): same prompt and stored briefs as before, no archetype', async () => {
    await withRoute([catPlan(KITTEN_AMIGURUMI, catSectionIds())], { catPost: true }, async ({ post, events, textCalls }) => {
      const res = await post(catRequest);
      expect(res.status).toBe(201);
      expect(`${textCalls[0].system}\n${textCalls[0].user}`).not.toContain('Visual archetype');
      expect(storedBriefs(events).every((brief) => brief.archetype === undefined)).toBe(true);
    });
  });

  test('Auto variety without an article: 400 before any AI call, nothing created', async () => {
    await withRoute([], {}, async ({ post, events, textCalls }) => {
      const res = await post({ ...keywordRequest, visualStyle: 'auto-variety' });
      expect(res.status).toBe(400);
      expect(textCalls).toHaveLength(0);
      expect(events).toHaveLength(0);
    });
  });
});

test('the route declares a 180s maxDuration (longer than the 120s text timeout)', () => {
  const source = readFileSync('app/api/pinterest/generate/route.ts', 'utf8');
  expect(source).toMatch(/export const maxDuration = 180;/);
  expect(source).toMatch(/const ARTICLE_GROUNDED_TEXT_TIMEOUT_MS = 120_000;/);
});
