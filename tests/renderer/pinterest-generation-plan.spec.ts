import { expect, test } from 'playwright/test';
import {
  PIN_PLAN_FAILURE_MESSAGE,
  PinterestPlanError,
  parsePinterestGenerationPlan,
} from '@/lib/pinterest/generation-plan';
import type { PinterestPlanFailureKind } from '@/lib/pinterest/generation-plan';
import {
  PROMPT_ID,
  buildPinterestPinsPrompt,
  estimateMaxTokens,
} from '@/lib/prompts/pinterest-pins';

// Offline by construction: the parser is pure and the route test replaces
// Supabase, the AI engine, the rate limiter and the board query, and stubs
// `fetch`. No OpenRouter, Vision or image request can leave this file.

const ANGLES = ['curiosity', 'problem-solution', 'listicle', 'discovery', 'article-promise'] as const;

const TITLES = [
  'Das Detail, das kleine Bäder oft übersehen',
  'Zu wenig Stauraum im Bad? Hier beginnt die Lösung',
  'Stauraum-Ideen für kleine Badezimmer zum Speichern',
  'Wie ruhig ein kleines Bad mit Stauraum wirken kann',
  'Praktischer Leitfaden für Stauraum im kleinen Bad',
  'Nischen und Regale, die kleine Bäder größer machen',
  'Aufbewahrung im Bad: Was wirklich Platz schafft',
];

function pin(index: number, overrides: Record<string, unknown> = {}) {
  return {
    angle: ANGLES[index % ANGLES.length],
    title: TITLES[index % TITLES.length],
    description:
      'Wenig Platz im Bad? Diese durchdachten Ideen zeigen, wie Wandregale, Nischen und Spiegelschränke jeden Zentimeter nutzen. Entdecken Sie Lösungen, die aufgeräumt und modern wirken. Speichern Sie die Ideen für Ihr nächstes Projekt.',
    keywords:
      'badezimmer stauraum, kleines bad ideen, badezimmer organisation, wandregal bad, spiegelschrank, badezimmer aufbewahrung, kleines badezimmer einrichten, bad ordnung, badmöbel klein, badezimmer inspiration',
    board: 'Kleine Badezimmer Ideen',
    image_prompt: `A bright small bathroom, scene variant ${index}, with a white oak floating shelf holding folded linen towels and a ceramic soap dispenser, a recessed wall niche with brushed brass edges, a round mirror cabinet above a compact white vanity, warm white and sage green palette, eye-level, editorial interior photography, photorealistic, highly detailed.`,
    visualFormat: 'photo',
    ctaBannerTemplate: 'clean-band',
    integratedText: {
      headline: 'Kleines Bad, große Wirkung',
      subtitle: 'Clevere Stauraum-Ideen für Ihr Zuhause',
      cta: 'Jetzt Ideen speichern',
    },
    ...overrides,
  };
}

function plan(count: number) {
  return { pins: Array.from({ length: count }, (_, index) => pin(index)) };
}

// A pin at a realistic size for a German AI Integrated plan (~1.7k characters
// once serialized), as produced by the model with 3-5 sentence image prompts.
function typicalPin(index: number) {
  return pin(index, {
    image_prompt: `${pin(index).image_prompt} ${'Additional concrete detail about the materials, textures and arrangement of the scene. '.repeat(7)}`,
  });
}

function typicalPlan(count: number) {
  return { pins: Array.from({ length: count }, (_, index) => typicalPin(index)) };
}

function planError(raw: string): PinterestPlanError {
  try {
    parsePinterestGenerationPlan(raw);
  } catch (error) {
    if (error instanceof PinterestPlanError) return error;
    throw error;
  }
  throw new Error('Expected the response to be rejected');
}

function expectKind(raw: string, kind: PinterestPlanFailureKind) {
  const error = planError(raw);
  expect(error.kind).toBe(kind);
  return error;
}

