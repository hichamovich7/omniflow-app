import { expect, test } from 'playwright/test';
import {
  BOARD_SECTION_FORBIDDEN_CHARS,
  BOARD_SECTION_REQUIRES_BOARD_MESSAGE,
  generatePinsSchema,
} from '@/lib/validations/pinterest';

// Offline by construction: schema tests are pure. The route test replaces
// Supabase, the AI engine, the rate limiter and the board query, and stubs
// `fetch` — same harness pattern as pinterest-generation-plan.spec.ts. No
// OpenRouter, Vision or image request can leave this file.

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const baseRequest = {
  projectId: PROJECT_ID,
  keyword: 'summer appetizers',
  language: 'en',
  pinsRequested: 3,
  generationMode: 'legacy-composite',
};

// --- Schema ---------------------------------------------------------------

test('board + section: accepted, trimmed, case/accents/spaces preserved', () => {
  const parsed = generatePinsSchema.safeParse({
    ...baseRequest,
    board: 'Summer Eats',
    boardSection: '  Apéritifs d\'été  ',
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.board).toBe('Summer Eats');
    expect(parsed.data.boardSection).toBe('Apéritifs d\'été');
  }
});

test('board only, no section: accepted, boardSection stays undefined', () => {
  const parsed = generatePinsSchema.safeParse({ ...baseRequest, board: 'Summer Eats' });
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.boardSection).toBeUndefined();
  }
});

test('no board, no section: accepted (unchanged existing behavior)', () => {
  const parsed = generatePinsSchema.safeParse(baseRequest);
  expect(parsed.success).toBe(true);
});

test('empty-string section is converted to undefined (stored as null), not rejected', () => {
  const parsed = generatePinsSchema.safeParse({
    ...baseRequest,
    board: 'Summer Eats',
    boardSection: '   ',
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.boardSection).toBeUndefined();
  }
});

test('section without a board is rejected with a clear message', () => {
  const parsed = generatePinsSchema.safeParse({ ...baseRequest, boardSection: 'Appetizers' });
  expect(parsed.success).toBe(false);
  if (!parsed.success) {
    expect(parsed.error.issues[0].message).toBe(BOARD_SECTION_REQUIRES_BOARD_MESSAGE);
  }
});

test('section containing "/" is rejected — "/" is the Pinterest board/section separator', () => {
  expect(BOARD_SECTION_FORBIDDEN_CHARS.test('Appetizers/Cold')).toBe(true);
  const parsed = generatePinsSchema.safeParse({
    ...baseRequest,
    board: 'Summer Eats',
    boardSection: 'Appetizers/Cold',
  });
  expect(parsed.success).toBe(false);
});

test('section containing a backslash or a line break is rejected', () => {
  for (const boardSection of ['Appetizers\\Cold', 'Appetizers\nCold', 'Appetizers\rCold']) {
    const parsed = generatePinsSchema.safeParse({ ...baseRequest, board: 'Summer Eats', boardSection });
    expect(parsed.success).toBe(false);
  }
});

test('section over the max length is rejected', () => {
  const parsed = generatePinsSchema.safeParse({
    ...baseRequest,
    board: 'Summer Eats',
    boardSection: 'A'.repeat(101),
  });
  expect(parsed.success).toBe(false);
});

// --- Route: batch propagation ----------------------------------------------

interface RecordedEvent {
  table: string;
  op: 'insert' | 'update';
  row: unknown;
}

// Same fixture shape as pinterest-generation-plan.spec.ts (proven to clear
// Strategy Engine validation): distinct angle/title per index, avoiding
// unsupported numeric/claim tokens (see lib/pinterest/strategy.ts).
const ANGLES = ['curiosity', 'problem-solution', 'listicle', 'discovery', 'article-promise'] as const;

const TITLES = [
  'The Detail Most Summer Spreads Overlook',
  'Stuck On What To Serve? Start Here',
  'Appetizer Ideas Worth Saving For Later',
  'How A Calm Summer Table Comes Together',
  'A Practical Guide To Effortless Appetizers',
];

function pin(index: number) {
  return {
    angle: ANGLES[index % ANGLES.length],
    title: TITLES[index % TITLES.length],
    description:
      'Short on inspiration for your next gathering? These appetizer ideas keep the table light, colorful and shareable. Save them for your next summer get-together.',
    keywords: 'summer appetizers, party food, summer entertaining',
    board: 'AI Suggested Board',
    image_prompt: `A bright summer appetizer spread, scene variant ${index}, styled on a linen tablecloth with fresh herbs, warm natural light, editorial food photography, photorealistic.`,
    visualFormat: 'photo',
  };
}

function plan(count: number) {
  return { pins: Array.from({ length: count }, (_, index) => pin(index)) };
}

interface RouteHarness {
  post: (body: unknown) => Promise<Response>;
  events: RecordedEvent[];
}

async function withRoute(
  modelResponse: string,
  run: (harness: RouteHarness) => Promise<void>
): Promise<void> {
  const events: RecordedEvent[] = [];
  const harness: RouteHarness = {
    post: async () => {
      throw new Error('not initialised');
    },
    events,
  };

  const project = {
    id: PROJECT_ID,
    description: 'Summer recipes',
    niche: 'Food',
    user_id: 'user-1',
    default_language: 'en',
  };

  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }),
    },
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        insert: (row: unknown) => {
          events.push({ table, op: 'insert', row });
          return query;
        },
        update: (row: unknown) => {
          events.push({ table, op: 'update', row });
          return query;
        },
        single: async () => ({
          data: table === 'projects' ? project : table === 'generations' ? { id: 'generation-1' } : null,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return query;
    },
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
      generateText: async () => modelResponse,
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
  };

  const routeKey = require.resolve('@/app/api/pinterest/generate/route');
  const originals = new Map<string, NodeJS.Module | undefined>();
  const keys = [...Object.keys(fakes).map((specifier) => require.resolve(specifier)), routeKey];
  for (const key of keys) originals.set(key, require.cache[key]);

  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require('@/app/api/pinterest/generate/route') as {
      POST: (request: Request) => Promise<Response>;
    };
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
    globalThis.fetch = originalFetch;
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }
}

test('batch generation: the same board_section is propagated to every inserted pin', async () => {
  await withRoute(JSON.stringify(plan(3)), async (harness) => {
    const res = await harness.post({
      ...baseRequest,
      board: 'Summer Eats',
      boardSection: 'Appetizers',
    });
    expect(res.status).toBe(201);

    const insertedPins = harness.events.find((e) => e.table === 'pins')?.row as Array<Record<string, unknown>>;
    expect(insertedPins).toHaveLength(3);
    for (const row of insertedPins) {
      expect(row.board).toBe('Summer Eats');
      expect(row.board_section).toBe('Appetizers');
    }
  });
});

test('batch generation: no section requested stores board_section as null on every pin', async () => {
  await withRoute(JSON.stringify(plan(1)), async (harness) => {
    const res = await harness.post({ ...baseRequest, pinsRequested: 1, board: 'Summer Eats' });
    expect(res.status).toBe(201);

    const insertedPins = harness.events.find((e) => e.table === 'pins')?.row as Array<Record<string, unknown>>;
    expect(insertedPins).toHaveLength(1);
    for (const row of insertedPins) {
      expect(row.board_section).toBeNull();
    }
  });
});
