import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import {
  AI_INTEGRATED_REFERENCE_UNSUPPORTED_MESSAGE,
  PHOTO_ONLY_REFERENCE_UNSUPPORTED_MESSAGE,
  generatePinsSchema,
} from '@/lib/validations/pinterest';
import { generateImage } from '@/lib/ai/services/image';
import { buildImagePrompt } from '@/lib/ai/prompt-engine/engine';
import { buildPinterestPinsPrompt } from '@/lib/prompts/pinterest-pins';
import {
  getPinGenerationModeLabel,
} from '@/components/pinterest/pin-diagnostic-badges';
import {
  attachAiIntegratedMetadata,
  buildAiIntegratedImagePrompt,
  generationModeForVisualFormat,
  readAiIntegratedMetadata,
  resolveAiIntegratedText,
  resolveEffectiveLanguage,
  resolvePinAngle,
  validateFinalPinterestImage,
  type AiIntegratedSettings,
} from '@/lib/pinterest/ai-integrated';

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
  cta: { mode: 'none' },
  maximumTextLines: 4,
  importance: { headline: 'high', subtitle: 'medium', cta: 'low' },
};

test('AI Integrated request contract accepts every creative format and strategy shape', () => {
  for (const creativeFormat of ['hero-pin', 'pattern-guide', 'editorial-story', 'ai-chooses']) {
    const parsed = generatePinsSchema.safeParse({
      ...baseRequest,
      generationMode: 'ai-integrated',
      aiIntegrated: { ...settings, creativeFormat },
    });
    expect(parsed.success).toBe(true);
  }

  const manual = generatePinsSchema.safeParse({
    ...baseRequest,
    generationMode: 'ai-integrated',
    aiIntegrated: { ...settings, strategy: 'manual', manualAngle: 'problem-solution' },
  });
  expect(manual.success).toBe(true);
  expect(resolvePinAngle('manual', 'problem-solution', 'curiosity')).toBe('problem-solution');
});

test('request contract rejects missing manual angle and exact text beyond the line budget', () => {
  const missingAngle = generatePinsSchema.safeParse({
    ...baseRequest,
    generationMode: 'ai-integrated',
    aiIntegrated: { ...settings, strategy: 'manual' },
  });
  expect(missingAngle.success).toBe(false);

  const tooManyLines = generatePinsSchema.safeParse({
    ...baseRequest,
    generationMode: 'ai-integrated',
    aiIntegrated: {
      ...settings,
      headline: { mode: 'exact', text: 'ONE\nTWO' },
      subtitle: { mode: 'exact', text: 'THREE' },
      maximumTextLines: 2,
    },
  });
  expect(tooManyLines.success).toBe(false);
});

test('text modes preserve exact strings, generate requested strings, and omit None fields', () => {
  const resolved = resolveAiIntegratedText(
    {
      ...settings,
      headline: { mode: 'exact', text: '  EXACT HEADLINE  ' },
      subtitle: { mode: 'generate' },
      cta: { mode: 'none' },
    },
    { headline: 'ignored', subtitle: 'Generated subtitle', cta: 'ignored' }
  );
  expect(resolved).toEqual({
    headline: 'EXACT HEADLINE',
    subtitle: 'Generated subtitle',
    cta: null,
  });
});

test('AI Integrated inherits a supported project language and legacy keeps the request language', () => {
  expect(resolveEffectiveLanguage('ai-integrated', 'en', 'de')).toBe('de');
  expect(resolveEffectiveLanguage('ai-integrated', 'fr', null)).toBe('fr');
  expect(resolveEffectiveLanguage('legacy-composite', 'es', 'de')).toBe('es');
});

test('metadata round-trips in image_analysis without replacing existing keys', () => {
  const text = { headline: 'SAVE THIS IDEA', subtitle: 'For later', cta: null };
  const json = attachAiIntegratedMetadata('{"palette":["cream"]}', {
    language: 'en',
    settings,
    text,
  });
  expect(JSON.parse(json).palette).toEqual(['cream']);
  expect(readAiIntegratedMetadata(json)?.text).toEqual(text);
});

