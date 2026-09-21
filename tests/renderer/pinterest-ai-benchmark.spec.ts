import { expect, test } from 'playwright/test';
import {
  buildBenchmarkPlan,
  buildComparisonHtml,
  calculateEvaluation,
  loadFixtures,
  parseCliArgs,
  preflightExitCode,
  renderPreflight,
  resolveBenchmarkModels,
  runBenchmark,
  runPreflight,
  type EvaluationScores,
  type BenchmarkJobResult,
} from '../../scripts/pinterest-ai-benchmark';

function scores(value: number | null): EvaluationScores {
  return {
    exactText: value,
    mobileLegibility: value,
    photographicQuality: value,
    referenceFidelity: value,
    aspectRatio: value,
    hierarchy: value,
    noStrayText: value,
    subjectUnobstructed: value,
    diversity: value,
    costDuration: value,
  };
}

test('CLI is dry-run by default and --execute is explicit', () => {
  expect(parseCliArgs([]).execute).toBe(false);
  expect(parseCliArgs([]).preflight).toBe(false);
  expect(parseCliArgs(['--execute']).execute).toBe(true);
  expect(parseCliArgs(['--preflight']).preflight).toBe(true);
  expect(parseCliArgs(['--variants', '2']).variants).toBe(2);
  expect(() => parseCliArgs(['--execute', '--preflight'])).toThrow(/mutually exclusive/);
  expect(() => parseCliArgs(['--reference', 'reference.png'])).toThrow(/preceding --fixture/);
  expect(() => parseCliArgs(['--unknown'])).toThrow(/Unknown option/);
});

test('loads the four exact benchmark fixtures', async () => {
  const fixtures = await loadFixtures();
  expect(fixtures).toHaveLength(4);
  expect(fixtures.find((fixture) => fixture.id === 'crochet-cat-en')).toMatchObject({
    headline: '7 CUTE CROCHET CAT IDEAS',
    subtitle: 'Every Cat Lover Should Save →',
    cta: 'GET THE FREE PATTERNS →',
  });
  expect(fixtures.find((fixture) => fixture.id === 'crochet-sweater-en')).toMatchObject({
    headline: 'CROCHET SWEATER PATTERN',
    subtitle: 'Cozy Styles to Make →',
  });
  expect(fixtures.find((fixture) => fixture.id === 'bathroom-de')).toMatchObject({
    headline: '7 IDEEN FÜR KLEINE BADEZIMMER',
    subtitle: 'Die größer wirken →',
  });
  expect(fixtures.find((fixture) => fixture.id === 'kitchen-de')).toMatchObject({
    headline: '8 MODERNE KÜCHEN IDEEN',
    subtitle: 'Inspiration für 2026 →',
  });
});

test('supports repeated --model values, deduplicates slugs and creates one job per fixture', async () => {
  const fixtures = await loadFixtures();
  const options = parseCliArgs([
    '--model', 'openrouter:openai/gpt-image-2.5-flare',
    '--model', 'openrouter:openai/gpt-image-2.5-flare',
  ]);
  const models = resolveBenchmarkModels({ OPENROUTER_IMAGE_API_KEY: 'configured-for-test' }, options.modelOverrides);
  const plan = buildBenchmarkPlan(options, fixtures, models);
  expect(models).toHaveLength(1);
  expect(plan.jobs).toHaveLength(4);
  expect(plan.jobs.every((job) => job.prompt.includes(job.fixture.headline))).toBe(true);
});

test('associates a reference with one fixture only', async () => {
  const fixtures = await loadFixtures();
  const options = parseCliArgs([
    '--model', 'openrouter:exact/model-id',
    '--fixture', 'crochet-cat-en',
    '--reference', 'cat-reference.png',
  ]);
  const models = resolveBenchmarkModels({}, options.modelOverrides);
  const plan = buildBenchmarkPlan(options, fixtures, models);
  expect(plan.jobs.filter((job) => job.referenceImage)).toHaveLength(1);
  expect(plan.jobs.find((job) => job.fixture.id === 'crochet-cat-en')?.referenceImage)
    .toBe('cat-reference.png');
  expect(plan.jobs.find((job) => job.fixture.id === 'bathroom-de')?.referenceImage)
    .toBeUndefined();
  expect(() => buildBenchmarkPlan(
    parseCliArgs(['--fixture', 'unknown', '--reference', 'x.png']),
    fixtures,
    models
  )).toThrow(/Unknown fixture/);
});

