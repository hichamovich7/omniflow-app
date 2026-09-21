import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export type BenchmarkProvider = 'openai' | 'openrouter';
export type BenchmarkStatus = 'PASS' | 'NEEDS_REVIEW' | 'FAIL';

export interface BenchmarkFixture {
  id: string;
  name: string;
  niche: 'crochet' | 'home-decor';
  locale: 'en' | 'de';
  headline: string;
  subtitle: string;
  cta?: string;
  visualDirection: string;
  referenceImage?: string;
}

export interface BenchmarkModel {
  provider: BenchmarkProvider;
  model: string;
  source: 'shortlist' | 'cli';
  credentialConfigured: boolean;
}

export interface CliOptions {
  execute: boolean;
  preflight: boolean;
  variants: number;
  fixtureFilters: string[];
  maxCalls: number | null;
  referencesByFixture: Record<string, string>;
  modelOverrides: Array<{ provider: BenchmarkProvider; model: string }>;
  outputRoot: string;
  help: boolean;
}

export interface BenchmarkJob {
  id: string;
  fixture: BenchmarkFixture;
  provider: BenchmarkProvider;
  model: string;
  variant: number;
  referenceImage?: string;
  prompt: string;
}

export interface BenchmarkPlan {
  execute: boolean;
  preflight: boolean;
  outputRoot: string;
  variants: number;
  maxCalls: number | null;
  models: BenchmarkModel[];
  fixtures: BenchmarkFixture[];
  jobs: BenchmarkJob[];
}

export const EVALUATION_CRITERIA = [
  'exactText',
  'mobileLegibility',
  'photographicQuality',
  'referenceFidelity',
  'aspectRatio',
  'hierarchy',
  'noStrayText',
  'subjectUnobstructed',
  'diversity',
  'costDuration',
] as const;

export const MANUAL_REVIEW_CRITERIA = [
  { key: 'exactText', label: 'Exact text' },
  { key: 'noStrayText', label: 'No stray text' },
  { key: 'mobileLegibility', label: 'Mobile legibility' },
  { key: 'hierarchy', label: 'Headline / subtitle / CTA hierarchy' },
  { key: 'photographicQuality', label: 'Photographic quality' },
  { key: 'directionFidelity', label: 'Crochet or Home Decor direction' },
  { key: 'verticalComposition', label: 'Vertical Pinterest composition' },
  { key: 'subjectUnobstructed', label: 'Subject unobstructed' },
  { key: 'clickSaveInterest', label: 'Click and save interest' },
  { key: 'costDuration', label: 'Cost and duration' },
] as const;

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];
export type EvaluationScores = Record<EvaluationCriterion, number | null>;

export interface EvaluationInput {
  scores: EvaluationScores;
  providerError?: boolean;
}

export interface EvaluationResult {
  status: BenchmarkStatus;
  average: number | null;
  humanValidationRequired: boolean;
  reasons: string[];
}

export interface ResolvedImageParameters {
  aspect_ratio: '2:3';
  quality?: 'high';
  resolution?: '2K';
  output_format?: 'png';
}

export interface PreflightEndpoint {
  providerName: string | null;
  providerTag: string | null;
  compatible: boolean;
  referenceLimit: number;
  parameters: ResolvedImageParameters | null;
  pricing: Array<Record<string, unknown>>;
  errors: string[];
}

export interface PreflightModelResult {
  provider: BenchmarkProvider;
  model: string;
  exists: boolean;
  compatible: boolean;
  inputModalities: string[];
  outputModalities: string[];
  referenceLimit: number;
  parameters: ResolvedImageParameters | null;
  endpoints: PreflightEndpoint[];
  estimatedCostLowUsd: number | null;
  estimatedCostHighUsd: number | null;
  costEstimateComplete: boolean;
  errors: string[];
}

export interface PreflightReport {
  compatible: boolean;
  imageGenerationPerformed: false;
  plannedImageCalls: number;
  plannedReferenceCalls: number;
  estimatedCostLowUsd: number | null;
  estimatedCostHighUsd: number | null;
  costEstimateComplete: boolean;
  models: PreflightModelResult[];
}

interface GeneratedImage {
  buffer: Buffer;
  mediaType: string;
  usage?: Record<string, unknown>;
}

export interface BenchmarkJobResult {
  job: BenchmarkJob;
  success: boolean;
  directory: string;
  imageFilename: string | null;
  durationMs: number;
  error: string | null;
  usage: Record<string, unknown> | null;
  technical: Record<string, unknown> | null;
}

interface BenchmarkRunDependencies {
  executeJob?: (job: BenchmarkJob) => Promise<void>;
  fetchImpl?: FetchLike;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_OUTPUT_ROOT = '.benchmark-output/pinterest-ai-integrated';
export const DEFAULT_MODEL_SHORTLIST = [
  'openai/gpt-image-2.5-flare',
  'openai/gpt-image-2.5-sunburst',
  'google/gemini-3.1-flash-image',
  'qwen/qwen-image-3-pro',
] as const;
const FIXTURES_DIRECTORY = path.join(
  process.cwd(),
  'benchmarks',
  'pinterest-ai-integrated',
  'fixtures'
);

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new Error(`${flag} must be an integer between 1 and 10`);
  }
  return parsed;
}