// A complete 7-pin plan padded to the schema's realistic upper range, cut
// inside a string exactly like the production failure ("Unterminated string in
// JSON at position 11038").
function truncatedInsideString(): string {
  const full = JSON.stringify(typicalPlan(7));
  for (let cut = 11038; cut < 11238; cut++) {
    const candidate = full.slice(0, cut);
    try {
      JSON.parse(candidate);
    } catch (error) {
      if (error instanceof SyntaxError && /Unterminated string/.test(error.message)) return candidate;
    }
  }
  throw new Error('Could not build an unterminated-string fixture');
}

// --- Parser -------------------------------------------------------------------

test('accepts a complete raw JSON plan', () => {
  const parsed = parsePinterestGenerationPlan(JSON.stringify(plan(5)));
  expect(parsed.pins).toHaveLength(5);
  expect(parsed.pins[0].title).toBe(TITLES[0]);
});

test('accepts a plan wrapped in a Markdown json code block', () => {
  const fenced = ['```json', JSON.stringify(plan(3), null, 2), '```'].join('\n');
  expect(parsePinterestGenerationPlan(fenced).pins).toHaveLength(3);

  const plainFence = ['```', JSON.stringify(plan(2)), '```'].join('\n');
  expect(parsePinterestGenerationPlan(plainFence).pins).toHaveLength(2);
});

test('accepts plain text before and after a complete JSON object when the extraction is safe', () => {
  const wrapped = `Here is the plan you asked for:\n\n${JSON.stringify(plan(2))}\n\nLet me know if you want changes.`;
  expect(parsePinterestGenerationPlan(wrapped).pins).toHaveLength(2);

  const fencedWithProse = `Sure!\n\`\`\`json\n${JSON.stringify(plan(1))}\n\`\`\`\nHope this helps.`;
  expect(parsePinterestGenerationPlan(fencedWithProse).pins).toHaveLength(1);
});

test('ignores brackets and code-fence markers that appear inside string values', () => {
  const tricky = plan(1);
  tricky.pins[0].title = 'Wandregale {ohne} Bohren [Ideen] ```';
  expect(parsePinterestGenerationPlan(`Plan:\n${JSON.stringify(tricky)}\nDone`).pins[0].title).toBe(
    'Wandregale {ohne} Bohren [Ideen] ```'
  );
});

test('rejects a truncated response with an unterminated string (the production error) without repairing it', () => {
  const truncated = truncatedInsideString();
  expect(truncated.length).toBeGreaterThanOrEqual(11038);

  // This is what the route used to do, and the exact production symptom.
  expect(() => JSON.parse(truncated)).toThrow(/Unterminated string in JSON at position/);

  const error = expectKind(truncated, 'truncated');
  expect(error.responseLength).toBe(truncated.length);
  expect(error.diagnostics().detail).toBe('unterminated_string');
});

test('never returns the complete pins of a truncated plan', () => {
  // Six complete pins, then the seventh cut off: nothing may be salvaged.
  const full = JSON.stringify(plan(7));
  const cut = full.lastIndexOf('{"angle"') + 40;
  expectKind(full.slice(0, cut), 'truncated');

  // Cut exactly after a complete pin: the array and object are still unclosed.
  const afterSixPins = full.lastIndexOf(',{"angle"');
  const error = expectKind(full.slice(0, afterSixPins), 'truncated');
  expect(error.diagnostics().detail).toBe('unclosed_structure');

  // A truncated fenced block is rejected the same way.
  expectKind(`\`\`\`json\n${full.slice(0, cut)}`, 'truncated');
});

test('rejects empty, non-JSON and ambiguous responses', () => {
  expectKind('', 'empty');
  expectKind('   \n\t ', 'empty');
  expectKind('I am sorry, I cannot help with that request.', 'no_json');
  // A stray "[1]" before the plan is itself a complete JSON value: we cannot
  // tell which one is the plan, so nothing is guessed.
  expectKind(`Draft [1] ${JSON.stringify(plan(1))}`, 'ambiguous');
  expectKind('Draft [note] then nothing else', 'invalid_json');
  expectKind(`${JSON.stringify(plan(1))}\nAlso see ${JSON.stringify(plan(1))}`, 'ambiguous');
  expectKind('{"pins": [1, 2}', 'invalid_json');
  expectKind('{"pins": [{"angle": "curiosity",}]}', 'invalid_json');
});