test('selects exactly the authorized eight jobs and enforces the hard call ceiling', async () => {
  const fixtures = await loadFixtures();
  const argv = [
    '--execute', '--max-calls', '8',
    '--only-fixture', 'crochet-cat-en',
    '--only-fixture', 'bathroom-de',
    '--model', 'openrouter:openai/gpt-image-2.5-flare',
    '--model', 'openrouter:openai/gpt-image-2.5-sunburst',
    '--model', 'openrouter:google/gemini-3.1-flash-image',
    '--model', 'openrouter:qwen/qwen-image-3-pro',
  ];
  const options = parseCliArgs(argv);
  const models = resolveBenchmarkModels({ OPENROUTER_IMAGE_API_KEY: 'test' }, options.modelOverrides);
  const plan = buildBenchmarkPlan(options, fixtures, models);
  expect(plan.jobs).toHaveLength(8);
  expect(plan.jobs.filter((job) => job.referenceImage)).toHaveLength(0);
  expect(new Set(plan.jobs.map((job) => job.fixture.id))).toEqual(
    new Set(['crochet-cat-en', 'bathroom-de'])
  );

  const overLimit = buildBenchmarkPlan(
    { ...options, variants: 2 },
    fixtures,
    models
  );
  await expect(runBenchmark(overLimit)).rejects.toThrow(/exceed --max-calls 8/);
});

test('comparison HTML exposes all manual criteria without selecting a winner', async () => {
  const fixture = (await loadFixtures()).find((candidate) => candidate.id === 'crochet-cat-en')!;
  const job = {
    id: 'job-1', fixture, provider: 'openrouter' as const, model: 'exact/model',
    variant: 1, prompt: 'prompt',
  };
  const result: BenchmarkJobResult = {
    job,
    success: true,
    directory: 'output/model/fixture/variant-1',
    imageFilename: 'original.png',
    durationMs: 1234,
    error: null,
    usage: { cost: 0.1 },
    technical: { width: 1024, height: 1536 },
  };
  const html = buildComparisonHtml([result], 'output');
  expect(html.match(/NEEDS_REVIEW/g)).toHaveLength(12);
  expect(html).toContain('Click and save interest');
  expect(html).not.toContain('winner');
});