function parseModelOverride(value: string): { provider: BenchmarkProvider; model: string } {
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error('--model must use <openai|openrouter>:<exact-model-id>');
  }
  const provider = value.slice(0, separator);
  const model = value.slice(separator + 1).trim();
  if (provider !== 'openai' && provider !== 'openrouter') {
    throw new Error(`Unsupported benchmark provider: ${provider}`);
  }
  return { provider, model };
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    execute: false,
    preflight: false,
    variants: 1,
    fixtureFilters: [],
    maxCalls: null,
    referencesByFixture: {},
    modelOverrides: [],
    outputRoot: DEFAULT_OUTPUT_ROOT,
    help: false,
  };

  let pendingFixture: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--execute') {
      options.execute = true;
    } else if (argument === '--preflight') {
      options.preflight = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--variants') {
      const value = argv[++index];
      if (!value) throw new Error('--variants requires a value');
      options.variants = parsePositiveInteger(value, '--variants');
    } else if (argument === '--only-fixture') {
      const value = argv[++index];
      if (!value) throw new Error('--only-fixture requires a fixture id');
      if (!options.fixtureFilters.includes(value)) options.fixtureFilters.push(value);
    } else if (argument === '--max-calls') {
      const value = argv[++index];
      if (!value) throw new Error('--max-calls requires a value');
      options.maxCalls = parsePositiveInteger(value, '--max-calls');
    } else if (argument === '--fixture') {
      const value = argv[++index];
      if (!value) throw new Error('--fixture requires a fixture id');
      if (pendingFixture) throw new Error(`--fixture ${pendingFixture} is missing its --reference`);
      pendingFixture = value;
    } else if (argument === '--reference') {
      const value = argv[++index];
      if (!value) throw new Error('--reference requires a local image path');
      if (!pendingFixture) throw new Error('--reference requires a preceding --fixture <fixture-id>');
      if (options.referencesByFixture[pendingFixture]) {
        throw new Error(`Fixture ${pendingFixture} already has a reference`);
      }
      options.referencesByFixture[pendingFixture] = value;
      pendingFixture = undefined;
    } else if (argument === '--model') {
      const value = argv[++index];
      if (!value) throw new Error('--model requires a value');
      options.modelOverrides.push(parseModelOverride(value));
    } else if (argument === '--output') {
      const value = argv[++index];
      if (!value) throw new Error('--output requires a path');
      options.outputRoot = value;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (pendingFixture) throw new Error(`--fixture ${pendingFixture} is missing its --reference`);
  if (options.execute && options.preflight) {
    throw new Error('--execute and --preflight are mutually exclusive');
  }

  return options;
}