test('rejects syntactically valid JSON that breaks the existing Zod contract', () => {
  const noPins = expectKind(JSON.stringify({ pins: [] }), 'invalid_schema');
  expect(noPins.diagnostics().issues?.[0].path).toBe('pins');

  const badAngle = expectKind(JSON.stringify(plan(1)).replace('"curiosity"', '"trending"'), 'invalid_schema');
  expect(badAngle.diagnostics().issues?.[0].path).toBe('pins.0.angle');

  expectKind(JSON.stringify({ pins: [{ title: 'only a title' }] }), 'invalid_schema');
  expectKind(JSON.stringify([pin(0)]), 'invalid_schema');
  expectKind('"just a string"', 'invalid_schema');
  expectKind(
    JSON.stringify({ pins: [pin(0, { visualFormat: 'text-overlay' })] }),
    'invalid_schema'
  );
});

test('errors are controlled: generic message, bounded diagnostics, no full response, no secrets', () => {
  const truncated = truncatedInsideString();
  const error = planError(truncated);

  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('PinterestPlanError');
  expect(error.message).toBe('Pinterest generation plan rejected: truncated');
  expect(error.message).not.toContain(truncated.slice(30, 80));

  const diagnostics = error.diagnostics();
  expect(diagnostics.responseLength).toBe(truncated.length);
  expect(diagnostics.preview.length).toBeLessThanOrEqual(160);
  expect(diagnostics.tail.length).toBeLessThanOrEqual(120);
  expect(JSON.stringify(diagnostics).length).toBeLessThan(900);
  expect(JSON.stringify(diagnostics)).not.toContain(truncated.slice(400, 520));

  const leaky = planError('Note: Bearer abcdefghijklmnop1234 and sk-abcdefghijklmnopqrstuvwx are not JSON');
  const serialized = JSON.stringify(leaky.diagnostics());
  expect(serialized).toContain('[redacted]');
  expect(serialized).not.toContain('abcdefghijklmnop1234');
  expect(serialized).not.toContain('sk-abcdefghijklmnopqrstuvwx');

  expect(PIN_PLAN_FAILURE_MESSAGE).toBe(
    'The AI could not create a complete Pin plan. No images were generated. Please try again.'
  );
});

// --- Token budget and prompt ---------------------------------------------------

test('AI Integrated gets output headroom for integratedText; Legacy and Photo Only keep their budget', () => {
  expect(estimateMaxTokens(7)).toBe(2550);
  expect(estimateMaxTokens(7, { integratedText: false })).toBe(2550);
  expect(estimateMaxTokens(7, { integratedText: true })).toBe(3600);

  // A typical complete 7-pin German AI Integrated plan is ~2.8k tokens at a
  // pessimistic 3.5 characters per token: the old budget could not hold it.
  const characters = JSON.stringify(typicalPlan(7)).length;
  const pessimisticTokens = Math.ceil(characters / 3.5);
  expect(pessimisticTokens).toBeGreaterThan(estimateMaxTokens(7));
  expect(pessimisticTokens).toBeLessThanOrEqual(estimateMaxTokens(7, { integratedText: true }));
});