test('all form settings and final exact text are serialized under _pinterestAiIntegrated', () => {
  const configured: AiIntegratedSettings = {
    ...settings,
    creativeFormat: 'editorial-story',
    strategy: 'manual',
    manualAngle: 'discovery',
    headline: { mode: 'exact', text: 'DIE BESTEN BAD IDEEN' },
    subtitle: { mode: 'exact', text: 'Für kleine Räume' },
    cta: { mode: 'none' },
    maximumTextLines: 3,
    importance: { headline: 'high', subtitle: 'low', cta: 'low' },
  };
  const text = resolveAiIntegratedText(configured, undefined);
  const serialized = attachAiIntegratedMetadata('{"_pinterestStrategy":{"angle":"curiosity"}}', {
    language: 'de',
    settings: configured,
    text,
  });
  const parsed = JSON.parse(serialized);
  expect(parsed._pinterestStrategy.angle).toBe('curiosity');
  expect(parsed._pinterestAiIntegrated).toEqual({
    language: 'de',
    settings: configured,
    text: {
      headline: 'DIE BESTEN BAD IDEEN',
      subtitle: 'Für kleine Räume',
      cta: null,
    },
  });
  const generationRoute = readFileSync('app/api/pinterest/generate/route.ts', 'utf8');
  expect(generationRoute).toContain('attachAiIntegratedMetadata(strategyMetadata,');
  expect(generationRoute).toContain('resolveAiIntegratedText(aiIntegrated, pin.integratedText)');
});

test('historical pins without _pinterestAiIntegrated remain readable as legacy', () => {
  expect(readAiIntegratedMetadata(null)).toBeNull();
  expect(readAiIntegratedMetadata('{malformed')).toBeNull();
  expect(readAiIntegratedMetadata('{"_pinterestStrategy":{"angle":"curiosity"}}')).toBeNull();
  expect(generationModeForVisualFormat('photo')).toBe('legacy-composite');
  expect(generationModeForVisualFormat('text-overlay')).toBe('legacy-composite');
});

test('new Pin badges identify the mode without showing legacy template or Quality Gate fields', () => {
  expect(getPinGenerationModeLabel('ai-integrated')).toBe('AI Integrated');
  expect(getPinGenerationModeLabel('photo-only')).toBe('Photo Only');
  expect(getPinGenerationModeLabel('photo')).toBe('Legacy Composite');
  expect(getPinGenerationModeLabel('text-overlay')).toBe('Legacy Composite');

  const badgesSource = readFileSync('components/pinterest/pin-diagnostic-badges.tsx', 'utf8');
  expect(badgesSource).toContain("const isLegacy = pin.visual_format === 'photo' || pin.visual_format === 'text-overlay'");
  expect(badgesSource).toContain('{isLegacy && <>');
  expect(badgesSource).toContain('{!isLegacy && (');
  expect(badgesSource).toContain('Visual review needed');

  const detailSource = readFileSync('components/pinterest/pin-detail-dialog.tsx', 'utf8');
  const reviewSource = readFileSync('components/pinterest/pin-batch-review-dialog.tsx', 'utf8');
  expect(detailSource).toContain('getPinGenerationModeLabel(pin.visual_format)');
  expect(reviewSource).toContain("pin.visual_format === 'photo' || pin.visual_format === 'text-overlay'");
});

test('integrated prompt sends approved text and explicitly bans all extra text', () => {
  const prompt = buildAiIntegratedImagePrompt(
    { image_prompt: 'A realistic crochet cat on a craft table.', language: 'en', board: 'Crochet' },
    {
      language: 'en',
      settings,
      text: { headline: '7 CUTE CROCHET CAT IDEAS', subtitle: 'Save these', cta: null },
    }
  );
  expect(prompt).toContain('7 CUTE CROCHET CAT IDEAS');
  expect(prompt).toContain('render only the approved text');
  expect(prompt).toContain('watermark');
  expect(prompt).not.toMatch(/SVG|Sharp/);
});

test('new modes are isolated while historical formats remain Legacy Composite', () => {
  expect(generationModeForVisualFormat('ai-integrated')).toBe('ai-integrated');
  expect(generationModeForVisualFormat('photo-only')).toBe('photo-only');
  expect(generationModeForVisualFormat('photo')).toBe('legacy-composite');
  expect(generationModeForVisualFormat('text-overlay')).toBe('legacy-composite');

  const route = readFileSync('app/api/pinterest/generate-images/route.ts', 'utf8');
  expect(route).toContain("if (generationMode !== 'legacy-composite')");
  expect(route).toContain('imageBuffer = await compositeBanner(');
  expect(route).toContain('composeHeadlineWithQualityGate({');
  expect(route).toContain('validateFinalPinterestImage(rawImageBuffer)');
});