function assertFixture(value: unknown, filename: string): asserts value is BenchmarkFixture {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid fixture object: ${filename}`);
  }
  const fixture = value as Record<string, unknown>;
  const requiredStrings = ['id', 'name', 'niche', 'locale', 'headline', 'subtitle', 'visualDirection'];
  for (const field of requiredStrings) {
    if (typeof fixture[field] !== 'string' || fixture[field].trim() === '') {
      throw new Error(`Fixture ${filename} is missing ${field}`);
    }
  }
  if (fixture.cta !== undefined && typeof fixture.cta !== 'string') {
    throw new Error(`Fixture ${filename} has an invalid cta`);
  }
}

export async function loadFixtures(directory = FIXTURES_DIRECTORY): Promise<BenchmarkFixture[]> {
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith('.json'))
    .sort();
  const fixtures: BenchmarkFixture[] = [];
  for (const filename of filenames) {
    const parsed: unknown = JSON.parse(await readFile(path.join(directory, filename), 'utf8'));
    assertFixture(parsed, filename);
    fixtures.push(parsed);
  }
  return fixtures;
}

type Environment = Readonly<Record<string, string | undefined>>;

function hasCredential(provider: BenchmarkProvider, env: Environment): boolean {
  return provider === 'openrouter'
    ? Boolean(env.OPENROUTER_IMAGE_API_KEY?.trim())
    : Boolean(env.OPENAI_API_KEY?.trim());
}

export function resolveBenchmarkModels(
  env: Environment,
  overrides: CliOptions['modelOverrides'] = []
): BenchmarkModel[] {
  const configured: Array<{ provider: BenchmarkProvider; model: string; source: 'shortlist' | 'cli' }> = [];

  if (overrides.length > 0) {
    configured.push(...overrides.map((model) => ({ ...model, source: 'cli' as const })));
  } else {
    configured.push(...DEFAULT_MODEL_SHORTLIST.map((model) => ({
      provider: 'openrouter' as const,
      model,
      source: 'shortlist' as const,
    })));
  }

  const unique = new Map<string, BenchmarkModel>();
  for (const candidate of configured) {
    const key = `${candidate.provider}:${candidate.model}`;
    if (!unique.has(key)) {
      unique.set(key, {
        ...candidate,
        credentialConfigured: hasCredential(candidate.provider, env),
      });
    }
  }
  return [...unique.values()];
}

export function buildIntegratedPinPrompt(fixture: BenchmarkFixture): string {
  const exactLines = [fixture.headline, fixture.subtitle, fixture.cta].filter(
    (line): line is string => Boolean(line)
  );
  const layoutDirection = fixture.niche === 'home-decor'
    ? 'The photographic room must occupy 75–80% of the 2:3 canvas. Use a compact upper text zone occupying 20–25%, with a tasteful translucent cream background. Do not cover the room focal point.'
    : 'Make the crochet subject dominant and unobstructed. Use a polished craft/lifestyle environment, realistic stitches and yarn fibers, and typography that remains exceptionally legible at mobile thumbnail size.';

  return `Create one finished Pinterest Pin as a single raster image. The photography and all typography must be generated together by the image model. Do not return a blank layout, mockup, template, separate text layer, border, or collage.

CANVAS
- Vertical 2:3 Pinterest composition.
- Premium editorial finish, photorealistic photography.
- Keep all important text comfortably inside the canvas.

EXACT TEXT
Render only the following lines, preserving every character, accent, number, capitalization, space and arrow exactly:
${exactLines.map((line, index) => `${index + 1}. ${line}`).join('\n')}
Do not translate, paraphrase, shorten, duplicate or add any other readable text. No logos, watermarks, labels, signatures, UI text or pseudo-text.

HIERARCHY
- Line 1 is the headline and must be the strongest typographic element.
- Line 2 is the subtitle and must be clearly subordinate but readable.
${fixture.cta ? '- Line 3 is the CTA and must be visibly actionable without competing with the headline.' : '- This fixture has no CTA line. Do not invent one.'}

VISUAL DIRECTION
${fixture.visualDirection}
${layoutDirection}

FINAL CHECK
Before producing the image, verify the exact text character by character, preserve the 2:3 composition, keep the subject unobstructed, and remove all unintended readable text.`;
}

export function buildBenchmarkPlan(
  options: CliOptions,
  fixtures: BenchmarkFixture[],
  models: BenchmarkModel[]
): BenchmarkPlan {
  if (models.length === 0) {
    throw new Error('No configured image model is available for the benchmark');
  }
  const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));
  for (const fixtureId of Object.keys(options.referencesByFixture)) {
    if (!fixtureIds.has(fixtureId)) throw new Error(`Unknown fixture for --reference: ${fixtureId}`);
  }
  for (const fixtureId of options.fixtureFilters) {
    if (!fixtureIds.has(fixtureId)) throw new Error(`Unknown --only-fixture: ${fixtureId}`);
  }
  const selectedFixtures = options.fixtureFilters.length > 0
    ? fixtures.filter((fixture) => options.fixtureFilters.includes(fixture.id))
    : fixtures;
  const jobs = models.flatMap((model) =>
    selectedFixtures.flatMap((fixture) =>
      Array.from({ length: options.variants }, (_, index): BenchmarkJob => ({
        id: `${model.provider}-${model.model.replace(/[^a-zA-Z0-9.-]+/g, '-')}-${fixture.id}-v${index + 1}`,
        fixture,
        provider: model.provider,
        model: model.model,
        variant: index + 1,
        referenceImage: options.referencesByFixture[fixture.id] ?? fixture.referenceImage,
        prompt: buildIntegratedPinPrompt(fixture),
      }))
    )
  );
  return {
    execute: options.execute,
    preflight: options.preflight,
    outputRoot: options.outputRoot,
    variants: options.variants,
    maxCalls: options.maxCalls,
    models,
    fixtures: selectedFixtures,
    jobs,
  };
}

export function createEmptyScores(): EvaluationScores {
  return {
    exactText: null,
    mobileLegibility: null,
    photographicQuality: null,
    referenceFidelity: null,
    aspectRatio: null,
    hierarchy: null,
    noStrayText: null,
    subjectUnobstructed: null,
    diversity: null,
    costDuration: null,
  };
}

export function calculateEvaluation(input: EvaluationInput): EvaluationResult {
  const scored = Object.entries(input.scores).filter(
    (entry): entry is [EvaluationCriterion, number] => typeof entry[1] === 'number'
  );
  const reasons: string[] = [];
  if (input.providerError) {
    return {
      status: 'FAIL',
      average: null,
      humanValidationRequired: true,
      reasons: ['Provider generation failed'],
    };
  }

  for (const [criterion, score] of scored) {
    if (score < 0 || score > 5) throw new Error(`${criterion} score must be between 0 and 5`);
  }

  const criticalCriteria: EvaluationCriterion[] = [
    'exactText',
    'aspectRatio',
    'noStrayText',
    'subjectUnobstructed',
  ];
  const criticalFailure = criticalCriteria.some((criterion) => {
    const score = input.scores[criterion];
    return typeof score === 'number' && score < 2;
  });
  if (criticalFailure) reasons.push('At least one critical criterion scored below 2/5');

  const average = scored.length > 0
    ? scored.reduce((sum, [, score]) => sum + score, 0) / scored.length
    : null;
  const allApplicableScored = scored.length >= 8;
  const passThresholdMet =
    allApplicableScored &&
    average !== null &&
    average >= 4 &&
    criticalCriteria.every((criterion) => {
      const score = input.scores[criterion];
      return typeof score === 'number' && score >= 4;
    });

  if (!allApplicableScored) reasons.push('Human evaluation is incomplete');
  if (allApplicableScored && !passThresholdMet && !criticalFailure) {
    reasons.push('Completed evaluation does not meet the PASS threshold');
  }

  return {
    status: criticalFailure ? 'FAIL' : passThresholdMet ? 'PASS' : 'NEEDS_REVIEW',
    average,
    humanValidationRequired: true,
    reasons,
  };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .slice(0, 500);
}

async function loadEnvFile(filename: string): Promise<void> {
  if (!existsSync(filename)) return;
  const text = await readFile(filename, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function mimeTypeForReference(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  throw new Error('Reference image must be JPG, PNG or WebP');
}

async function referenceDataUrl(filename: string): Promise<string> {
  const absolute = path.resolve(filename);
  const buffer = await readFile(absolute);
  return `data:${mimeTypeForReference(absolute)};base64,${buffer.toString('base64')}`;
}

type ParameterMap = Record<string, unknown>;

function asParameterMap(value: unknown): ParameterMap {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ParameterMap
    : {};
}

function descriptorAccepts(parameters: ParameterMap, name: string, value: string): boolean {
  if (!(name in parameters)) return false;
  const descriptor = parameters[name];
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) return true;
  const values = (descriptor as Record<string, unknown>).values;
  return !Array.isArray(values) || values.length === 0 || values.includes(value);
}

function referenceLimit(parameters: ParameterMap): number {
  if (!('input_references' in parameters)) return 0;
  const descriptor = parameters.input_references;
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) return 1;
  const record = descriptor as Record<string, unknown>;
  for (const key of ['max_items', 'maxItems', 'maximum', 'max']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  }
  return 1;
}

function resolveEndpoint(
  model: string,
  rawEndpoint: Record<string, unknown>,
  referencesRequired: boolean
): PreflightEndpoint {
  const supported = asParameterMap(rawEndpoint.supported_parameters);
  const errors: string[] = [];
  const parameters: ResolvedImageParameters = { aspect_ratio: '2:3' };
  const referenceCapacity = referenceLimit(supported);

  if (!descriptorAccepts(supported, 'aspect_ratio', '2:3')) {
    errors.push('aspect_ratio=2:3 is not supported');
  }
  if (model.startsWith('openai/')) {
    if (descriptorAccepts(supported, 'quality', 'high')) parameters.quality = 'high';
    else errors.push('quality=high is required for OpenAI benchmark models');
  }
  if (
    (model.startsWith('google/') || model.startsWith('qwen/')) &&
    descriptorAccepts(supported, 'resolution', '2K')
  ) {
    parameters.resolution = '2K';
  }
  if (descriptorAccepts(supported, 'output_format', 'png')) {
    parameters.output_format = 'png';
  }
  if (referencesRequired && referenceCapacity < 1) {
    errors.push('input_references capacity >= 1 is required by the selected fixtures');
  }

  return {
    providerName: typeof rawEndpoint.provider_name === 'string' ? rawEndpoint.provider_name : null,
    providerTag: typeof rawEndpoint.provider_tag === 'string' ? rawEndpoint.provider_tag : null,
    compatible: errors.length === 0,
    referenceLimit: referenceCapacity,
    parameters: errors.length === 0 ? parameters : null,
    pricing: Array.isArray(rawEndpoint.pricing)
      ? rawEndpoint.pricing.filter((line): line is Record<string, unknown> =>
          Boolean(line) && typeof line === 'object' && !Array.isArray(line))
      : [],
    errors,
  };
}

function estimatePricing(
  pricing: Array<Record<string, unknown>>,
  imageCalls: number,
  referenceCalls: number,
  parameters: ResolvedImageParameters
): { low: number | null; high: number | null; complete: boolean } {
  let low = 0;
  let high = 0;
  let recognized = false;
  let complete = pricing.length > 0;
  for (const line of pricing) {
    const cost = typeof line.cost_usd === 'number'
      ? line.cost_usd
      : typeof line.cost_usd === 'string'
        ? Number(line.cost_usd)
        : Number.NaN;
    const unit = typeof line.unit === 'string' ? line.unit : '';
    const billable = typeof line.billable === 'string' ? line.billable : '';
    const variant = typeof line.variant === 'string' ? line.variant.toLowerCase() : null;
    if (
      variant &&
      parameters.resolution &&
      variant !== parameters.resolution.toLowerCase()
    ) {
      continue;
    }
    if (!Number.isFinite(cost)) {
      complete = false;
      continue;
    }
    const calls = billable.includes('reference') || billable === 'input_image'
      ? referenceCalls
      : imageCalls;
    if (unit === 'image' && (billable.includes('image') || billable.includes('reference'))) {
      low += cost * calls;
      high += cost * calls;
      recognized = true;
    } else if (unit === 'megapixel' && billable.includes('output')) {
      const lowMegapixels = parameters.resolution === '2K' ? 6.291456 : 1.572864;
      const highMegapixels = 6.291456;
      low += cost * calls * lowMegapixels;
      high += cost * calls * highMegapixels;
      recognized = true;
    } else {
      complete = false;
    }
  }
  return {
    low: recognized ? low : null,
    high: recognized ? high : null,
    complete: complete && recognized,
  };
}

async function discoveryGet(
  url: string,
  fetchImpl: FetchLike,
  apiKey?: string
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetchImpl(url, { method: 'GET', headers });
  if (!response.ok) throw new Error(`OpenRouter discovery failed with HTTP ${response.status}`);
  return await response.json() as Record<string, unknown>;
}

export async function runPreflight(
  plan: BenchmarkPlan,
  fetchImpl: FetchLike = fetch
): Promise<PreflightReport> {
  const apiKey = process.env.OPENROUTER_IMAGE_API_KEY?.trim();
  const catalog = await discoveryGet(
    'https://openrouter.ai/api/v1/images/models',
    fetchImpl,
    apiKey
  );
  const entries = Array.isArray(catalog.data)
    ? catalog.data.filter((entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
  const results: PreflightModelResult[] = [];

  for (const model of plan.models) {
    const jobs = plan.jobs.filter((job) => job.provider === model.provider && job.model === model.model);
    const referenceCalls = jobs.filter((job) => Boolean(job.referenceImage)).length;
    const entry = entries.find((candidate) => candidate.id === model.model);
    if (model.provider !== 'openrouter' || !entry) {
      results.push({
        provider: model.provider,
        model: model.model,
        exists: false,
        compatible: false,
        inputModalities: [],
        outputModalities: [],
        referenceLimit: 0,
        parameters: null,
        endpoints: [],
        estimatedCostLowUsd: null,
        estimatedCostHighUsd: null,
        costEstimateComplete: false,
        errors: [model.provider !== 'openrouter'
          ? 'Preflight supports OpenRouter discovery models only'
          : 'Model is absent from the OpenRouter image catalog'],
      });
      continue;
    }

    const architecture = asParameterMap(entry.architecture);
    const inputModalities = Array.isArray(architecture.input_modalities)
      ? architecture.input_modalities.filter((value): value is string => typeof value === 'string')
      : [];
    const outputModalities = Array.isArray(architecture.output_modalities)
      ? architecture.output_modalities.filter((value): value is string => typeof value === 'string')
      : [];
    const endpointPath = typeof entry.endpoints === 'string' ? entry.endpoints : null;
    let endpointRecords: Array<Record<string, unknown>> = [];
    if (endpointPath) {
      const endpointUrl = new URL(endpointPath, 'https://openrouter.ai').toString();
      const endpointPayload = await discoveryGet(endpointUrl, fetchImpl, apiKey);
      endpointRecords = Array.isArray(endpointPayload.endpoints)
        ? endpointPayload.endpoints.filter((endpoint): endpoint is Record<string, unknown> =>
            Boolean(endpoint) && typeof endpoint === 'object' && !Array.isArray(endpoint))
        : [];
    }
    if (endpointRecords.length === 0) endpointRecords = [entry];

    const endpoints = endpointRecords.map((endpoint) =>
      resolveEndpoint(model.model, endpoint, referenceCalls > 0)
    );
    const compatibleEndpoints = endpoints.filter((endpoint) => endpoint.compatible && endpoint.parameters);
    const estimates = compatibleEndpoints.map((endpoint) =>
      estimatePricing(endpoint.pricing, jobs.length, referenceCalls, endpoint.parameters!)
    );
    const lows = estimates.flatMap((estimate) => estimate.low === null ? [] : [estimate.low]);
    const highs = estimates.flatMap((estimate) => estimate.high === null ? [] : [estimate.high]);
    const errors: string[] = [];
    if (!inputModalities.includes('text')) errors.push('text input modality is not advertised');
    if (!outputModalities.includes('image')) errors.push('image output modality is not advertised');
    if (compatibleEndpoints.length === 0) errors.push('no endpoint satisfies the benchmark parameters');
    const compatible = errors.length === 0;
    const selected = compatibleEndpoints[0] ?? null;

    results.push({
      provider: model.provider,
      model: model.model,
      exists: true,
      compatible,
      inputModalities,
      outputModalities,
      referenceLimit: compatibleEndpoints.reduce(
        (maximum, endpoint) => Math.max(maximum, endpoint.referenceLimit),
        0
      ),
      parameters: selected?.parameters ?? null,
      endpoints,
      estimatedCostLowUsd: lows.length > 0 ? Math.min(...lows) : null,
      estimatedCostHighUsd: highs.length > 0 ? Math.max(...highs) : null,
      costEstimateComplete: estimates.length > 0 && estimates.every((estimate) => estimate.complete),
      errors,
    });
  }

  const knownLows = results.flatMap((result) =>
    result.estimatedCostLowUsd === null ? [] : [result.estimatedCostLowUsd]
  );
  const knownHighs = results.flatMap((result) =>
    result.estimatedCostHighUsd === null ? [] : [result.estimatedCostHighUsd]
  );
  return {
    compatible: results.every((result) => result.compatible),
    imageGenerationPerformed: false,
    plannedImageCalls: plan.jobs.length,
    plannedReferenceCalls: plan.jobs.filter((job) => Boolean(job.referenceImage)).length,
    estimatedCostLowUsd: knownLows.length > 0
      ? knownLows.reduce((sum, value) => sum + value, 0)
      : null,
    estimatedCostHighUsd: knownHighs.length > 0
      ? knownHighs.reduce((sum, value) => sum + value, 0)
      : null,
    costEstimateComplete:
      results.length > 0 && results.every((result) => result.costEstimateComplete),
    models: results,
  };
}

async function generateOpenRouterImage(
  job: BenchmarkJob,
  capability: PreflightModelResult
): Promise<GeneratedImage> {
  const apiKey = process.env.OPENROUTER_IMAGE_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_IMAGE_API_KEY is not configured');
  if (!capability.compatible || !capability.parameters) {
    throw new Error(`${job.model} did not pass preflight`);
  }
  if (job.referenceImage && capability.referenceLimit < 1) {
    throw new Error(`${job.model} does not advertise input_references support`);
  }

  const body: Record<string, unknown> = {
    model: job.model,
    prompt: job.prompt,
    ...capability.parameters,
  };
  if (job.referenceImage) {
    body.input_references = [{
      type: 'image_url',
      image_url: { url: await referenceDataUrl(job.referenceImage) },
    }];
  }

  const response = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`OpenRouter image generation failed with HTTP ${response.status}`);
  const payload = await response.json() as {
    data?: Array<{ b64_json?: string; media_type?: string; url?: string }>;
    usage?: Record<string, unknown>;
  };
  const image = payload.data?.[0];
  if (!image) throw new Error('OpenRouter returned no image');
  if (image.b64_json) {
    return {
      buffer: Buffer.from(image.b64_json, 'base64'),
      mediaType: image.media_type ?? 'image/png',
      usage: payload.usage,
    };
  }
  if (image.url) {
    const download = await fetch(image.url);
    if (!download.ok) throw new Error(`OpenRouter image download failed with HTTP ${download.status}`);
    return {
      buffer: Buffer.from(await download.arrayBuffer()),
      mediaType: download.headers.get('content-type') ?? 'image/png',
      usage: payload.usage,
    };
  }
  throw new Error('OpenRouter response has neither b64_json nor url');
}

async function generateOpenAIImage(job: BenchmarkJob): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  let response: Response;
  if (job.referenceImage) {
    const absolute = path.resolve(job.referenceImage);
    const buffer = await readFile(absolute);
    const form = new FormData();
    form.append('model', job.model);
    form.append('prompt', job.prompt);
    form.append('size', '1024x1536');
    form.append('quality', 'high');
    form.append('output_format', 'png');
    form.append('image', new Blob([buffer], { type: mimeTypeForReference(absolute) }), path.basename(absolute));
    response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: job.model,
        prompt: job.prompt,
        n: 1,
        size: '1024x1536',
        quality: 'high',
        output_format: 'png',
      }),
    });
  }
  if (!response.ok) throw new Error(`OpenAI image generation failed with HTTP ${response.status}`);
  const payload = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string }>;
    usage?: Record<string, unknown>;
  };
  const image = payload.data?.[0];
  if (!image) throw new Error('OpenAI returned no image');
  if (image.b64_json) {
    return { buffer: Buffer.from(image.b64_json, 'base64'), mediaType: 'image/png', usage: payload.usage };
  }
  if (image.url) {
    const download = await fetch(image.url);
    if (!download.ok) throw new Error(`OpenAI image download failed with HTTP ${download.status}`);
    return {
      buffer: Buffer.from(await download.arrayBuffer()),
      mediaType: download.headers.get('content-type') ?? 'image/png',
      usage: payload.usage,
    };
  }
  throw new Error('OpenAI response has neither b64_json nor url');
}

function extensionForMediaType(mediaType: string): string {
  if (mediaType.includes('jpeg')) return 'jpg';
  if (mediaType.includes('webp')) return 'webp';
  return 'png';
}

async function executeBenchmarkJob(
  job: BenchmarkJob,
  outputRoot: string,
  capability: PreflightModelResult,
  variants: number
): Promise<BenchmarkJobResult> {
  const startedAt = Date.now();
  const safeModel = job.model.replace(/[^a-zA-Z0-9.-]+/g, '-');
  const directory = path.join(outputRoot, `${job.provider}-${safeModel}`, job.fixture.id, `variant-${job.variant}`);
  await mkdir(directory, { recursive: true });
  let status: BenchmarkStatus = 'NEEDS_REVIEW';
  let error: string | null = null;
  let technical: Record<string, unknown> | null = null;
  let usage: Record<string, unknown> | undefined;
  let imageFilename: string | null = null;

  try {
    const generated = job.provider === 'openrouter'
      ? await generateOpenRouterImage(job, capability)
      : await generateOpenAIImage(job);
    usage = generated.usage;
    const extension = extensionForMediaType(generated.mediaType);
    imageFilename = `original.${extension}`;
    await writeFile(path.join(directory, imageFilename), generated.buffer);
    const metadata = await sharp(generated.buffer).metadata();
    const ratio = metadata.width && metadata.height ? metadata.width / metadata.height : null;
    technical = {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      format: metadata.format ?? null,
      bytes: generated.buffer.length,
      ratio,
      ratioDeviation: ratio === null ? null : Math.abs(ratio - 2 / 3),
      ratioWithinOnePercent: ratio === null ? false : Math.abs(ratio - 2 / 3) <= (2 / 3) * 0.01,
    };
  } catch (generationError) {
    status = 'FAIL';
    error = sanitizeError(generationError);
  }

  const durationMs = Date.now() - startedAt;
  const evaluation = {
    status,
    automatedVerdict: false,
    humanValidationRequired: true,
    note: 'Technical metadata is automatic. Text, visual quality, hierarchy, subject coverage and reference fidelity require human review unless a separately validated OCR/Vision process is run.',
    notApplicable: [
      ...(job.referenceImage ? [] : ['referenceFidelity']),
      ...(variants > 1 ? [] : ['diversity']),
    ],
    scores: createEmptyScores(),
    manualCriteria: Object.fromEntries(
      MANUAL_REVIEW_CRITERIA.map((criterion) => [criterion.key, {
        label: criterion.label,
        status: error ? 'FAIL' : 'NEEDS_REVIEW',
        score: null,
        notes: error ? 'Technical generation failure; no image available for review.' : '',
      }])
    ),
  };
  const result = {
    jobId: job.id,
    fixtureId: job.fixture.id,
    provider: job.provider,
    model: job.model,
    variant: job.variant,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    error,
    usage: usage ?? null,
    technical,
    capability,
    prompt: job.prompt,
    exactText: {
      headline: job.fixture.headline,
      subtitle: job.fixture.subtitle,
      cta: job.fixture.cta ?? null,
    },
    evaluation,
  };
  await writeFile(path.join(directory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return {
    job,
    success: error === null && imageFilename !== null,
    directory,
    imageFilename,
    durationMs,
    error,
    usage: usage ?? null,
    technical,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function returnedCost(usage: Record<string, unknown> | null): number | null {
  const value = usage?.cost;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function buildComparisonHtml(results: BenchmarkJobResult[], outputRoot: string): string {
  const fixtureIds = [...new Set(results.map((result) => result.job.fixture.id))];
  const sections = fixtureIds.map((fixtureId) => {
    const fixtureResults = results.filter((result) => result.job.fixture.id === fixtureId);
    const fixture = fixtureResults[0]?.job.fixture;
    const cards = fixtureResults.map((result) => {
      const relativeImage = result.imageFilename
        ? path.relative(outputRoot, path.join(result.directory, result.imageFilename)).replaceAll('\\', '/')
        : null;
      const cost = returnedCost(result.usage);
      const technicalStatus = result.success ? 'NEEDS_REVIEW' : 'FAIL';
      const criteria = MANUAL_REVIEW_CRITERIA.map((criterion) => `
        <tr>
          <td>${escapeHtml(criterion.label)}</td>
          <td><span class="status ${technicalStatus.toLowerCase()}">${technicalStatus}</span></td>
          <td contenteditable="true" aria-label="Score 0 to 5 for ${escapeHtml(criterion.label)}"></td>
          <td contenteditable="true" aria-label="Notes for ${escapeHtml(criterion.label)}"></td>
        </tr>`).join('');
      return `
      <article class="card">
        <header>
          <h3>${escapeHtml(result.job.model)}</h3>
          <span class="status ${technicalStatus.toLowerCase()}">${technicalStatus}</span>
        </header>
        ${relativeImage
          ? `<img src="${escapeHtml(relativeImage)}" alt="${escapeHtml(result.job.model)} — ${escapeHtml(fixtureId)}">`
          : `<div class="error">Technical failure: ${escapeHtml(result.error)}</div>`}
        <dl>
          <div><dt>Provider</dt><dd>${escapeHtml(result.job.provider)}</dd></div>
          <div><dt>Duration</dt><dd>${result.durationMs} ms</dd></div>
          <div><dt>Returned cost</dt><dd>${cost === null ? 'Unavailable' : `$${cost.toFixed(6)}`}</dd></div>
          <div><dt>Dimensions</dt><dd>${escapeHtml(result.technical?.width ?? '?')} × ${escapeHtml(result.technical?.height ?? '?')}</dd></div>
        </dl>
        <table>
          <thead><tr><th>Criterion</th><th>Status</th><th>Score /5</th><th>Notes</th></tr></thead>
          <tbody>${criteria}</tbody>
        </table>
      </article>`;
    }).join('');
    return `
    <section>
      <h2>${escapeHtml(fixture?.name ?? fixtureId)}</h2>
      <p class="copy"><strong>${escapeHtml(fixture?.headline)}</strong><br>${escapeHtml(fixture?.subtitle)}${fixture?.cta ? `<br>${escapeHtml(fixture.cta)}` : ''}</p>
      <div class="grid">${cards}</div>
    </section>`;
  }).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pinterest AI Integrated — Manual Comparison</title>
<style>
  :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f5f1e8;color:#211d18}body{margin:0;padding:32px}main{max-width:1800px;margin:auto}h1{margin-bottom:8px}h2{margin-top:48px}.intro,.copy{color:#62584c}.grid{display:grid;grid-template-columns:repeat(4,minmax(280px,1fr));gap:20px;align-items:start}.card{background:#fff;border:1px solid #d9d0c2;border-radius:16px;padding:16px;box-shadow:0 8px 24px #3a2c1712}.card header{display:flex;gap:12px;justify-content:space-between;align-items:start}.card h3{font-size:15px;overflow-wrap:anywhere;margin:0 0 12px}.card img{display:block;width:100%;aspect-ratio:2/3;object-fit:contain;background:#eee7da;border-radius:10px}.status{display:inline-block;font-size:11px;font-weight:800;padding:4px 7px;border-radius:999px;white-space:nowrap}.needs_review{background:#fff1bf;color:#765600}.fail{background:#ffd7d7;color:#8b1717}.error{padding:24px;background:#fff0f0;color:#8b1717;border-radius:10px}dl{font-size:12px}dl div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #eee6da;padding:5px 0}dt{font-weight:700}dd{margin:0;text-align:right}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:6px;border:1px solid #e5ddd1;text-align:left;vertical-align:top}td[contenteditable]{min-width:38px;background:#fffdf8}@media(max-width:1200px){.grid{grid-template-columns:repeat(2,minmax(280px,1fr))}}@media(max-width:700px){body{padding:16px}.grid{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Pinterest AI Integrated — Manual Comparison</h1>
<p class="intro">Generated outputs are not automatically ranked. Every successful image starts at NEEDS_REVIEW. Editable score and notes cells are intentionally left blank for human review.</p>
${sections}
</main></body></html>`;
}