test('the planning prompt demands strict JSON only and keeps the existing data contract', () => {
  const common = { keyword: 'badezimmer stauraum', language: 'de', pinsRequested: 5, textOverlayMode: 'auto' } as const;
  const legacy = buildPinterestPinsPrompt(common);
  const integrated = buildPinterestPinsPrompt({
    ...common,
    generationMode: 'ai-integrated',
    aiIntegrated: {
      creativeFormat: 'hero-pin',
      strategy: 'ai-recommends',
      headline: { mode: 'generate' },
      subtitle: { mode: 'generate' },
      cta: { mode: 'generate' },
      maximumTextLines: 4,
      importance: { headline: 'high', subtitle: 'medium', cta: 'low' },
    },
  });

  for (const { user, system } of [legacy, integrated]) {
    expect(user).toContain('return exactly one complete, strictly valid JSON object and nothing else');
    expect(user).toContain('Do not use Markdown or code fences');
    expect(user).toContain('any text before or after the JSON');
    expect(user).toContain('Do not use trailing commas');
    expect(user).toContain('Escape every double quote inside a string value as \\"');
    expect(user).toContain('close every string, array, and object');
    expect(user).toContain('Respond with this exact JSON structure:');
    expect(user).toContain('"pins": [');
    expect(system).toContain('You must respond ONLY with valid JSON');
  }

  expect(integrated.user).toContain('"integratedText"');
  expect(legacy.user).not.toContain('"integratedText"');
  expect(PROMPT_ID).toBe('pinterest-pins-v10');
});

// --- Route behavior (Supabase, AI engine, rate limit and boards replaced) ------

interface RecordedEvent {
  table: string;
  op: 'insert' | 'update';
  row: unknown;
}

interface RouteHarness {
  post: (body: unknown) => Promise<{ status: number; json: () => Promise<Record<string, unknown>> }>;
  events: RecordedEvent[];
  generateTextCalls: Array<{ maxTokens: number; role: string }>;
  imageCalls: number;
  boardCalls: number;
  fetchCalls: number;
  errorLogs: unknown[][];
}

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const aiIntegratedSettings = {
  creativeFormat: 'hero-pin',
  strategy: 'ai-recommends',
  headline: { mode: 'generate' },
  subtitle: { mode: 'generate' },
  cta: { mode: 'generate' },
  maximumTextLines: 4,
  importance: { headline: 'high', subtitle: 'medium', cta: 'low' },
};

const aiIntegratedRequest = {
  projectId: PROJECT_ID,
  keyword: 'badezimmer stauraum ideen',
  language: 'de',
  pinsRequested: 5,
  generationMode: 'ai-integrated',
  aiIntegrated: aiIntegratedSettings,
};

const legacyRequest = {
  projectId: PROJECT_ID,
  keyword: 'badezimmer stauraum ideen',
  language: 'de',
  pinsRequested: 5,
  generationMode: 'legacy-composite',
};

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
    generateTextCalls: [],
    imageCalls: 0,
    boardCalls: 0,
    fetchCalls: 0,
    errorLogs: [],
  };

  const project = {
    id: PROJECT_ID,
    description: 'Home decor ideas for German homes',
    niche: 'Home Decor',
    user_id: 'user-1',
    default_language: 'de',
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
      generateText: async (params: { maxTokens: number; role: string }) => {
        harness.generateTextCalls.push({ maxTokens: params.maxTokens, role: params.role });
        return modelResponse;
      },
      analyzeImage: async () => {
        throw new Error('Vision must not be called');
      },
      generateImage: async () => {
        harness.imageCalls += 1;
        throw new Error('Image generation must not be called');
      },
      resolveImageModel: () => {
        harness.imageCalls += 1;
        throw new Error('Image routing must not be called');
      },
    },
    '@/lib/queries/boards': {
      findOrCreateBoardIds: async (_client: unknown, _project: string, _user: string, names: string[]) => {
        harness.boardCalls += 1;
        return new Map(names.map((name, index) => [name.trim(), `board-${index}`]));
      },
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
      harness.fetchCalls += 1;
      throw new Error('No network call is allowed in this test');
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      harness.errorLogs.push(args);
    };

    // A CommonJS load is required here: the route must be re-evaluated after
    // its dependencies were replaced in require.cache (an ES import is hoisted).
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

function assertNothingDownstreamHappened(harness: RouteHarness) {
  // Only the generation row was created and then marked failed.
  expect(harness.events.map((event) => `${event.op}:${event.table}`)).toEqual([
    'insert:generations',
    'update:generations',
  ]);
  expect(harness.events.find((event) => event.table === 'pins')).toBeUndefined();
  expect(harness.events[1].row).toMatchObject({ status: 'failed', error_message: PIN_PLAN_FAILURE_MESSAGE });
  expect(harness.boardCalls).toBe(0);
  expect(harness.imageCalls).toBe(0);
  expect(harness.fetchCalls).toBe(0);
  expect(harness.generateTextCalls).toHaveLength(1);
}