test('legacy requests without generationMode stay Legacy Composite; Photo Only carries no text settings', () => {
  const legacy = generatePinsSchema.safeParse(baseRequest);
  expect(legacy.success).toBe(true);
  if (legacy.success) {
    expect(legacy.data.generationMode).toBe('legacy-composite');
    expect(legacy.data).toMatchObject({ textOverlayMode: 'auto' });
  }

  const photoOnly = generatePinsSchema.safeParse({ ...baseRequest, generationMode: 'photo-only' });
  expect(photoOnly.success).toBe(true);
  if (photoOnly.success) expect(photoOnly.data).not.toHaveProperty('textOverlayMode');

  // AI Integrated cannot be requested without its settings.
  expect(
    generatePinsSchema.safeParse({ ...baseRequest, generationMode: 'ai-integrated' }).success
  ).toBe(false);
});

test('the request contract never accepts a client-chosen model or provider', () => {
  const withTopLevel = generatePinsSchema.safeParse({
    ...baseRequest,
    generationMode: 'ai-integrated',
    aiIntegrated: settings,
    model: 'attacker/model',
    provider: 'attacker',
  });
  expect(withTopLevel.success).toBe(true);
  if (withTopLevel.success) {
    expect(JSON.stringify(withTopLevel.data)).not.toMatch(/attacker/);
  }

  const withNested = generatePinsSchema.safeParse({
    ...baseRequest,
    generationMode: 'ai-integrated',
    aiIntegrated: { ...settings, model: 'attacker/model' },
  });
  expect(withNested.success).toBe(false);
});

test('subtitle and CTA accept None, headline does not', () => {
  const noHeadline = generatePinsSchema.safeParse({
    ...baseRequest,
    generationMode: 'ai-integrated',
    aiIntegrated: { ...settings, headline: { mode: 'none' } },
  });
  expect(noHeadline.success).toBe(false);

  const emptyExact = generatePinsSchema.safeParse({
    ...baseRequest,
    generationMode: 'ai-integrated',
    aiIntegrated: { ...settings, cta: { mode: 'exact', text: '   ' } },
  });
  expect(emptyExact.success).toBe(false);
});

test('generated text is required when a field is set to Generate and lines are enforced', () => {
  expect(() => resolveAiIntegratedText(settings, undefined)).toThrow(/headline was not generated/);
  expect(() =>
    resolveAiIntegratedText(
      { ...settings, maximumTextLines: 2, subtitle: { mode: 'generate' } },
      { headline: 'ONE\nTWO', subtitle: 'THREE' }
    )
  ).toThrow(/Maximum text lines/);
});

test('every creative format adds its own grounded direction to the integrated prompt', () => {
  const pin = { image_prompt: 'A cosy bathroom scene.', language: 'de', board: 'Bad' };
  const text = { headline: 'Kleines Bad, große Wirkung', subtitle: 'Ideen für dich', cta: null };
  const promptFor = (creativeFormat: AiIntegratedSettings['creativeFormat']) =>
    buildAiIntegratedImagePrompt(pin, {
      language: 'de',
      settings: { ...settings, creativeFormat },
      text,
    });

  expect(promptFor('hero-pin')).toContain('Hero Pin');
  expect(promptFor('pattern-guide')).toMatch(/Never invent steps, materials, measurements/);
  expect(promptFor('editorial-story')).toContain('75-80%');
  expect(promptFor('editorial-story')).toMatch(/never cover a shower, vanity, bathtub/);
  expect(promptFor('ai-chooses')).toMatch(/Pattern Guide remains forbidden/);

  const prompt = promptFor('editorial-story');
  expect(prompt).toContain('Deutsch');
  expect(prompt).toContain('"Kleines Bad, große Wirkung"');
  expect(prompt).toContain('CTA (subtle): NONE');
  expect(prompt).toMatch(/Do not reveal complete instructions/);
});