test('preflight uses discovery GETs only and rejects absent or incompatible models', async () => {
  const fixtures = await loadFixtures();
  const options = parseCliArgs([
    '--preflight',
    '--model', 'openrouter:openai/compatible',
    '--model', 'openrouter:qwen/compatible',
    '--model', 'openrouter:google/incompatible',
    '--model', 'openrouter:missing/model',
  ]);
  const models = resolveBenchmarkModels({}, options.modelOverrides);
  const plan = buildBenchmarkPlan(options, fixtures, models);
  const methods: string[] = [];
  const mockFetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    methods.push(init?.method ?? 'GET');
    const url = String(input);
    if (url.endsWith('/api/v1/images/models')) {
      return Response.json({ data: [
        {
          id: 'openai/compatible',
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] },
          endpoints: '/api/v1/images/models/openai/compatible/endpoints',
        },
        {
          id: 'qwen/compatible',
          architecture: { input_modalities: ['text'], output_modalities: ['image'] },
          endpoints: '/api/v1/images/models/qwen/compatible/endpoints',
        },
        {
          id: 'google/incompatible',
          architecture: { input_modalities: ['text'], output_modalities: ['image'] },
          endpoints: '/api/v1/images/models/google/incompatible/endpoints',
        },
      ] });
    }
    if (url.includes('/openai/compatible/endpoints')) {
      return Response.json({ endpoints: [{
        provider_name: 'OpenAI',
        provider_tag: 'openai',
        supported_parameters: {
          aspect_ratio: { type: 'enum', values: ['2:3'] },
          quality: { type: 'enum', values: ['high'] },
          output_format: { type: 'enum', values: ['png'] },
          input_references: { type: 'array', max_items: 1 },
        },
        pricing: [{ billable: 'output_image', unit: 'image', cost_usd: 0.05 }],
      }] });
    }
    if (url.includes('/qwen/compatible/endpoints')) {
      return Response.json({ endpoints: [{
        provider_name: 'Qwen',
        supported_parameters: {
          aspect_ratio: { type: 'enum', values: ['2:3'] },
          resolution: { type: 'enum', values: ['1K', '2K'] },
          input_references: { type: 'array', max_items: 4 },
        },
        pricing: [
          { billable: 'output_image', unit: 'image', cost_usd: 0.04, variant: '1k' },
          { billable: 'output_image', unit: 'image', cost_usd: 0.075, variant: '2k' },
        ],
      }] });
    }
    if (url.includes('/google/incompatible/endpoints')) {
      return Response.json({ endpoints: [{
        provider_name: 'Google',
        supported_parameters: {
          aspect_ratio: { type: 'enum', values: ['1:1'] },
          resolution: { type: 'enum', values: ['2K'] },
        },
      }] });
    }
    throw new Error(`Unexpected discovery URL: ${url}`);
  };

  const report = await runPreflight(plan, mockFetch);
  expect(methods.every((method) => method === 'GET')).toBe(true);
  expect(report.compatible).toBe(false);
  expect(preflightExitCode(report)).toBe(1);
  expect(report.imageGenerationPerformed).toBe(false);
  expect(report.models.find((model) => model.model === 'openai/compatible')).toMatchObject({
    exists: true,
    compatible: true,
    parameters: { aspect_ratio: '2:3', quality: 'high', output_format: 'png' },
    estimatedCostLowUsd: 0.2,
    estimatedCostHighUsd: 0.2,
  });
  expect(report.models.find((model) => model.model === 'qwen/compatible')).toMatchObject({
    compatible: true,
    parameters: { aspect_ratio: '2:3', resolution: '2K' },
    referenceLimit: 4,
    estimatedCostLowUsd: 0.3,
    estimatedCostHighUsd: 0.3,
  });
  expect(report.models.find((model) => model.model === 'google/incompatible')?.compatible).toBe(false);
  expect(report.models.find((model) => model.model === 'missing/model')?.exists).toBe(false);
  expect(renderPreflight(report)).toContain('No image generation performed');
});

test('dry-run never invokes the paid executor', async () => {
  const fixtures = await loadFixtures();
  const models = resolveBenchmarkModels({
    AI_IMAGE_PROVIDER: 'openrouter',
    AI_IMAGE_MODEL: 'exact/model-id',
    OPENROUTER_IMAGE_API_KEY: 'configured-for-test',
  });
  const plan = buildBenchmarkPlan(parseCliArgs([]), fixtures, models);
  let calls = 0;
  const result = await runBenchmark(plan, {
    executeJob: async () => {
      calls++;
      throw new Error('Paid executor must not be called in dry-run');
    },
  });
  expect(result).toEqual({ executed: 0, dryRun: true });
  expect(calls).toBe(0);
});

test('evaluation stays NEEDS_REVIEW until human scores are complete', () => {
  const result = calculateEvaluation({ scores: scores(null) });
  expect(result.status).toBe('NEEDS_REVIEW');
  expect(result.humanValidationRequired).toBe(true);
});

test('evaluation passes complete strong human scores and fails critical defects', () => {
  expect(calculateEvaluation({ scores: scores(5) }).status).toBe('PASS');
  expect(calculateEvaluation({
    scores: { ...scores(4), exactText: 1 },
  }).status).toBe('FAIL');
  expect(calculateEvaluation({ scores: scores(4), providerError: true }).status).toBe('FAIL');
});