test('AI Integrated: a truncated plan returns 422, writes no pin and never reaches an image provider', async () => {
  const truncated = truncatedInsideString();

  await withRoute(truncated, async (harness) => {
    const response = await harness.post(aiIntegratedRequest);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      data: null,
      error: { message: PIN_PLAN_FAILURE_MESSAGE, code: 'invalid_pin_plan' },
    });
    // The raw response never reaches the client.
    expect(JSON.stringify(body)).not.toContain(truncated.slice(30, 80));
    expect(JSON.stringify(body)).not.toMatch(/valid JSON|position \d+/);

    assertNothingDownstreamHappened(harness);

    // Server diagnostics are bounded and mention neither the full response nor a secret.
    const logged = JSON.stringify(harness.errorLogs);
    expect(logged).toContain('Pin plan rejected');
    expect(logged).toContain('"kind":"truncated"');
    expect(logged).toContain(`"responseLength":${truncated.length}`);
    expect(logged.length).toBeLessThan(1500);
    expect(logged).not.toContain(truncated.slice(400, 520));
  });
});

test('Legacy Composite: the same invalid plans are rejected the same way, before any write', async () => {
  const truncated = truncatedInsideString();
  const schemaInvalid = JSON.stringify({ pins: [{ title: 'only a title' }] });

  for (const modelResponse of [truncated, schemaInvalid, 'Sorry, no JSON here.']) {
    await withRoute(modelResponse, async (harness) => {
      const response = await harness.post(legacyRequest);
      expect(response.status).toBe(422);
      expect((await response.json()).error).toEqual({
        message: PIN_PLAN_FAILURE_MESSAGE,
        code: 'invalid_pin_plan',
      });
      assertNothingDownstreamHappened(harness);
    });
  }
});

test('AI Integrated: a valid plan, even wrapped in a Markdown block, is persisted with the larger token budget', async () => {
  const fenced = ['```json', JSON.stringify(plan(5)), '```'].join('\n');

  await withRoute(fenced, async (harness) => {
    const response = await harness.post(aiIntegratedRequest);
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({ status: 'completed', pinsGenerated: 5 });

    expect(harness.generateTextCalls).toEqual([{ role: 'FAST', maxTokens: estimateMaxTokens(5, { integratedText: true }) }]);
    expect(harness.generateTextCalls[0].maxTokens).toBe(2600);

    const pinsInsert = harness.events.find((event) => event.table === 'pins' && event.op === 'insert');
    const rows = pinsInsert?.row as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.visual_format === 'ai-integrated')).toBe(true);
    expect(rows.every((row) => row.cta_banner_template === null && row.overlay_text === null)).toBe(true);
    expect(harness.events.at(-1)).toMatchObject({ table: 'generations', op: 'update', row: { status: 'completed' } });
    // Persisting a plan is not an image request.
    expect(harness.imageCalls).toBe(0);
    expect(harness.fetchCalls).toBe(0);
  });
});

test('Legacy Composite: a valid plan keeps its budget and its legacy persistence', async () => {
  await withRoute(JSON.stringify(plan(5)), async (harness) => {
    const response = await harness.post(legacyRequest);
    expect(response.status).toBe(201);

    expect(harness.generateTextCalls).toEqual([{ role: 'FAST', maxTokens: 1850 }]);

    const pinsInsert = harness.events.find((event) => event.table === 'pins' && event.op === 'insert');
    const rows = pinsInsert?.row as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.visual_format === 'photo')).toBe(true);
    expect(rows.every((row) => typeof row.cta_banner_template === 'string')).toBe(true);
    expect(harness.imageCalls).toBe(0);
    expect(harness.fetchCalls).toBe(0);
  });
});