test('integrated prompt honours the line budget and never mentions the legacy renderer', () => {
  const prompt = buildAiIntegratedImagePrompt(
    { image_prompt: 'Crochet sweater on a wooden hanger.', language: 'en', board: 'Crochet' },
    { language: 'en', settings: { ...settings, maximumTextLines: 3 }, text: { headline: 'A', subtitle: null, cta: null } },
    3
  );
  expect(prompt).toContain('no more than 3 total visible text lines');
  expect(prompt).toContain('version 3');
  // "composition" is legitimate photographic wording; only the legacy
  // renderer's own vocabulary is forbidden.
  expect(prompt).not.toMatch(/\b(?:SVG|Sharp)\b|banner|composite|overlay/i);
});

test('Photo Only keeps the blanket no-text constraint of the photographic prompt', () => {
  const prompt = buildImagePrompt({
    title: 't',
    description: 'd',
    keywords: 'k',
    board: 'Home Decor',
    image_prompt: 'A sunlit kitchen.',
    visual_format: 'photo-only',
    overlay_text: null,
    language: 'en',
  });
  expect(prompt).toContain('no text, no typography');
});

test('FAST prompt asks for final integrated text only in AI Integrated and drops legacy banner fields', () => {
  const common = { keyword: 'crochet cat', language: 'en', pinsRequested: 5, textOverlayMode: 'auto' } as const;
  const integrated = buildPinterestPinsPrompt({
    ...common,
    generationMode: 'ai-integrated',
    aiIntegrated: {
      ...settings,
      strategy: 'manual',
      manualAngle: 'listicle',
      headline: { mode: 'exact', text: 'EXACT HEADLINE' },
      cta: { mode: 'exact', text: 'Save this' },
    },
  }).user;
  expect(integrated).toContain('integratedText');
  expect(integrated).toContain('"EXACT HEADLINE"');
  expect(integrated).toContain('"Save this"');
  expect(integrated).toContain('Use the "listicle" angle for every pin.');
  expect(integrated).toContain('This mode does not use the legacy renderer');

  const legacy = buildPinterestPinsPrompt(common).user;
  expect(legacy).not.toContain('integratedText');
  expect(legacy).toContain('ctaBannerTemplate: choose');
});

test('AI Integrated dispatch happens before any legacy renderer call in the image route', () => {
  const route = readFileSync('app/api/pinterest/generate-images/route.ts', 'utf8');
  const start = route.indexOf("if (generationMode !== 'legacy-composite') {");
  const elseIndex = route.indexOf('} else {', start);
  expect(start).toBeGreaterThan(-1);
  expect(elseIndex).toBeGreaterThan(start);

  const newModeBranch = route.slice(start, elseIndex);
  expect(newModeBranch).toContain('validateFinalPinterestImage(rawImageBuffer)');
  for (const legacyCall of [
    'compositeBanner',
    'composeHeadlineWithQualityGate',
    'selectHeadlineTemplate',
    'extractAccentColor',
    'pickCtaMessage',
  ]) {
    expect(newModeBranch).not.toContain(legacyCall);
  }

  const legacyBranch = route.slice(elseIndex);
  for (const legacyCall of [
    'extractAccentColor(rawImageBuffer)',
    'compositeBanner(',
    'selectHeadlineTemplate(',
    'composeHeadlineWithQualityGate({',
  ]) {
    expect(legacyBranch).toContain(legacyCall);
  }
});

test('recomposition routes stay gated to legacy text-overlay pins', () => {
  for (const file of [
    'app/api/pinterest/pin-images/recompose/route.ts',
    'app/api/pinterest/pin-images/recompose/preview/route.ts',
  ]) {
    expect(readFileSync(file, 'utf8')).toContain("pin.visual_format !== 'text-overlay'");
  }
});

// --- Reference images: Legacy Composite only (no Vision, no provider) --------

const referenceUrl =
  'https://project.supabase.co/storage/v1/object/public/reference-images/user/ref.png';

test('AI Integrated without a reference stays valid', () => {
  for (const extra of [{}, { referenceImageUrl: undefined }]) {
    const parsed = generatePinsSchema.safeParse({
      ...baseRequest,
      generationMode: 'ai-integrated',
      aiIntegrated: settings,
      ...extra,
    });
    expect(parsed.success).toBe(true);
  }
});