export async function runBenchmark(
  plan: BenchmarkPlan,
  dependencies: BenchmarkRunDependencies = {}
): Promise<{
  executed: number;
  dryRun: boolean;
  generated?: number;
  failed?: number;
  outputRoot?: string;
  comparisonPath?: string;
  totalReturnedCostUsd?: number | null;
}> {
  if (!plan.execute) return { executed: 0, dryRun: true };
  if (plan.maxCalls === null) throw new Error('--execute requires an explicit --max-calls safety limit');
  if (plan.jobs.length > plan.maxCalls) {
    throw new Error(`Planned ${plan.jobs.length} calls exceed --max-calls ${plan.maxCalls}`);
  }
  const missingCredential = plan.models.find((model) => !model.credentialConfigured);
  if (missingCredential) {
    throw new Error(`Missing credential for ${missingCredential.provider}:${missingCredential.model}`);
  }
  if (plan.jobs.some((job) => job.referenceImage && !existsSync(path.resolve(job.referenceImage!)))) {
    throw new Error('A configured reference image does not exist');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputRoot = path.resolve(plan.outputRoot, timestamp);
  await mkdir(outputRoot, { recursive: true });
  const preflight = await runPreflight(plan, dependencies.fetchImpl ?? fetch);
  if (!preflight.compatible) {
    const failed = preflight.models
      .filter((model) => !model.compatible)
      .map((model) => `${model.provider}:${model.model}`)
      .join(', ');
    throw new Error(`Benchmark preflight failed for: ${failed}`);
  }
  const capabilities = new Map(
    preflight.models.map((model) => [`${model.provider}:${model.model}`, model])
  );

  const jobResults: BenchmarkJobResult[] = [];
  for (const job of plan.jobs) {
    if (dependencies.executeJob) {
      await dependencies.executeJob(job);
    } else {
      const capability = capabilities.get(`${job.provider}:${job.model}`)!;
      jobResults.push(await executeBenchmarkJob(job, outputRoot, capability, plan.variants));
    }
  }
  const comparisonPath = path.join(outputRoot, 'comparison.html');
  await writeFile(comparisonPath, buildComparisonHtml(jobResults, outputRoot), 'utf8');
  const returnedCosts = jobResults.flatMap((result) => {
    const cost = returnedCost(result.usage);
    return cost === null ? [] : [cost];
  });
  const summary = {
    attempted: plan.jobs.length,
    generated: jobResults.filter((result) => result.success).length,
    failed: jobResults.filter((result) => !result.success).length,
    totalReturnedCostUsd: returnedCosts.length > 0
      ? returnedCosts.reduce((sum, cost) => sum + cost, 0)
      : null,
    results: jobResults.map((result) => ({
      fixtureId: result.job.fixture.id,
      provider: result.job.provider,
      model: result.job.model,
      success: result.success,
      image: result.imageFilename
        ? path.relative(outputRoot, path.join(result.directory, result.imageFilename)).replaceAll('\\', '/')
        : null,
      result: path.relative(outputRoot, path.join(result.directory, 'result.json')).replaceAll('\\', '/'),
      durationMs: result.durationMs,
      costUsd: returnedCost(result.usage),
      error: result.error,
    })),
  };
  await writeFile(path.join(outputRoot, 'benchmark-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(
    path.join(outputRoot, 'benchmark-plan.json'),
    `${JSON.stringify({ ...plan, outputRoot }, null, 2)}\n`,
    'utf8'
  );
  return {
    executed: plan.jobs.length,
    dryRun: false,
    generated: summary.generated,
    failed: summary.failed,
    outputRoot,
    comparisonPath,
    totalReturnedCostUsd: summary.totalReturnedCostUsd,
  };
}

export function renderDryRun(plan: BenchmarkPlan): string {
  const referenceCalls = plan.jobs.filter((job) => Boolean(job.referenceImage)).length;
  const lines = [
    'Pinterest AI Integrated benchmark — DRY RUN',
    'No network request will be made.',
    `Models: ${plan.models.length}`,
    `Fixtures: ${plan.fixtures.length}`,
    `Variants per fixture/model: ${plan.variants}`,
    `Planned paid image calls: ${plan.jobs.length}`,
    `Safety limit: ${plan.maxCalls ?? 'not set (required for --execute)'}`,
    `Planned calls with a reference: ${referenceCalls}`,
    'Estimated cost: unavailable until --preflight retrieves endpoint pricing',
    `Output root when executed: ${path.resolve(plan.outputRoot)}`,
    '',
    'Model matrix:',
    ...plan.models.map((model) =>
      `- ${model.provider}:${model.model} | ${describeRequestedParameters(model.model)} | credential=${model.credentialConfigured ? 'configured' : 'missing'} | source=${model.source}`
    ),
    '',
    'Fixtures:',
    ...plan.fixtures.map((fixture) =>
      `- ${fixture.id}: ${[fixture.headline, fixture.subtitle, fixture.cta].filter(Boolean).join(' / ')}`
    ),
    '',
    'No image generation performed',
    'Use --preflight to verify discovery metadata. Use --execute only after explicit authorization.',
  ];
  return lines.join('\n');
}

function describeRequestedParameters(model: string): string {
  const parameters = ['aspect_ratio=2:3'];
  if (model.startsWith('openai/')) parameters.push('quality=high');
  if (model.startsWith('google/') || model.startsWith('qwen/')) {
    parameters.push('resolution=2K');
  }
  return parameters.join(', ');
}

function formatUsd(value: number | null): string {
  return value === null ? 'unavailable' : `$${value.toFixed(4)}`;
}

function describePricing(pricing: Array<Record<string, unknown>>): string {
  if (pricing.length === 0) return 'not exposed';
  return pricing.map((line) => {
    const billable = typeof line.billable === 'string' ? line.billable : 'unknown';
    const unit = typeof line.unit === 'string' ? line.unit : 'unknown';
    const cost = typeof line.cost_usd === 'number' || typeof line.cost_usd === 'string'
      ? line.cost_usd
      : 'unknown';
    const variant = typeof line.variant === 'string' ? `, variant=${line.variant}` : '';
    return `${billable}: $${cost}/${unit}${variant}`;
  }).join('; ');
}

export function renderPreflight(report: PreflightReport): string {
  const lines = [
    'Pinterest AI Integrated benchmark — PREFLIGHT ONLY',
    'Discovery requests only. No image generation performed',
    `Overall compatibility: ${report.compatible ? 'PASS' : 'FAIL'}`,
    `Planned future image calls: ${report.plannedImageCalls}`,
    `Planned future calls with a reference: ${report.plannedReferenceCalls}`,
    `Estimated future cost: ${formatUsd(report.estimatedCostLowUsd)} – ${formatUsd(report.estimatedCostHighUsd)}${report.costEstimateComplete ? '' : ' (partial or unavailable)'}`,
    '',
    'Models:',
  ];
  for (const model of report.models) {
    lines.push(
      `- ${model.provider}:${model.model} | exists=${model.exists ? 'yes' : 'no'} | compatible=${model.compatible ? 'yes' : 'no'}`,
      `  modalities: input=[${model.inputModalities.join(', ')}] output=[${model.outputModalities.join(', ')}]`,
      `  parameters: ${model.parameters ? Object.entries(model.parameters).map(([key, value]) => `${key}=${value}`).join(', ') : 'none'}`,
      `  format: ${model.parameters?.output_format ?? 'provider-native (output_format not advertised)'}`,
      `  references: max=${model.referenceLimit}`,
      `  endpoints: ${model.endpoints.length}`,
      `  estimated future cost: ${formatUsd(model.estimatedCostLowUsd)} – ${formatUsd(model.estimatedCostHighUsd)}${model.costEstimateComplete ? '' : ' (partial or unavailable)'}`
    );
    for (const error of model.errors) lines.push(`  error: ${error}`);
    for (const endpoint of model.endpoints) {
      const label = endpoint.providerTag ?? endpoint.providerName ?? 'unknown endpoint';
      lines.push(`  endpoint ${label} pricing: ${describePricing(endpoint.pricing)}`);
      for (const error of endpoint.errors) lines.push(`  endpoint ${label}: ${error}`);
    }
  }
  return lines.join('\n');
}

export function preflightExitCode(report: PreflightReport): 0 | 1 {
  return report.compatible ? 0 : 1;
}

function printHelp(): void {
  console.log(`Usage: npm run benchmark:pinterest-ai -- [options]

Dry-run is the default and performs no network request.

Options:
  --execute                    Enable provider discovery and paid image calls
  --preflight                  Run discovery GETs only; never generate an image
  --model provider:model-id    Exact model id; repeat to compare configured models
  --variants N                 Variants per fixture/model (1-10, default 1)
  --only-fixture ID            Include only this fixture; repeat as needed
  --max-calls N                Hard paid-call ceiling; required with --execute
  --fixture ID --reference PATH
                               Attach one JPG/PNG/WebP reference to one fixture only
  --output PATH                Ignored output root (default ${DEFAULT_OUTPUT_ROOT})
  --help                       Show this help`);
}

async function main(): Promise<void> {
  await loadEnvFile(path.join(process.cwd(), '.env.local'));
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const fixtures = await loadFixtures();
  const models = resolveBenchmarkModels(process.env, options.modelOverrides);
  const plan = buildBenchmarkPlan(options, fixtures, models);
  if (options.preflight) {
    const report = await runPreflight(plan);
    console.log(renderPreflight(report));
    process.exitCode = preflightExitCode(report);
    return;
  }
  if (!options.execute) {
    console.log(renderDryRun(plan));
    return;
  }
  const result = await runBenchmark(plan);
  console.log(`Benchmark complete: ${result.executed} attempted, ${result.generated} generated, ${result.failed} failed.`);
  console.log(`Results: ${result.outputRoot}`);
  console.log(`Comparison: ${result.comparisonPath}`);
}

const isDirectInvocation =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) ===
    path.resolve(process.cwd(), 'scripts', 'pinterest-ai-benchmark.ts');

if (isDirectInvocation) {
  main().catch((error) => {
    console.error(`Benchmark failed: ${sanitizeError(error)}`);
    process.exitCode = 1;
  });
}