test('AI Integrated rejects any reference with a clear error, before Vision or a provider', () => {
  for (const referenceImageUrl of [referenceUrl, 'not-a-url', '', null, 'https://evil.example/x.png']) {
    const parsed = generatePinsSchema.safeParse({
      ...baseRequest,
      generationMode: 'ai-integrated',
      aiIntegrated: settings,
      referenceImageUrl,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(AI_INTEGRATED_REFERENCE_UNSUPPORTED_MESSAGE);
      expect(parsed.error.issues[0].path).toEqual(['referenceImageUrl']);
    }
  }
});

test('Photo Only stays without a reference', () => {
  expect(
    generatePinsSchema.safeParse({ ...baseRequest, generationMode: 'photo-only' }).success
  ).toBe(true);

  for (const referenceImageUrl of [referenceUrl, '', null]) {
    const parsed = generatePinsSchema.safeParse({
      ...baseRequest,
      generationMode: 'photo-only',
      referenceImageUrl,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(PHOTO_ONLY_REFERENCE_UNSUPPORTED_MESSAGE);
    }
  }
});

test('Legacy Composite keeps its existing reference behavior, including for obsolete clients', () => {
  const explicit = generatePinsSchema.safeParse({
    ...baseRequest,
    generationMode: 'legacy-composite',
    referenceImageUrl: referenceUrl,
  });
  expect(explicit.success).toBe(true);
  if (explicit.success) expect(explicit.data.referenceImageUrl).toBe(referenceUrl);

  // A pre-TASK-041 payload has no generationMode and must keep working as is.
  const obsolete = generatePinsSchema.safeParse({ ...baseRequest, referenceImageUrl: referenceUrl });
  expect(obsolete.success).toBe(true);
  if (obsolete.success) {
    expect(obsolete.data.generationMode).toBe('legacy-composite');
    expect(obsolete.data.referenceImageUrl).toBe(referenceUrl);
  }

  const withoutReference = generatePinsSchema.safeParse({ ...baseRequest, generationMode: 'legacy-composite' });
  expect(withoutReference.success).toBe(true);

  const malformed = generatePinsSchema.safeParse({
    ...baseRequest,
    generationMode: 'legacy-composite',
    referenceImageUrl: 'not-a-url',
  });
  expect(malformed.success).toBe(false);
  if (!malformed.success) expect(malformed.error.issues[0].message).toBe('Invalid reference image URL');
});

test('the generate route can only reach Vision for Legacy Composite, after validation', () => {
  const route = readFileSync('app/api/pinterest/generate/route.ts', 'utf8');
  const parse = route.indexOf('generatePinsSchema.safeParse(body)');
  const guard = route.indexOf("const referenceImageUrl = generationMode === 'legacy-composite'");
  const visionBranch = route.indexOf('if (referenceImageUrl) {');
  const vision = route.indexOf('analyzeImage({');

  expect(parse).toBeGreaterThan(-1);
  expect(guard).toBeGreaterThan(parse);
  expect(visionBranch).toBeGreaterThan(guard);
  expect(vision).toBeGreaterThan(visionBranch);
  expect(route.match(/analyzeImage\(\{/g)).toHaveLength(1);
  // The validation failure returns before any of the above.
  expect(route.slice(parse, guard)).toContain("code: 'invalid_request'");
});

test('the form only offers and sends a reference in Legacy Composite, and tells AI Integrated users it is coming', () => {
  const form = readFileSync('components/pinterest/pin-form.tsx', 'utf8');

  expect(form.match(/<ReferenceImageUpload/g)).toHaveLength(1);
  const uploadIndex = form.indexOf('<ReferenceImageUpload');
  expect(form.slice(uploadIndex - 400, uploadIndex)).toContain("generationMode === 'legacy-composite'");

  const basePayload = form.slice(
    form.indexOf('const basePayload = {'),
    form.indexOf('};', form.indexOf('const basePayload = {'))
  );
  expect(basePayload).not.toContain('referenceImageUrl');

  expect(form).toContain(
    'Reference images for AI Integrated are coming soon. A reference is not yet sent to the image model.'
  );
  expect(form).toContain("generationMode === 'ai-integrated' && (");
});

// --- Exact provider contract (offline: fetch is stubbed, no paid call) -------

const PROVIDER_ENV_KEYS = [
  'AI_IMAGE_PROVIDER',
  'AI_IMAGE_MODEL',
  'AI_IMAGE_MODEL_TEXT',
  'OPENROUTER_IMAGE_API_KEY',
  'OPENAI_API_KEY',
] as const;

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

async function captureProviderRequest(
  env: Partial<Record<(typeof PROVIDER_ENV_KEYS)[number], string>>,
  call: () => Promise<Buffer>
): Promise<{ request: CapturedRequest; output: Buffer }> {
  const savedEnv = Object.fromEntries(PROVIDER_ENV_KEYS.map((key) => [key, process.env[key]]));
  const savedFetch = globalThis.fetch;
  const png = await sharp({
    create: { width: 200, height: 300, channels: 3, background: '#eee8dc' },
  }).png().toBuffer();
  let captured: CapturedRequest | undefined;

  for (const key of PROVIDER_ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = { url: String(input), body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const output = await call();
    if (!captured) throw new Error('No provider request was captured');
    return { request: captured, output };
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of PROVIDER_ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('AI Integrated sends exactly model, prompt, aspect_ratio 2:3 and quality high to the server-owned model', async () => {
  const prompt = buildAiIntegratedImagePrompt(
    { image_prompt: 'A crochet cat.', language: 'en', board: 'Crochet' },
    { language: 'en', settings, text: { headline: 'CROCHET CAT', subtitle: null, cta: null } }
  );
  const { request, output } = await captureProviderRequest(
    {
      AI_IMAGE_PROVIDER: 'openrouter',
      AI_IMAGE_MODEL: 'vendor/photo-model',
      AI_IMAGE_MODEL_TEXT: 'vendor/server-owned-text-model',
      OPENROUTER_IMAGE_API_KEY: 'test-key-not-a-secret',
    },
    () => generateImage({ prompt, size: '1024x1536', visualFormat: 'ai-integrated' })
  );

  expect(request.url).toBe('https://openrouter.ai/api/v1/images');
  expect(request.body).toEqual({
    model: 'vendor/server-owned-text-model',
    prompt,
    aspect_ratio: '2:3',
    quality: 'high',
  });
  expect(JSON.stringify(request.body)).not.toContain('test-key-not-a-secret');
  // The provider bytes are returned untouched: no re-encode, no composition.
  expect((await sharp(output).metadata()).width).toBe(200);
});

test('Legacy Composite and Photo Only provider payloads are unchanged', async () => {
  const openrouter = await captureProviderRequest(
    {
      AI_IMAGE_PROVIDER: 'openrouter',
      AI_IMAGE_MODEL: 'vendor/photo-model',
      OPENROUTER_IMAGE_API_KEY: 'test-key-not-a-secret',
    },
    () => generateImage({ prompt: 'photo prompt', size: '1024x1536', visualFormat: 'photo' })
  );
  expect(openrouter.request.body).toEqual({
    model: 'vendor/photo-model',
    prompt: 'photo prompt',
    size: '1024x1536',
  });

  const photoOnly = await captureProviderRequest(
    {
      AI_IMAGE_PROVIDER: 'openrouter',
      AI_IMAGE_MODEL: 'vendor/photo-model',
      OPENROUTER_IMAGE_API_KEY: 'test-key-not-a-secret',
    },
    () => generateImage({ prompt: 'photo prompt', size: '1024x1536', visualFormat: 'photo-only' })
  );
  expect(photoOnly.request.body).toEqual(openrouter.request.body);

  const openai = await captureProviderRequest(
    {
      AI_IMAGE_PROVIDER: 'openai',
      AI_IMAGE_MODEL: 'gpt-image-1',
      OPENAI_API_KEY: 'test-key-not-a-secret',
    },
    () => generateImage({ prompt: 'photo prompt', size: '1024x1536', visualFormat: 'photo' })
  );
  expect(openai.request.url).toBe('https://api.openai.com/v1/images/generations');
  expect(openai.request.body).toEqual({
    model: 'gpt-image-1',
    prompt: 'photo prompt',
    n: 1,
    size: '1024x1536',
    quality: 'low',
  });
});

test('technical validation accepts 2:3 and rejects another ratio without network calls', async () => {
  const valid = await sharp({
    create: { width: 200, height: 300, channels: 3, background: '#eee8dc' },
  }).png().toBuffer();
  await expect(validateFinalPinterestImage(valid)).resolves.toMatchObject({
    width: 200,
    height: 300,
    format: 'png',
  });

  const invalid = await sharp({
    create: { width: 300, height: 300, channels: 3, background: '#eee8dc' },
  }).png().toBuffer();
  await expect(validateFinalPinterestImage(invalid)).rejects.toThrow(/expected a 2:3/);
});
