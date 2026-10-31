import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import sharp from 'sharp';
import * as wordpressPostSource from '@/lib/social/pinterest-from-wordpress-post';
import { buildWordPressArticleContext, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import { buildArticleGrounding, attachArticleSourceMetadata, planArticlePinSections } from '@/lib/pinterest/article-briefs';
import {
  buildListicleAnglePlan,
  detectListicleNumber,
  isNumberedAngle,
  numberedPinCount,
  planListicleImageSources,
  titleListCount,
  validateListicleBatch,
} from '@/lib/pinterest/listicle';
import { validatePinterestStrategyBatch } from '@/lib/pinterest/strategy';
import { buildStrategySafeguardError } from '@/lib/pinterest/strategy-errors';
import { buildTitleRepairPrompt, parseTitleRepair, titleRepairTargets, type TitleRepairTarget } from '@/lib/pinterest/title-repair';
import { strategySafeguardView } from '@/components/pinterest/strategy-safeguard-alert';
import type { StrategySafeguardError } from '@/lib/pinterest/strategy-errors';
import {
  ARTICLE_IMAGE_MODEL,
  attachComposerMetadata,
  buildListicleComposerMetadata,
  readComposerMetadata,
  verifyComposerText,
  type ListicleMetadata,
} from '@/lib/pinterest/composer/content';
import { COMPOSER_MIN_CONTRAST, COMPOSER_PALETTE, contrastRatio, renderComposedPin } from '@/lib/pinterest/composer/render';
import { composePinImage, composerImageCallCount } from '@/lib/pinterest/composer/pipeline';
import { ArticleImageError, downloadArticleImage, loadArticlePhoto } from '@/lib/pinterest/composer/article-image';
import { buildPinterestPinsPrompt } from '@/lib/prompts';
import { readPinVisualFormat } from '@/lib/social/pin-display';
import { PINTEREST_ANGLES, type PinterestAngle } from '@/types/pinterest';
import type { Pin } from '@/types/database';

// TASK-083 — number-aware titles + article-image listicle Pins. Offline: no
// AI, Vision, image model, WordPress write or real storage call. Article
// photos are served by a fake `fetch`; routes run on fake Supabase clients.

const SITE = 'https://crochet.example.test';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = '22222222-2222-4222-8222-222222222222';

const BLANKETS = [
  'Moss Stitch', 'Waffle', 'Ripple', 'Granny Stripe', 'Lemon Peel', 'Basketweave', 'Shell', 'Bobble', 'Cable', 'Tunisian',
  'Corner to Corner', 'Puff Stitch', 'Star Stitch', 'Linen Stitch', 'Hexagon', 'Mesh', 'Wave', 'Popcorn',
];

const imageUrl = (index: number) => `${SITE}/wp-content/uploads/blanket-${index}.jpg`;
const FEATURED = `${SITE}/wp-content/uploads/featured-blankets.jpg`;

/** A list article: N numbered blanket sections; `withImages` = sections that carry their own photo. */
function blanketHtml(count: number, withImages: (index: number) => boolean = () => true): string {
  return [
    `<p>These crochet blankets are soft, warm and made for cozy winter evenings on the sofa.</p>`,
    ...BLANKETS.slice(0, count).map((name, i) => {
      const n = i + 1;
      const figure = withImages(n) ? `<figure><img src="${imageUrl(n)}" alt="${name} blanket"></figure>` : '';
      return `<h2>${n}. ${name} Blanket</h2>${figure}<p>The ${name.toLowerCase()} crochet blanket in cream cotton yarn has a soft texture for the sofa.</p>`;
    }),
  ].join('\n');
}

function article(title: string, html: string, language = 'en', featured: string | null = FEATURED): WordPressArticleContext {
  return buildWordPressArticleContext({
    sourceType: 'external_wordpress_post',
    html,
    title,
    excerpt: '',
    language,
    featuredImage: featured ? { url: featured, alt: 'Crochet blankets' } : null,
    permalink: `${SITE}/blankets/`,
  });
}

const FIFTEEN = article('15 Cozy Crochet Blanket Ideas for Winter', blanketHtml(15));
const NO_NUMBER = article(
  'Cozy Crochet Blankets for Winter',
  `<p>Crochet blankets for cozy evenings.</p><h2>Moss stitch blanket</h2><p>A moss stitch crochet blanket in cream cotton yarn with a soft texture for the sofa.</p><h2>Waffle blanket</h2><p>A waffle crochet blanket in cream cotton yarn with a deep texture for the bed.</p><h2>Ripple blanket</h2><p>A ripple crochet blanket in cream cotton yarn that drapes over the sofa.</p>`
);
const HOSTS = ['crochet.example.test'];

// ── Detection ──────────────────────────────────────────────────────────────

test.describe('Number detection: only a count the article really states', () => {
  test('the H1 count in English, German, French and Spanish', () => {
    const cases: Array<[string, string, string]> = [
      ['15 Cozy Crochet Blanket Ideas for Winter', 'en', '15'],
      ['18 gemütliche Häkeldecken-Ideen für den Winter', 'de', '18'],
      ['15 idées de couvertures au crochet pour l’hiver', 'fr', '15'],
      ['15 ideas de mantas de ganchillo para el invierno', 'es', '15'],
      ['Top 12 Crochet Blankets to Make This Winter', 'en', '12'],
    ];
    for (const [title, language, expected] of cases) {
      expect(detectListicleNumber(article(title, blanketHtml(15), language)), title).toEqual({ value: expected, source: 'title' });
    }
  });

  test('years, measures, durations, ordinals, positions, open counts and two counts give no number', () => {
    for (const title of [
      'Pasta al limón con ajo en 20 minutos',
      'Crochet Blanket Trends 2026',
      'Häkelnadel 5 mm: der Ratgeber',
      'Step 3: Join the Squares',
      'Teil 2 der Deckenserie',
      'The 2nd Blanket I Ever Made',
      'Le 1er plaid de l’hiver',
      '10+ Crochet Blanket Ideas',
      '5 Hats and 3 Scarves to Crochet',
      'A Blanket in 3 Days',
      '3,5 kg Wolle verhäkeln',
    ]) {
      expect(titleListCount(title), title).toBeNull();
    }
  });

  test('a reliable numbered list (1…N, no gap) gives the count when the H1 has none; tutorials and gaps do not', () => {
    const listOnly = article('Cozy Crochet Blanket Ideas for Winter', blanketHtml(12));
    expect(detectListicleNumber(listOnly)).toEqual({ value: '12', source: 'list' });
    expect(detectListicleNumber(article('How to Crochet a Blanket', blanketHtml(5)))).toBeNull();
    const gap = blanketHtml(4).replace('<h2>3. ', '<h2>7. ');
    expect(detectListicleNumber(article('Cozy Crochet Blanket Ideas', gap))).toBeNull();
  });

  test('no number anywhere: null (the current behavior applies)', () => {
    expect(detectListicleNumber(NO_NUMBER)).toBeNull();
  });

  test('a count only in the subtitle needs a numbered list of exactly that size', () => {
    // A size guide whose subtitle mentions "6 Color Ideas", with 4 numbered steps: not a listicle.
    expect(detectListicleNumber(article('Autumn Brioche Crochet Cardigan: Size Guide, Steps & 6 Color Ideas', blanketHtml(4)))).toBeNull();
    expect(detectListicleNumber(article('Winter Crochet: 15 Cozy Blanket Ideas', blanketHtml(15)))).toEqual({ value: '15', source: 'title' });
    expect(detectListicleNumber(article('Winter Crochet: 15 Cozy Blanket Ideas', blanketHtml(12)))).toBeNull();
  });

  test('the H1 count wins even when the list shown is shorter', () => {
    expect(detectListicleNumber(article('15 Cozy Crochet Blanket Ideas for Winter', blanketHtml(14)))).toEqual({ value: '15', source: 'title' });
  });
});

// ── Angle plan and validation ────────────────────────────────────────────────

const OTHER: PinterestAngle[] = ['curiosity', 'discovery', 'problem-solution'];

test.describe('Angle plan: at least half Listicle / Article Promise', () => {
  for (const [pins, numbered] of [[1, 1], [3, 2], [4, 2], [5, 3], [7, 4], [10, 5]] as const) {
    test(`${pins} Pins → ${numbered} numbered`, () => {
      const plan = buildListicleAnglePlan(pins);
      expect(plan).toHaveLength(pins);
      expect(numberedPinCount(pins)).toBe(numbered);
      expect(plan.filter(isNumberedAngle)).toHaveLength(numbered);
      expect(plan.filter(isNumberedAngle).length / pins).toBeGreaterThanOrEqual(0.5);
      expect(plan.filter((angle) => !isNumberedAngle(angle)).every((angle) => OTHER.includes(angle))).toBe(true);
      if (pins < PINTEREST_ANGLES.length) expect(new Set(plan).size).toBe(pins);
    });
  }
});

interface TestPin {
  angle: PinterestAngle;
  title: string;
  description: string;
  image_prompt: string;
}

const NUMBERED_TITLES = [
  '15 Cozy Crochet Blanket Ideas for Winter Evenings',
  'All 15 Crochet Blankets to Save for the Cold Season',
  'Your Next Winter Project: 15 Crochet Blanket Ideas',
  'Save These 15 Cozy Crochet Blankets for Winter',
];
const OTHER_TITLES = [
  'The Texture Detail That Makes a Blanket Feel Cozy',
  'A Fresh Take on Cream Crochet Blankets',
  'Cold Sofa Evenings? Start With a Crochet Blanket',
];

function plannedPins(count: number, number = '15'): TestPin[] {
  let numbered = 0;
  let other = 0;
  return buildListicleAnglePlan(count).map((angle, index) => ({
    angle,
    title: isNumberedAngle(angle) ? NUMBERED_TITLES[numbered++].replace(/15/g, number) : OTHER_TITLES[other++ % OTHER_TITLES.length],
    description: `Winter crochet blanket inspiration, variant ${'ABCDEFGHIJ'[index]}: the article shows each blanket and its texture. See which one fits your sofa.`,
    image_prompt: `A cream crochet blanket folded on a plain white surface, variant ${index}, soft natural light, eye-level, photorealistic.`,
  }));
}

const EVIDENCE = `15 Cozy Crochet Blanket Ideas for Winter\n${FIFTEEN.plainText}`;

test.describe('Listicle validation', () => {
  test('a faithful batch passes the listicle plan and every existing safeguard', () => {
    for (const count of [3, 5, 7]) {
      const pins = plannedPins(count);
      const plan = buildListicleAnglePlan(count);
      expect(validateListicleBatch(pins, plan, '15', EVIDENCE)).toEqual([]);
      expect(validatePinterestStrategyBatch(pins, count, EVIDENCE, { enforceBalancedAngles: false })).toEqual([]);
    }
  });

  test('numbered titles are tied to Listicle / Article Promise; the other Pins use Curiosity, Discovery or Problem → Solution', () => {
    const pins = plannedPins(7);
    pins.forEach((pin) => expect(/15/.test(pin.title)).toBe(isNumberedAngle(pin.angle)));
    expect(pins.filter((pin) => !isNumberedAngle(pin.angle)).map((pin) => pin.angle)).toEqual(['curiosity', 'discovery', 'problem-solution']);
  });

  test('a numbered angle without the number → LIST_NUMBER_MISSING on that Pin', () => {
    const pins = plannedPins(3);
    pins[2] = { ...pins[2], title: 'Cozy Crochet Blanket Ideas for Winter Evenings' };
    const issues = validateListicleBatch(pins, buildListicleAnglePlan(3), '15', EVIDENCE);
    expect(issues.map((issue) => [issue.reason, issue.pinIndex, issue.field])).toEqual([['LIST_NUMBER_MISSING', 2, 'title']]);
    expect(buildStrategySafeguardError(issues).issues[0].message).toBe("Pin 3's title must include the article's number (15).");
  });

  test('the number of Pins requested is never the count: "3" instead of 15 is refused on both numbered Pins', () => {
    const pins = plannedPins(3, '3');
    const listicle = validateListicleBatch(pins, buildListicleAnglePlan(3), '15', EVIDENCE);
    expect(listicle.filter((issue) => issue.reason === 'LIST_NUMBER_MISSING').map((issue) => issue.pinIndex)).toEqual([0, 2]);
    // "3" is in the article (heading "3. Ripple Blanket"): the invented-number check alone would let it through.
    expect(validatePinterestStrategyBatch(pins, 3, EVIDENCE, { enforceBalancedAngles: false })).toEqual([]);
    // A count found nowhere in the article is refused by both checks.
    const invented = plannedPins(3, '40');
    expect(validateListicleBatch(invented, buildListicleAnglePlan(3), '15', EVIDENCE).filter((issue) => issue.reason === 'LIST_NUMBER_MISSING')).toHaveLength(2);
    expect(validatePinterestStrategyBatch(invented, 3, EVIDENCE, { enforceBalancedAngles: false }).filter((issue) => issue.reason === 'UNSUPPORTED_NUMBER')).toHaveLength(2);
  });

  test('"best", "viral", "most popular" and "easy" are refused unless the article says them', () => {
    const pins = plannedPins(3);
    for (const title of ['15 Best Crochet Blanket Ideas for Winter', '15 Viral Crochet Blankets for Winter', 'The 15 Most Popular Crochet Blankets']) {
      const issues = validateListicleBatch([{ ...pins[0], title }, pins[1], pins[2]], buildListicleAnglePlan(3), '15', EVIDENCE);
      expect(issues.map((issue) => issue.reason), title).toEqual(['UNSUPPORTED_CLAIM']);
    }
    const easy = validatePinterestStrategyBatch([{ ...pins[0], title: '15 Easy Crochet Blanket Ideas' }, pins[1], pins[2]], 3, EVIDENCE, { enforceBalancedAngles: false });
    expect(easy.map((issue) => issue.reason)).toContain('UNSUPPORTED_CLAIM');
    // A claim the article makes is allowed.
    expect(validateListicleBatch([{ ...pins[0], title: '15 Best Crochet Blanket Ideas' }, pins[1], pins[2]], buildListicleAnglePlan(3), '15', `${EVIDENCE}\nOur best blankets.`)).toEqual([]);
  });

  test('the plan counts replace the even balance: a batch off the plan → LISTICLE_ANGLE_PLAN', () => {
    const pins = plannedPins(3);
    pins[1] = { ...pins[1], angle: 'listicle', title: 'Every One of the 15 Crochet Blankets in Cream' };
    const issues = validateListicleBatch(pins, buildListicleAnglePlan(3), '15', EVIDENCE);
    expect(issues.map((issue) => issue.reason)).toEqual(['LISTICLE_ANGLE_PLAN']);
    expect(buildStrategySafeguardError(issues).issues[0].message).toContain('numbered-list plan');
  });

  test('the invented-number, duplicate-title and claim checks still run on a numbered batch', () => {
    const pins = plannedPins(3);
    pins[1] = { ...pins[1], title: pins[0].title };
    const issues = validatePinterestStrategyBatch(pins, 3, EVIDENCE, { enforceBalancedAngles: false });
    expect(issues.map((issue) => issue.reason)).toContain('DUPLICATE_TITLE');
  });
});

test.describe('Prompt', () => {
  const base = {
    keyword: 'crochet blankets',
    language: 'en' as const,
    pinsRequested: 3,
    niche: 'Crochet',
    textOverlayMode: 'never' as const,
    generationMode: 'photo-only' as const,
  };

  test('a numbered article: exact angle order, the article count, no hype words', () => {
    const { user } = buildPinterestPinsPrompt({ ...base, listicle: { number: '15', anglePlan: buildListicleAnglePlan(3) } });
    expect(user).toContain('pin 1 = "listicle", pin 2 = "curiosity", pin 3 = "article-promise"');
    expect(user).toContain('The source article confirms an exact count: 15.');
    expect(user).toContain('never the number of pins in this batch');
    expect(user).toContain('"best", "viral", "most popular", "easy"');
  });

  test('without a number the prompt is exactly the former one', () => {
    const { user, system } = buildPinterestPinsPrompt(base);
    expect(user).not.toContain('The source article confirms an exact count');
    expect(user).toContain('pin 1 = "curiosity", pin 2 = "problem-solution", pin 3 = "listicle"');
    expect(buildPinterestPinsPrompt({ ...base, listicle: undefined })).toEqual({ user, system });
  });
});

// ── Article images ────────────────────────────────────────────────────────

test.describe('Article image of each numbered Pin', () => {
  test('the section photo first, the featured image as fallback, a reused photo gets another crop', () => {
    const context = article('15 Cozy Crochet Blanket Ideas for Winter', blanketHtml(15, (n) => n !== 2));
    const [s1, s2] = context.sections.filter((section) => section.kind === 'subject').map((section) => section.id);
    const sources = planListicleImageSources(context, [s1, s2, s2, s1], HOSTS);
    expect(sources.map((source) => [source?.origin, source?.imageUrl, source?.crop])).toEqual([
      ['section', imageUrl(1), 0],
      ['featured', FEATURED, 0],
      ['featured', FEATURED, 1],
      ['section', imageUrl(1), 1],
    ]);
    expect(sources[0]).toMatchObject({ sectionId: s1, fallbackUrl: FEATURED, imageKey: `url:crochet.example.test/wp-content/uploads/blanket-1.jpg` });
    expect(sources[1]).toMatchObject({ sectionId: null, fallbackUrl: null });
  });

  test('photos outside the connected site or OmniFlow storage, SVG files or no photo at all: no source', () => {
    const foreign = article('15 Cozy Crochet Blanket Ideas', blanketHtml(3).replace(/https:\/\/crochet\.example\.test/g, 'https://cdn.other.test'), 'en', null);
    expect(planListicleImageSources(foreign, foreign.sections.map((section) => section.id), HOSTS).every((source) => source === null)).toBe(true);
    const svg = article('15 Cozy Crochet Blanket Ideas', blanketHtml(3).replace(/\.jpg/g, '.svg'), 'en', null);
    expect(planListicleImageSources(svg, svg.sections.map((section) => section.id), HOSTS).every((source) => source === null)).toBe(true);
    const none = article('15 Cozy Crochet Blanket Ideas', blanketHtml(3, () => false), 'en', null);
    expect(planListicleImageSources(none, none.sections.map((section) => section.id), HOSTS).every((source) => source === null)).toBe(true);
  });
});

function listicleMetadata(context = FIFTEEN, pinTitle = NUMBERED_TITLES[0], options: { hasDestination?: boolean; crop?: number } = {}): ListicleMetadata {
  const sectionId = context.sections.find((section) => section.kind === 'subject')!.id;
  const [source] = planListicleImageSources(context, [sectionId], HOSTS);
  const metadata = buildListicleComposerMetadata({
    pinTitle,
    number: detectListicleNumber(context)!.value,
    source: { ...source!, crop: options.crop ?? source!.crop },
    context,
    sectionId,
    language: context.language,
    hasDestination: options.hasDestination ?? false,
    ctaIndex: 0,
  });
  expect(metadata).not.toBeNull();
  return metadata!;
}

test.describe('Composer contract: the visible text comes from the validated title and the article', () => {
  test('number from the article, words from the Pin title, photo from the article; read back from pins.image_analysis', () => {
    const metadata = listicleMetadata();
    expect(metadata.text).toEqual({ title: NUMBERED_TITLES[0], number: '15', cta: null });
    expect(verifyComposerText(metadata, FIFTEEN, { pinTitle: NUMBERED_TITLES[0] })).toEqual([]);
    const stored = attachComposerMetadata(JSON.stringify({ _pinterestStrategy: { angle: 'listicle' } }), metadata);
    expect(readComposerMetadata(stored)).toEqual(metadata);
    expect(JSON.parse(stored)._pinterestStrategy).toEqual({ angle: 'listicle' });
    expect(readPinVisualFormat(stored)).toMatchObject({ label: 'Numbered list (article photo)', composed: true, imageCalls: 0 });
    expect(composerImageCallCount(metadata)).toBe(0);
  });

  test('a long title is shortened at a separator only while it keeps the number', () => {
    const title = '15 Cozy Crochet Blanket Ideas: Textures, Stitches and Colors for Every Sofa in Winter';
    expect(listicleMetadata(FIFTEEN, title).text.title).toBe('15 Cozy Crochet Blanket Ideas');
    expect(buildListicleComposerMetadata({ ...baseInput(), pinTitle: 'Cozy Crochet Blanket Ideas' })).toBeNull();
  });

  test('an invented number, a text not from the Pin title, a CTA outside the fixed phrases or a foreign photo is rejected', () => {
    const metadata = listicleMetadata();
    const codes = (value: ListicleMetadata, pinTitle = NUMBERED_TITLES[0]) => verifyComposerText(value, FIFTEEN, { pinTitle }).map((issue) => issue.field);
    expect(codes({ ...metadata, text: { ...metadata.text, number: '16', title: '16 Cozy Crochet Blanket Ideas' } }, '16 Cozy Crochet Blanket Ideas')).toEqual(['number', 'title.numbers']);
    expect(codes({ ...metadata, text: { ...metadata.text, title: '15 Viral Blankets Everyone Loves' } })).toEqual(['title']);
    expect(verifyComposerText(metadata, FIFTEEN).map((issue) => issue.field)).toEqual(['title']);
    expect(codes({ ...metadata, text: { ...metadata.text, cta: 'Buy now' } })).toEqual(['cta']);
    expect(codes({ ...metadata, source: { ...metadata.source, imageUrl: `${SITE}/wp-content/uploads/not-in-article.jpg` } })).toEqual(['source.imageUrl']);
  });
});

function baseInput() {
  const sectionId = FIFTEEN.sections.find((section) => section.kind === 'subject')!.id;
  return {
    pinTitle: NUMBERED_TITLES[0],
    number: '15',
    source: planListicleImageSources(FIFTEEN, [sectionId], HOSTS)[0]!,
    context: FIFTEEN,
    sectionId,
    language: 'en',
    hasDestination: false,
    ctaIndex: 0,
  };
}

// ── Rendering ────────────────────────────────────────────────────────────

let photoCache: Buffer | null = null;
/** An article-like landscape JPEG (WordPress upload): stripes so every crop has different pixels. */
async function articlePhoto(): Promise<Buffer> {
  photoCache ??= await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#c9b79c' } })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 100}" y="0" width="50" height="800" fill="#${(0x405060 + i * 0x0a0806).toString(16)}"/>`).join('')}<circle cx="600" cy="400" r="220" fill="#f3efe6"/></svg>`
        ),
      },
    ])
    .jpeg()
    .toBuffer();
  return photoCache;
}

test.describe('Rendering — 1000×1500, readable, no text from an image model', () => {
  test('palette contrast of the numbered panel is at least 4.5:1', () => {
    expect(contrastRatio(COMPOSER_PALETTE.ink, COMPOSER_PALETTE.panel)).toBeGreaterThanOrEqual(COMPOSER_MIN_CONTRAST);
    expect(contrastRatio(COMPOSER_PALETTE.accent, COMPOSER_PALETTE.panel)).toBeGreaterThanOrEqual(COMPOSER_MIN_CONTRAST);
    expect(contrastRatio(COMPOSER_PALETTE.onAccent, COMPOSER_PALETTE.accent)).toBeGreaterThanOrEqual(COMPOSER_MIN_CONTRAST);
  });

  test('EN / DE / FR / ES titles (accents, ß, a long German compound) render 1000×1500 JPEG within the margins', async () => {
    const titles: Array<[WordPressArticleContext, string]> = [
      [FIFTEEN, NUMBERED_TITLES[0]],
      [article('18 gemütliche Häkeldecken-Ideen für den Winter', blanketHtml(18), 'de'), '18 gemütliche Häkeldecken-Ideen: Wollweiße Kuscheldeckenstrickmusterübersicht für große Sofas'],
      [article('15 idées de couvertures au crochet pour l’hiver', blanketHtml(15), 'fr'), 'Nos 15 idées de couvertures au crochet pour l’hiver, douces et chaleureuses'],
      [article('15 ideas de mantas de ganchillo para el invierno', blanketHtml(15), 'es'), '15 ideas de mantas de ganchillo para el invierno en el sofá'],
    ];
    for (const [context, title] of titles) {
      for (const hasDestination of [false, true]) {
        const metadata = listicleMetadata(context, title, { hasDestination });
        const { optimized, composed } = await composePinImage({ photo: await articlePhoto(), metadata, hasDestination });
        expect(await sharp(optimized.buffer).metadata(), title).toMatchObject({ format: 'jpeg', width: 1000, height: 1500 });
        expect(composed.minContrast).toBeGreaterThanOrEqual(COMPOSER_MIN_CONTRAST);
        expect(metadata.text.cta === null).toBe(!hasDestination);
      }
    }
  });

  test('the same article photo with another crop variant gives a different composition (panel top / bottom, other pixels)', async () => {
    const photo = await articlePhoto();
    const metadata = listicleMetadata();
    const renders = await Promise.all([0, 1, 2, 3].map((cropVariant) => renderComposedPin(photo, metadata, [], { cropVariant })));
    expect(renders.map((render) => render.heroPlacement)).toEqual(['bottom', 'top', 'bottom', 'top']);
    const hashes = new Set(renders.map((render) => render.buffer.toString('base64')));
    expect(hashes.size).toBe(4);
    // The source buffer is only read.
    expect(photo.equals(await articlePhoto())).toBe(true);
  });

  test('a title that cannot fit fails — never a partial or overflowing Pin', async () => {
    const metadata = listicleMetadata();
    const huge = { ...metadata, text: { ...metadata.text, title: `15 ${'Kuscheldeckenhäkelmusterübersichtsseite '.repeat(4).trim()}` } };
    await expect(renderComposedPin(await articlePhoto(), huge)).rejects.toThrow(/does not fit|too much/);
  });
});

// ── Download ─────────────────────────────────────────────────────────────

function imageResponse(body: Buffer, type = 'image/jpeg', status = 200): Response {
  return new Response(new Uint8Array(body), { status, headers: { 'content-type': type, 'content-length': String(body.length) } });
}

test.describe('Reading the article photo: GET only, allowed hosts, no redirect', () => {
  test('allowed host → one GET without redirect; other hosts, IPs and localhost are never fetched', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return imageResponse(await articlePhoto());
    };
    const buffer = await downloadArticleImage(imageUrl(1), HOSTS, fetchFn);
    expect(buffer.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].init).toMatchObject({ method: 'GET', redirect: 'error' });
    for (const url of ['https://evil.test/a.jpg', 'http://127.0.0.1/a.jpg', 'http://localhost/a.jpg', 'file:///etc/passwd']) {
      await expect(downloadArticleImage(url, [...HOSTS, '127.0.0.1', 'localhost'], fetchFn)).rejects.toThrow(ArticleImageError);
    }
    expect(calls).toHaveLength(1);
  });

  test('not an image, an SVG, an HTTP error or a too-small image is refused', async () => {
    const small = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ccc' } }).jpeg().toBuffer();
    for (const response of [
      imageResponse(Buffer.from('<html></html>'), 'text/html'),
      imageResponse(Buffer.from('<svg/>'), 'image/svg+xml'),
      imageResponse(await articlePhoto(), 'image/jpeg', 404),
      imageResponse(small),
    ]) {
      await expect(downloadArticleImage(imageUrl(1), HOSTS, async () => response)).rejects.toThrow(ArticleImageError);
    }
  });

  test('section photo unreadable → featured image with a warning; both unreadable → error', async () => {
    const source = listicleMetadata().source;
    const loaded = await loadArticlePhoto(source, HOSTS, async (url) => (url === FEATURED ? imageResponse(await articlePhoto()) : imageResponse(Buffer.alloc(0), 'image/jpeg', 404)));
    expect(loaded).toMatchObject({ url: FEATURED, warnings: ['SOURCE_FALLBACK_FEATURED'] });
    await expect(loadArticlePhoto(source, HOSTS, async () => imageResponse(Buffer.alloc(0), 'image/jpeg', 500))).rejects.toThrow(ArticleImageError);
  });
});

// ── POST /api/pinterest/generate ───────────────────────────────────────────

interface RecordedEvent {
  table: string;
  op: 'insert' | 'update';
  row: unknown;
}

interface GenerateRun {
  status: number;
  body: { data: unknown; error: { code: string; issues?: Array<{ code: string }> } | null };
  events: RecordedEvent[];
  prompts: string[];
  /** Everything the route logged (console.log / warn / error), one string per call. */
  logs: string[];
}

function wordpressPost(title: string, count: number) {
  return {
    id: 3001,
    title,
    date: '2026-10-20T00:00:00',
    status: 'publish',
    categories: ['Crochet Blankets'],
    categoryIds: [],
    featuredImage: { url: FEATURED, alt: 'Crochet blankets', caption: '' },
    excerpt: 'Crochet blankets for winter.',
    contentHtml: count > 0 ? blanketHtml(count) : NO_NUMBER_HTML,
    tags: [],
    link: `${SITE}/blankets/`,
  };
}
const NO_NUMBER_HTML = `<p>Crochet blankets for cozy evenings.</p><h2>Moss stitch blanket</h2><p>A moss stitch crochet blanket in cream cotton yarn with a soft texture for the sofa.</p><h2>Waffle blanket</h2><p>A waffle crochet blanket in cream cotton yarn with a deep texture for the bed.</p><h2>Ripple blanket</h2><p>A ripple crochet blanket in cream cotton yarn that drapes over the sofa.</p>`;

// Up to 15 Pins: 8 numbered and 7 other titles, all distinct enough for the duplicate-title check.
const MORE_NUMBERED = [
  'From Moss Stitch to Popcorn: 15 Blankets in Cream',
  'Pick One of 15 Textured Blankets for the Sofa',
  '15 Blanket Patterns Worth a Spot on Your Couch',
  'Stitch Textures Across 15 Crochet Throws',
];
const MORE_OTHER = [
  'Blanket Ideas Worth Saving for Winter',
  'A Practical Guide to Cozy Crochet Blankets',
  'Why Cream Yarn Makes a Blanket Look Calmer',
  'Too Cold on the Sofa? Try a Textured Throw',
];
const CAMERA = ['overhead', 'eye-level', '45-degree', 'close-up', 'wide shot'];
const BACKDROP = ['white', 'cream linen', 'light gray'];

/** The model answer: titles per angle (numbered ones carry `number`), each on its planned section. */
function modelAnswer(post: ReturnType<typeof wordpressPost>, pinsRequested: number, angles: PinterestAngle[], number: string | null): string {
  const context = buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html: post.contentHtml, title: post.title, language: 'en' });
  const sections = planArticlePinSections(context, pinsRequested);
  let numbered = 0;
  let other = 0;
  return JSON.stringify({
    pins: angles.map((angle, index) => ({
      angle,
      title: number && isNumberedAngle(angle)
        ? [...NUMBERED_TITLES, ...MORE_NUMBERED][numbered++].replace(/15/g, number)
        : [...OTHER_TITLES, ...MORE_OTHER][other++],
      description: `Winter crochet blanket inspiration around the ${BLANKETS[index].toLowerCase()} idea, variant ${'ABCDEFGHIJKLMNOPQRSTU'[index]}: each blanket and its texture. See which one fits your sofa.`,
      keywords: 'crochet blanket, winter crochet, cozy blanket',
      board: 'Crochet Blankets',
      image_prompt: `A cream crochet blanket folded on a plain ${BACKDROP[Math.floor(index / CAMERA.length) % BACKDROP.length]} surface, soft natural light, ${CAMERA[index % CAMERA.length]} view, photorealistic.`,
      sourceSectionId: sections[index],
      visualFormat: 'photo',
    })),
  });
}

/** `answer`: the same text for every AI call, or one text per call in order (a further call throws). */
async function runGenerate(post: ReturnType<typeof wordpressPost> | null, body: Record<string, unknown>, answer: string | string[]): Promise<GenerateRun> {
  const answers = Array.isArray(answer) ? [...answer] : null;
  const run: GenerateRun = { status: 0, body: { data: null, error: null }, events: [], prompts: [], logs: [] };
  const project = { id: PROJECT_ID, description: null, niche: 'Crochet', user_id: 'user-1', default_language: 'en' };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }) },
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        insert: (row: unknown) => {
          run.events.push({ table, op: 'insert', row });
          return query;
        },
        update: (row: unknown) => {
          run.events.push({ table, op: 'update', row });
          return query;
        },
        single: async () => {
          if (table === 'projects') return { data: project, error: null };
          if (table === 'generations') return { data: { id: 'generation-1' }, error: null };
          return { data: null, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return query;
    },
  };
  const fakes: Record<string, unknown> = {
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/rate-limit': { checkRateLimit: async () => ({ allowed: true }), rateLimitErrorResponse: () => { throw new Error('rate limited'); } },
    '@/lib/ai/engine': {
      generateText: async (params: { messages: Array<{ content: string }> }) => {
        run.prompts.push(params.messages.map((message) => message.content).join('\n'));
        if (!answers) return answer as string;
        const next = answers.shift();
        if (next === undefined) throw new Error('unexpected AI call');
        return next;
      },
      analyzeImage: async () => {
        throw new Error('Vision unavailable in this test');
      },
      generateImage: async () => {
        throw new Error('Image generation must not be called');
      },
      resolveImageModel: () => {
        throw new Error('Image routing must not be called');
      },
    },
    '@/lib/queries/boards': {
      findOrCreateBoardIds: async (_client: unknown, _project: string, _user: string, names: string[]) => new Map(names.map((name) => [name.trim(), 'board-1'])),
    },
    '@/lib/queries/niche-context': { listContentStreamNamesForBoard: async () => [], listContentStreamNamesForCategory: async () => [] },
    '@/lib/queries/niche-settings': { getProjectNicheSettings: async () => null },
    '@/lib/social/pinterest-from-wordpress-post': {
      ...wordpressPostSource,
      loadWordPressPostPinterestSource: async () => ({
        ...wordpressPostSource.buildWordPressPostPinterestSource(post!, { id: SITE_ID, project_id: PROJECT_ID, site_url: SITE }, { niche: 'Crochet', description: null, default_language: 'en' }),
        contentStreams: [],
        nicheSettings: null,
      }),
    },
  };
  await withFakes(fakes, '@/app/api/pinterest/generate/route', async (route) => {
    const response = await route.POST(new Request('http://localhost/api/pinterest/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    run.status = response.status;
    run.body = (await response.json()) as GenerateRun['body'];
  }, undefined, run.logs);
  return run;
}

async function withFakes(
  fakes: Record<string, unknown>,
  routeSpecifier: string,
  run: (route: { POST: (request: Request) => Promise<Response> }) => Promise<void>,
  fetchFn?: typeof fetch,
  logs?: string[]
): Promise<void> {
  const routeKey = require.resolve(routeSpecifier);
  const keys = [...Object.keys(fakes).map((specifier) => require.resolve(specifier)), routeKey];
  const originals = new Map<string, NodeJS.Module | undefined>(keys.map((key) => [key, require.cache[key]]));
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  try {
    for (const [specifier, exports] of Object.entries(fakes)) {
      const filename = require.resolve(specifier);
      require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [], path: '', parent: null, isPreloading: false, require } as unknown as NodeJS.Module;
    }
    delete require.cache[routeKey];
    globalThis.fetch = fetchFn ?? ((async () => {
      throw new Error('No network call is allowed in this test');
    }) as typeof fetch);
    const sink = (...args: unknown[]) => {
      logs?.push(args.map((arg) => (typeof arg === 'string' ? arg : arg instanceof Error ? arg.message : JSON.stringify(arg))).join(' '));
    };
    console.log = sink;
    console.warn = sink;
    console.error = sink;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await run(require(routeSpecifier) as { POST: (request: Request) => Promise<Response> });
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    globalThis.fetch = originalFetch;
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }
}

const articleBody = (pinsRequested: number) => ({
  projectId: PROJECT_ID,
  keyword: 'crochet blankets',
  language: 'en',
  pinsRequested,
  generationMode: 'photo-only',
  wordpressPost: { siteId: SITE_ID, postId: 3001 },
});

const savedPins = (run: GenerateRun) => (run.events.find((event) => event.table === 'pins' && event.op === 'insert')?.row ?? []) as Array<Record<string, unknown>>;
const composerOf = (row: Record<string, unknown>) => readComposerMetadata(row.image_analysis as string);

test.describe('POST /api/pinterest/generate — numbered article', () => {
  for (const [count, pins, numbered] of [[15, 3, 2], [18, 7, 4], [15, 5, 3], [15, 15, 8]] as const) {
    test(`${count} ideas, ${pins} Pins → ${numbered} numbered titles on article photos; link, board and section unchanged`, async () => {
      const post = wordpressPost(`${count} Cozy Crochet Blanket Ideas for Winter`, count);
      const plan = buildListicleAnglePlan(pins);
      const run = await runGenerate(post, { ...articleBody(pins), board: 'Crochet Blankets', boardSection: 'Winter' }, modelAnswer(post, pins, plan, String(count)));
      expect(run.status, JSON.stringify(run.body.error)).toBe(201);
      expect(run.prompts).toHaveLength(1);
      expect(run.prompts[0]).toContain(`The source article confirms an exact count: ${count}.`);
      const rows = savedPins(run);
      expect(rows).toHaveLength(pins);
      // One single insert of the whole batch, no duplicate title.
      expect(run.events.filter((event) => event.table === 'pins')).toHaveLength(1);
      expect(new Set(rows.map((row) => row.title)).size).toBe(pins);
      const numberedRows = rows.filter((row) => new RegExp(`\\b${count}\\b`).test(row.title as string));
      expect(numberedRows.length).toBeGreaterThanOrEqual(numbered);
      expect(numberedRows.length / pins).toBeGreaterThanOrEqual(0.5);
      const articleImages = new Set([FEATURED, ...Array.from({ length: count }, (_, i) => imageUrl(i + 1))]);
      rows.forEach((row) => {
        const angle = JSON.parse(row.image_analysis as string)._pinterestStrategy.angle as PinterestAngle;
        const composer = composerOf(row);
        // Destination, board, section: exactly as without this task.
        expect(row.link_url).toBe(`${SITE}/blankets/`);
        expect(row.board).toBe('Crochet Blankets');
        expect(row.board_section).toBe('Winter');
        expect(row).not.toHaveProperty('publish_date');
        if (isNumberedAngle(angle)) {
          expect(composer?.templateType).toBe('listicle_article_image');
          const listicle = composer as ListicleMetadata;
          expect(row.visual_format).toBe('photo-only');
          expect(articleImages.has(listicle.source.imageUrl)).toBe(true);
          expect(listicle.text.number).toBe(String(count));
          expect(row.title as string).toContain(listicle.text.title);
          expect(listicle.text.cta).not.toBeNull();
        } else {
          expect(['curiosity', 'discovery', 'problem-solution']).toContain(angle);
          expect(composer).toBeNull();
        }
      });
    });
  }

  test('a numbered Pin without the number → 422 LIST_NUMBER_MISSING, nothing saved', async () => {
    const post = wordpressPost('15 Cozy Crochet Blanket Ideas for Winter', 15);
    const answer = JSON.parse(modelAnswer(post, 3, buildListicleAnglePlan(3), '15'));
    answer.pins[2].title = 'A Practical Guide to Cozy Crochet Blankets';
    const run = await runGenerate(post, articleBody(3), JSON.stringify(answer));
    expect(run.status).toBe(422);
    expect(run.body.error?.issues?.map((issue) => issue.code)).toContain('LIST_NUMBER_MISSING');
    expect(run.events.filter((event) => event.table === 'pins')).toEqual([]);
    expect(run.events.filter((event) => event.table === 'generations' && event.op === 'update').map((event) => (event.row as { status: string }).status)).toEqual(['failed']);
  });

  test('an article without a number: former prompt and balanced angles, no numbered composition', async () => {
    const post = wordpressPost('Cozy Crochet Blankets for Winter', 0);
    const run = await runGenerate(post, articleBody(3), modelAnswer(post, 3, ['curiosity', 'problem-solution', 'listicle'], null));
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
    expect(run.prompts[0]).not.toContain('The source article confirms an exact count');
    expect(run.prompts[0]).toContain('pin 1 = "curiosity", pin 2 = "problem-solution", pin 3 = "listicle"');
    expect(savedPins(run).every((row) => composerOf(row) === null)).toBe(true);
  });

  test('the Keyword flow is unchanged: no number logic, no article image', async () => {
    const answer = JSON.stringify({
      pins: (['curiosity', 'problem-solution', 'listicle'] as const).map((angle, index) => ({
        angle,
        title: ['The Detail Most Summer Spreads Overlook', 'Stuck On What To Serve? Start Here', 'Appetizer Ideas Worth Saving For Later'][index],
        description: 'Short on inspiration for your next gathering? These appetizer ideas keep the table light. Save them for later.',
        keywords: 'summer appetizers, party food',
        board: 'Party Food',
        image_prompt: `A bright summer appetizer spread, variant ${index}, linen tablecloth, warm natural light, photorealistic.`,
        visualFormat: 'photo',
      })),
    });
    const run = await runGenerate(null, { projectId: PROJECT_ID, keyword: '15 summer appetizers', language: 'en', pinsRequested: 3, generationMode: 'photo-only' }, answer);
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
    expect(run.prompts[0]).not.toContain('The source article confirms an exact count');
    expect(savedPins(run).every((row) => composerOf(row) === null)).toBe(true);
  });
});

// ── TASK-FIX-084: production fixes after the 4ec0bc2 / v3.1.0 test ──────────

const AI_INTEGRATED_SETTINGS = {
  creativeFormat: 'hero-pin',
  // The form's default strategy (components/pinterest/pin-form.tsx), unchanged.
  strategy: 'ai-recommends',
  headline: { mode: 'generate' },
  subtitle: { mode: 'none' },
  cta: { mode: 'none' },
  maximumTextLines: 4,
  importance: { headline: 'high', subtitle: 'none', cta: 'none' },
};
/** Subtitle and CTA turned on: both are strictly validated. */
const AI_INTEGRATED_ALL_ON = {
  ...AI_INTEGRATED_SETTINGS,
  subtitle: { mode: 'generate' },
  cta: { mode: 'generate' },
  importance: { headline: 'high', subtitle: 'medium', cta: 'low' },
};
const FIFTEEN_POST = () => wordpressPost('15 Cozy Crochet Blanket Ideas for Winter', 15);
const integratedBody = (pins: number, settings: Record<string, unknown> = AI_INTEGRATED_SETTINGS) => ({
  ...articleBody(pins),
  generationMode: 'ai-integrated',
  aiIntegrated: settings,
});

/** An AI Integrated answer: the given angles, numbered titles carrying `number`, one integratedText per Pin. */
function integratedAnswer(
  post: ReturnType<typeof wordpressPost>,
  angles: PinterestAngle[],
  integratedText: Record<string, unknown> = {},
  number: string | null = '15'
): string {
  const plan = JSON.parse(modelAnswer(post, angles.length, angles, number)) as { pins: Array<Record<string, unknown>> };
  return JSON.stringify({ pins: plan.pins.map((pin) => ({ ...pin, integratedText: { headline: 'Cozy blankets', ...integratedText } })) });
}

const numberedTitles = (run: GenerateRun, number = '15') => savedPins(run).filter((row) => new RegExp(`\\b${number}\\b`).test(row.title as string));

test.describe('TASK-FIX-084 — the requested Pin count is never proof of a number', () => {
  test('15 Pins for an article without a number: a title with "15" → 422 UNSUPPORTED_NUMBER, nothing saved', async () => {
    const post = wordpressPost('Cozy Crochet Blankets for Winter', 0);
    const answer = JSON.parse(modelAnswer(post, 3, ['curiosity', 'problem-solution', 'listicle'], null)) as { pins: Array<Record<string, unknown>> };
    answer.pins[2].title = '15 Cozy Crochet Blanket Ideas for Winter';
    const run = await runGenerate(post, articleBody(15), JSON.stringify(answer));
    expect(run.prompts[0]).not.toContain('The source article confirms an exact count');
    // The prompt still numbers OmniFlow's own plan 1…15 — it is no longer evidence.
    expect(run.prompts[0]).toContain('Pin 15 → sourceSectionId');
    expect(run.status).toBe(422);
    expect(run.body.error?.code).toBe('strategy_safeguard_failed');
    expect(run.body.error?.issues).toEqual([expect.objectContaining({ code: 'UNSUPPORTED_NUMBER', pinIndex: 3, field: 'title' })]);
    expect(run.events.filter((event) => event.table === 'pins')).toEqual([]);
  });

  test('a number the article really gives (a list label, the H1 count) still passes', async () => {
    const post = FIFTEEN_POST();
    const run = await runGenerate(post, articleBody(3), modelAnswer(post, 3, buildListicleAnglePlan(3), '15'));
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
  });

  test('15 Pins on an 18-idea article: titles written with 15 (the Pin count) are refused', () => {
    const issues = validateListicleBatch(plannedPins(3, '15'), buildListicleAnglePlan(3), '18', `18 Cozy Crochet Blanket Ideas\n${FIFTEEN.plainText}`);
    expect(issues.filter((issue) => issue.reason === 'LIST_NUMBER_MISSING')).toHaveLength(2);
  });
});

test.describe('TASK-FIX-084 — AI Integrated "AI recommends" gets the numbered plan', () => {
  for (const [pins, numbered] of [[3, 2], [7, 4], [15, 8]] as const) {
    test(`"15 ideas", ${pins} Pins → at least ${numbered} titles with 15; the others keep the model's angles; one insert, no duplicate`, async () => {
      const post = FIFTEEN_POST();
      const run = await runGenerate(post, integratedBody(pins), integratedAnswer(post, buildListicleAnglePlan(pins)));
      expect(run.status, JSON.stringify(run.body.error)).toBe(201);
      expect(run.prompts[0]).toContain('The source article confirms an exact count: 15.');
      expect(run.prompts[0]).toContain(`At least ${numbered} of the ${pins} pins use the "listicle" or "article-promise" angle`);
      expect(run.prompts[0]).toContain('For the other pins, choose the strongest grounded angle.');
      const rows = savedPins(run);
      expect(rows).toHaveLength(pins);
      expect(numberedTitles(run).length).toBeGreaterThanOrEqual(numbered);
      expect(run.events.filter((event) => event.table === 'pins')).toHaveLength(1);
      expect(new Set(rows.map((row) => row.title)).size).toBe(pins);
      for (const row of rows) {
        const angle = JSON.parse(row.image_analysis as string)._pinterestStrategy.angle as PinterestAngle;
        if (isNumberedAngle(angle)) expect(row.title as string).toMatch(/\b15\b/);
      }
    });
  }

  test('AI recommends: the numbered Pins may sit anywhere; the other angles are free (no even balance)', async () => {
    const post = FIFTEEN_POST();
    const angles: PinterestAngle[] = ['article-promise', 'listicle', 'curiosity', 'curiosity', 'listicle', 'article-promise', 'discovery'];
    const run = await runGenerate(post, integratedBody(7), integratedAnswer(post, angles));
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
    expect(numberedTitles(run)).toHaveLength(4);
  });

  test('AI recommends: fewer than half numbered (the production run) → 422 LISTICLE_ANGLE_PLAN, nothing saved', async () => {
    const post = FIFTEEN_POST();
    const run = await runGenerate(post, integratedBody(3), integratedAnswer(post, ['listicle', 'curiosity', 'discovery']));
    expect(run.status).toBe(422);
    expect(run.body.error?.issues?.map((issue) => issue.code)).toEqual(['LISTICLE_ANGLE_PLAN']);
    expect(run.events.filter((event) => event.table === 'pins')).toEqual([]);
  });

  test('Manual stays the user\'s explicit choice: no numbered plan', async () => {
    const post = FIFTEEN_POST();
    const run = await runGenerate(post, integratedBody(3, { ...AI_INTEGRATED_SETTINGS, strategy: 'manual', manualAngle: 'curiosity' }), integratedAnswer(post, ['curiosity', 'curiosity', 'curiosity'], {}, null));
    expect(run.prompts[0]).not.toContain('The source article confirms an exact count');
    expect(run.prompts[0]).toContain('Use the "curiosity" angle for every pin.');
  });

  test('Balanced keeps the exact plan', async () => {
    const post = FIFTEEN_POST();
    const run = await runGenerate(post, integratedBody(3, { ...AI_INTEGRATED_SETTINGS, strategy: 'balanced' }), integratedAnswer(post, buildListicleAnglePlan(3)));
    expect(run.prompts[0]).toContain('pin 1 = "listicle", pin 2 = "curiosity", pin 3 = "article-promise"');
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
  });

  test('an article without a number: AI recommends is unchanged', async () => {
    const post = wordpressPost('Cozy Crochet Blankets for Winter', 0);
    const run = await runGenerate(post, integratedBody(3), integratedAnswer(post, ['curiosity', 'discovery', 'listicle'], {}, null));
    expect(run.prompts[0]).not.toContain('The source article confirms an exact count');
    expect(run.prompts[0]).toContain('Choose the strongest grounded angle for each pin');
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
  });
});

test.describe('TASK-FIX-084 — integratedText: disabled elements dropped, enabled ones strict', () => {
  const plan = () => buildListicleAnglePlan(3);

  test('subtitle / cta outside integratedText are ignored', async () => {
    const post = FIFTEEN_POST();
    const outside = JSON.parse(integratedAnswer(post, plan())) as { pins: Array<Record<string, unknown>> };
    outside.pins.forEach((pin) => Object.assign(pin, { subtitle: 'Soft and warm', cta: 'Save this pin' }));
    expect((await runGenerate(post, integratedBody(3), JSON.stringify(outside))).status).toBe(201);
  });

  for (const [name, value] of [['null', null], ['an empty string', ''], ['"None"', 'None'], ['a text over the limit', 'x'.repeat(200)]] as const) {
    test(`a disabled subtitle and cta written as ${name} are dropped, not rejected`, async () => {
      const post = FIFTEEN_POST();
      const run = await runGenerate(post, integratedBody(3), integratedAnswer(post, plan(), { subtitle: value, cta: value }));
      expect(run.status, JSON.stringify(run.body.error)).toBe(201);
      for (const row of savedPins(run)) {
        const integrated = JSON.parse(row.image_analysis as string)._pinterestAiIntegrated;
        // Numbered Pins are composed by OmniFlow instead; the others keep the AI Integrated contract.
        if (integrated) expect(integrated.text).toMatchObject({ subtitle: null, cta: null });
      }
    });
  }

  for (const [name, text, field, code] of [
    ['an enabled cta = null', { cta: null }, 'pins.0.integratedText.cta', 'invalid_type'],
    ['an enabled cta = ""', { cta: '' }, 'pins.0.integratedText.cta', 'too_small'],
    ['an enabled cta over 60 characters', { cta: 'x'.repeat(61) }, 'pins.0.integratedText.cta', 'too_big'],
    ['an enabled subtitle over 120 characters', { subtitle: 'x'.repeat(121), cta: 'Save it' }, 'pins.0.integratedText.subtitle', 'too_big'],
  ] as const) {
    test(`${name} → 422 invalid_pin_plan naming ${field}, nothing saved`, async () => {
      const post = FIFTEEN_POST();
      const run = await runGenerate(post, integratedBody(3, AI_INTEGRATED_ALL_ON), integratedAnswer(post, plan(), { subtitle: 'Soft and warm', ...text }));
      expect(run.status).toBe(422);
      expect(run.body.error).toMatchObject({ code: 'invalid_pin_plan', retryable: true });
      // One issue per Pin (the value is on all three), each with its exact path.
      expect(run.body.error?.issues).toEqual([0, 1, 2].map((i) => expect.objectContaining({ code, field: field.replace('pins.0.', `pins.${i}.`), pinIndex: i + 1 })));
      expect(run.events.filter((event) => event.table === 'pins')).toEqual([]);
      const statuses = run.events.filter((event) => event.table === 'generations' && event.op === 'update').map((event) => (event.row as { status: string }).status);
      expect(statuses).toEqual(['failed']);
    });
  }

  test('an unknown key inside integratedText stays rejected', async () => {
    const post = FIFTEEN_POST();
    const run = await runGenerate(post, integratedBody(3), integratedAnswer(post, plan(), { body: 'extra' }));
    expect(run.status).toBe(422);
    expect(run.body.error?.issues?.[0]).toEqual(expect.objectContaining({ code: 'unrecognized_keys', field: 'pins.0.integratedText' }));
  });
});

test.describe('TASK-FIX-084 — logs carry no model text', () => {
  test('a rejected plan logs kind, step, model, role, length, paths, codes and counts only', async () => {
    const post = FIFTEEN_POST();
    const run = await runGenerate(post, integratedBody(3, AI_INTEGRATED_ALL_ON), integratedAnswer(post, buildListicleAnglePlan(3), { subtitle: 'Soft and warm', cta: '' }));
    const line = run.logs.find((entry) => entry.includes('Pin plan rejected'));
    expect(line).toBeDefined();
    const logged = JSON.parse(line!.slice(line!.indexOf('{'))) as Record<string, unknown>;
    expect(Object.keys(logged).sort()).toEqual(['issueCount', 'issues', 'kind', 'model', 'responseLength', 'role', 'step']);
    expect(logged).toMatchObject({ kind: 'invalid_schema', step: 'generate', role: 'FAST', issueCount: 3 });
    expect((logged.issues as unknown[])[0]).toEqual({ path: 'pins.0.integratedText.cta', code: 'too_small' });
    const all = run.logs.join('\n');
    for (const generated of ['Cozy Crochet Blanket', 'Soft and warm', 'Winter crochet blanket inspiration', 'cream crochet blanket folded']) {
      expect(all).not.toContain(generated);
    }
  });

  test('invalid JSON: the JSON.parse message (which quotes the response) is not logged', async () => {
    const post = FIFTEEN_POST();
    const run = await runGenerate(post, articleBody(3), '{"pins": [ {"title": "Secret model title" ] }');
    expect(run.status).toBe(422);
    expect(run.logs.join('\n')).not.toContain('Secret model title');
  });
});

test('production bundle: the compiled route carries the numbered plan and its safeguard', () => {
  const dir = join(__dirname, '../../.next/server/chunks');
  test.skip(!existsSync(dir), 'No production build — run `npx next build` first');
  const sources = readdirSync(dir).filter((name) => name.endsWith('.js')).map((name) => readFileSync(join(dir, name), 'utf8'));
  expect(sources.some((source) => source.includes('The source article confirms an exact count'))).toBe(true);
  expect(sources.some((source) => source.includes('LIST_NUMBER_MISSING'))).toBe(true);
  expect(sources.some((source) => source.includes('For the other pins, choose the strongest grounded angle.'))).toBe(true);
});

// ── TASK-FIX-085: one targeted repair of near-duplicate titles ─────────────

const DUP_NUMBERED = '15 Cozy Crochet Blanket Ideas for Winter';
const DUP_OTHER = 'Cozy Crochet Blanket Ideas for Winter';

/** The first answer: the faithful plan with every title replaced by (almost) the same one. */
function duplicateAnswer(post: ReturnType<typeof wordpressPost>, angles: PinterestAngle[], number: string | null, integrated = false): string {
  const plan = JSON.parse(modelAnswer(post, angles.length, angles, number)) as { pins: Array<Record<string, unknown>> };
  return JSON.stringify({
    pins: plan.pins.map((pin) => ({
      ...pin,
      title: number && isNumberedAngle(pin.angle as PinterestAngle) ? DUP_NUMBERED.replace('15', number) : DUP_OTHER,
      ...(integrated ? { integratedText: { headline: 'Cozy blankets' } } : {}),
    })),
  });
}

/** The repair answer: the faithful (distinct) titles for every Pin but the first, or `override` per 1-based Pin. */
function repairAnswer(post: ReturnType<typeof wordpressPost>, angles: PinterestAngle[], number: string | null, override: Record<number, string> = {}, extra: Record<string, unknown> = {}): string {
  const faithful = JSON.parse(modelAnswer(post, angles.length, angles, number)) as { pins: Array<{ title: string }> };
  return JSON.stringify({
    titles: faithful.pins.slice(1).map((pin, i) => ({ pinIndex: i + 2, title: override[i + 2] ?? pin.title, ...extra })),
  });
}

function pinsOf(answer: string): Array<Record<string, unknown>> {
  return (JSON.parse(answer) as { pins: Array<Record<string, unknown>> }).pins;
}

test.describe('TASK-FIX-085 — title repair: targets, prompt and answer contract', () => {
  const pins = (count: number) => plannedPins(count).map((pin) => ({ ...pin, title: isNumberedAngle(pin.angle) ? DUP_NUMBERED : DUP_OTHER }));

  test('15 near-identical titles: the later Pin of each pair is rewritten; numbered Pins keep 15; the first is kept', () => {
    const batch = plannedPins(7).concat(plannedPins(7)).concat(plannedPins(1)).map((pin, i) => ({ ...pin, angle: buildListicleAnglePlan(15)[i], title: isNumberedAngle(buildListicleAnglePlan(15)[i]) ? DUP_NUMBERED : DUP_OTHER }));
    const issues = validatePinterestStrategyBatch(batch, 15, EVIDENCE, { enforceBalancedAngles: false }).filter((issue) => issue.reason === 'DUPLICATE_TITLE');
    expect(issues.length).toBeGreaterThan(14);
    const targets = titleRepairTargets(issues, batch, { listicleNumber: '15', focusOf: () => 'focus' })!;
    expect(targets.map((target) => target.pinIndex)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    targets.forEach((target) => expect(target.requiredNumber).toBe(isNumberedAngle(target.angle) ? '15' : null));
  });

  test('another failure in the batch: no title repair (the 422 stays)', () => {
    const batch = pins(3);
    const issues = [...validatePinterestStrategyBatch(batch, 3, EVIDENCE, { enforceBalancedAngles: false }), { code: 'unsupported-claim' as const, message: 'x', reason: 'UNSUPPORTED_NUMBER' as const, pinIndex: 0, field: 'title' as const }];
    expect(titleRepairTargets(issues, batch, { listicleNumber: '15', focusOf: () => '' })).toBeNull();
    expect(titleRepairTargets([], batch, { listicleNumber: '15', focusOf: () => '' })).toBeNull();
  });

  const target = (overrides: Partial<TitleRepairTarget> = {}): TitleRepairTarget => ({
    pinIndex: 2, angle: 'article-promise', title: DUP_NUMBERED, description: 'Winter blankets.', focus: '3. Ripple Blanket', requiredNumber: '15', ...overrides,
  });

  for (const [language, label] of [['en', 'English'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish']] as const) {
    test(`prompt (${language}): language, real count, Pin index and angle, accepted titles, the rules`, () => {
      const { system, user } = buildTitleRepairPrompt([target()], { language: label, sourceTitle: '15 Cozy Crochet Blanket Ideas', listicleNumber: '15', titles: ['Kept title', 'Other kept', DUP_NUMBERED], evidence: '' });
      expect(system).toContain('You change only the titles you are given');
      expect(user).toContain(`Write one new title in ${label}`);
      expect(user).toContain('Pin 3 — angle: article-promise');
      expect(user).toContain('it must contain the exact number 15');
      expect(user).toContain('never the number of Pins in the batch');
      expect(user).toContain('Pin 1: "Kept title"');
      expect(user).not.toContain(`Pin 3: ${JSON.stringify(DUP_NUMBERED)}`);
      for (const rule of ['sequence of 4 words', '"N … Ideas for …"', '"Idea 1"', '"ultimate"', 'at most 100 characters', '{"titles":[{"pinIndex"']) {
        expect(user).toContain(rule);
      }
    });
  }

  test('prompt without a count: never add a number', () => {
    const { user } = buildTitleRepairPrompt([target({ requiredNumber: null })], { language: 'English', sourceTitle: 'Cozy Blankets', listicleNumber: null, titles: [DUP_OTHER], evidence: '' });
    expect(user).toContain('The article states no count: never add a number.');
    expect(user).toContain('Do not add any number.');
  });

  const answer = (entries: unknown) => JSON.stringify({ titles: entries });
  const cases: Array<[string, string, string]> = [
    ['not JSON', 'Here are the titles', 'invalid_json'],
    ['an extra field', answer([{ pinIndex: 3, title: 'All 15 Crochet Blankets to Save', angle: 'listicle' }]), 'invalid_schema'],
    ['an extra top-level field', JSON.stringify({ titles: [{ pinIndex: 3, title: 'All 15 Crochet Blankets to Save' }], note: 'x' }), 'invalid_schema'],
    ['a title over 100 characters', answer([{ pinIndex: 3, title: `15 ${'x'.repeat(100)}` }]), 'invalid_schema'],
    ['another Pin', answer([{ pinIndex: 4, title: 'All 15 Crochet Blankets to Save' }]), 'wrong_pins'],
    ['the same Pin twice', answer([{ pinIndex: 3, title: 'All 15 Crochet Blankets' }, { pinIndex: 3, title: 'Pick 15 Blankets' }]), 'wrong_pins'],
    ['the number 15 removed', answer([{ pinIndex: 3, title: 'Crochet Blankets to Save for the Cold Season' }]), 'number_missing'],
    ['an artificial "Idea 2"', answer([{ pinIndex: 3, title: '15 Crochet Blankets: Idea 2' }]), 'artificial_numbering'],
    ['"viral"', answer([{ pinIndex: 3, title: '15 Viral Crochet Blankets for the Sofa' }]), 'unsupported_claim'],
    ['"best"', answer([{ pinIndex: 3, title: 'The 15 Best Crochet Blankets for the Sofa' }]), 'unsupported_claim'],
    ['"ultimate"', answer([{ pinIndex: 3, title: 'The Ultimate 15 Crochet Blankets' }]), 'unsupported_claim'],
  ];
  for (const [name, raw, reason] of cases) {
    test(`answer with ${name} → refused (${reason})`, () => {
      expect(parseTitleRepair(raw, [target()], { evidence: EVIDENCE })).toEqual({ rejected: reason });
    });
  }

  test('a valid answer: one title per targeted Pin, ```json fence accepted', () => {
    const result = parseTitleRepair('```json\n' + answer([{ pinIndex: 3, title: 'All 15 Crochet Blankets to Save' }]) + '\n```', [target()], { evidence: EVIDENCE });
    expect(result).toEqual({ titles: new Map([[2, 'All 15 Crochet Blankets to Save']]) });
  });
});

test.describe('TASK-FIX-085 — title repair in POST /api/pinterest/generate', () => {
  const post = () => FIFTEEN_POST();

  for (const [strategy, body] of [
    ['balanced', articleBody(15)],
    ['AI recommends', integratedBody(15)],
  ] as const) {
    test(`${strategy}, 15 Pins, near-identical titles → one repair, distinct titles, 15 kept, everything else unchanged, one insert, no image call`, async () => {
      const article = post();
      const plan = buildListicleAnglePlan(15);
      const first = duplicateAnswer(article, plan, '15', strategy === 'AI recommends');
      const run = await runGenerate(article, { ...body, board: 'Crochet Blankets', boardSection: 'Winter' }, [first, repairAnswer(article, plan, '15')]);
      expect(run.status, JSON.stringify(run.body.error)).toBe(201);
      expect(run.prompts).toHaveLength(2);
      expect(run.prompts[1]).toContain('You rewrite Pinterest Pin titles');
      const rows = savedPins(run);
      expect(rows).toHaveLength(15);
      expect(run.events.filter((event) => event.table === 'pins')).toHaveLength(1);
      expect(new Set(rows.map((row) => row.title)).size).toBe(15);
      expect(rows[0].title).toBe(DUP_NUMBERED);
      const original = pinsOf(first);
      rows.forEach((row, i) => {
        const angle = JSON.parse(row.image_analysis as string)._pinterestStrategy.angle as PinterestAngle;
        expect(angle).toBe(original[i].angle);
        if (isNumberedAngle(angle)) expect(row.title as string).toMatch(/\b15\b/);
        expect(row.description).toBe(original[i].description);
        expect(row.keywords).toBe(original[i].keywords);
        expect(row.image_prompt).toBe(original[i].image_prompt);
        expect(JSON.parse(row.image_analysis as string)._articleSource.sectionId).toBe(original[i].sourceSectionId);
        expect(row.link_url).toBe(`${SITE}/blankets/`);
        expect(row.board).toBe('Crochet Blankets');
        expect(row.board_section).toBe('Winter');
        expect(row).not.toHaveProperty('publish_date');
      });
      const repairLog = run.logs.find((line) => line.includes('Title repair:'));
      expect(repairLog).toContain('"pins":14');
      expect(repairLog).toContain('"accepted":true');
    });
  }

  test('Manual: the explicit angle stays; duplicates are still repaired', async () => {
    const article = wordpressPost('Cozy Crochet Blankets for Winter', 0);
    const angles: PinterestAngle[] = ['curiosity', 'curiosity', 'curiosity'];
    const settings = { ...AI_INTEGRATED_SETTINGS, strategy: 'manual', manualAngle: 'curiosity' };
    const run = await runGenerate(article, integratedBody(3, settings), [duplicateAnswer(article, angles, null, true), repairAnswer(article, angles, null)]);
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
    expect(savedPins(run).map((row) => JSON.parse(row.image_analysis as string)._pinterestStrategy.angle)).toEqual(angles);
    expect(new Set(savedPins(run).map((row) => row.title)).size).toBe(3);
  });

  test('Keyword flow in German: repaired too, the prompt asks for titles in Deutsch (same language label as the generation prompt)', async () => {
    const titles = ['Gemütliche Häkeldecken für den Winter', 'Gemütliche Häkeldecken für den Winter', 'Gemütliche Häkeldecken für den Winter'];
    const first = JSON.stringify({
      pins: (['curiosity', 'problem-solution', 'listicle'] as const).map((angle, i) => ({
        angle, title: titles[i],
        description: `Ideen für warme Abende, Variante ${'ABC'[i]}. Speichere den Pin für dein nächstes Projekt.`,
        keywords: 'häkeldecke, winter', board: 'Häkeln',
        image_prompt: `A cream crochet blanket on a sofa, ${CAMERA[i]} view, photorealistic.`, visualFormat: 'photo',
      })),
    });
    const repair = JSON.stringify({ titles: [{ pinIndex: 2, title: 'Zu kalt auf dem Sofa? Eine Häkeldecke hilft' }, { pinIndex: 3, title: 'Häkeldecken-Ideen, die du speichern solltest' }] });
    const run = await runGenerate(null, { projectId: PROJECT_ID, keyword: 'Häkeldecke', language: 'de', pinsRequested: 3, generationMode: 'photo-only' }, [first, repair]);
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
    expect(run.prompts[1]).toContain('Write one new title in Deutsch');
    expect(run.prompts[1]).toContain('The article states no count: never add a number.');
  });

  const failing: Array<[string, (article: ReturnType<typeof wordpressPost>, plan: PinterestAngle[]) => string, string]> = [
    ['removes 15 from a numbered Pin', (a, plan) => repairAnswer(a, plan, '15', { 3: 'Crochet Blankets to Save for the Cold Season' }), 'DUPLICATE_TITLE'],
    ['invents a number', (a, plan) => repairAnswer(a, plan, '15', { 2: '40 Crochet Blankets Worth Saving' }), 'UNSUPPORTED_NUMBER'],
    ['adds "viral"', (a, plan) => repairAnswer(a, plan, '15', { 2: 'Viral Crochet Blankets for the Sofa' }), 'DUPLICATE_TITLE'],
    ['adds "best"', (a, plan) => repairAnswer(a, plan, '15', { 2: 'The Best Crochet Blankets for the Sofa' }), 'DUPLICATE_TITLE'],
    ['is not JSON', () => 'Sorry, here are better titles', 'DUPLICATE_TITLE'],
    ['has an extra field', (a, plan) => repairAnswer(a, plan, '15', {}, { angle: 'listicle' }), 'DUPLICATE_TITLE'],
    ['still gives near-identical titles', (a, plan) => repairAnswer(a, plan, '15', { 2: DUP_OTHER, 3: DUP_NUMBERED }), 'DUPLICATE_TITLE'],
  ];
  for (const [name, buildRepair, code] of failing) {
    test(`a repair that ${name} → 422 strategy_safeguard_failed (${code}), one repair only, nothing saved`, async () => {
      const article = post();
      const plan = buildListicleAnglePlan(3);
      const run = await runGenerate(article, articleBody(3), [duplicateAnswer(article, plan, '15'), buildRepair(article, plan)]);
      expect(run.status).toBe(422);
      expect(run.prompts).toHaveLength(2);
      expect(run.body.error?.code).toBe('strategy_safeguard_failed');
      expect(run.body.error?.issues?.map((issue) => issue.code)).toContain(code);
      expect(run.events.filter((event) => event.table === 'pins')).toEqual([]);
      const statuses = run.events.filter((event) => event.table === 'generations' && event.op === 'update').map((event) => (event.row as { status: string }).status);
      expect(statuses).toEqual(['failed']);
    });
  }

  test('a failed repair: issueCount = issues in the body = the log = the alert; no model text in the logs', async () => {
    const article = post();
    const plan = buildListicleAnglePlan(15);
    const run = await runGenerate(article, articleBody(15), [duplicateAnswer(article, plan, '15'), 'not json']);
    expect(run.status).toBe(422);
    const error = run.body.error as unknown as StrategySafeguardError;
    expect(error.issueCount).toBeGreaterThan(20);
    expect(error.issues).toHaveLength(20);
    const failed = run.logs.find((line) => line.includes('Strategy validation failed'))!;
    expect(JSON.parse(failed.slice(failed.indexOf('{'))).issueCount).toBe(error.issueCount);
    const view = strategySafeguardView(error, true);
    expect(view.countLabel).toBe(`${error.issueCount} problems found`);
    expect(view.items.length + view.hiddenCount).toBe(error.issueCount);
    expect(error.issues.every((issue) => issue.code === 'DUPLICATE_TITLE' && typeof issue.pinIndex === 'number')).toBe(true);
    const all = run.logs.join('\n');
    for (const text of [DUP_OTHER, 'Winter crochet blanket inspiration', 'not json']) expect(all).not.toContain(text);
    expect(run.logs.find((line) => line.includes('Title repair:'))).toContain('"rejected":"invalid_json"');
  });

  test('a duplicate plus another failure: no repair call, the 422 stands', async () => {
    const article = post();
    const plan = buildListicleAnglePlan(3);
    const first = pinsOf(duplicateAnswer(article, plan, '15'));
    first[1].description = 'Forty blankets: 40 ideas to save.';
    const run = await runGenerate(article, articleBody(3), [JSON.stringify({ pins: first })]);
    expect(run.status).toBe(422);
    expect(run.prompts).toHaveLength(1);
    expect(run.body.error?.issues?.map((issue) => issue.code)).toEqual(expect.arrayContaining(['DUPLICATE_TITLE', 'UNSUPPORTED_NUMBER']));
  });
});

// ── POST /api/pinterest/generate-images ─────────────────────────────────────

interface DbOp {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
}

function numberedPin(metadata: ListicleMetadata, overrides: Partial<Pin> = {}): Pin {
  const grounding = buildArticleGrounding(FIFTEEN, 3, {}, { niche: 'Crochet' });
  const sectionId = grounding.sectionPlan[0];
  const grounded = attachArticleSourceMetadata(JSON.stringify({ _pinterestStrategy: { angle: 'listicle' } }), {
    sourceType: 'external_wordpress_post',
    sectionId,
    brief: grounding.briefs[sectionId],
  });
  return {
    id: 'pin-1',
    generation_id: 'generation-1',
    language: 'en',
    title: NUMBERED_TITLES[0],
    description: 'Winter crochet blanket inspiration.',
    keywords: 'crochet blanket',
    board: 'Crochet Blankets',
    board_id: 'board-1',
    board_section: 'Winter',
    image_prompt: 'A cream crochet blanket folded on a plain white surface, photorealistic.',
    image_analysis: attachComposerMetadata(grounded, metadata),
    media_url: null,
    link_url: `${SITE}/blankets/?utm_source=pinterest`,
    publish_date: '2026-11-02T09:00:00Z',
    visual_format: 'photo-only',
    overlay_text: null,
    title_banner_template: null,
    cta_banner_template: null,
    created_at: '2026-10-31T00:00:00Z',
    updated_at: '2026-10-31T00:00:00Z',
    ...overrides,
  };
}

interface ImageRun {
  status: number;
  body: { data: { imageStatus: string; imagesGenerated: number; imagesFailed: number } | null };
  ops: DbOp[];
  uploads: Array<{ key: string; body: Buffer; contentType: string }>;
  imageCalls: number;
  fetches: Array<{ url: string; method: string }>;
}

async function runImages(pin: Pin, options: { serve: (url: string) => Promise<Response>; existingVersion?: number }): Promise<ImageRun> {
  const run: ImageRun = { status: 0, body: { data: null }, ops: [], uploads: [], imageCalls: 0, fetches: [] };
  const result = (rec: DbOp & { filters: string[] }, single: boolean) => {
    if (rec.table === 'generations' && rec.op === 'select') {
      return { data: { id: 'generation-1', image_status: 'completed', status: 'completed', user_id: 'user-1', project_id: PROJECT_ID }, error: null };
    }
    if (rec.table === 'projects') return { data: { niche: 'Crochet' }, error: null };
    if (rec.table === 'wordpress_sites') return { data: [{ site_url: SITE }], error: null };
    if (rec.table === 'pins' && rec.op === 'select') return { data: [pin], error: null };
    if (rec.table === 'pin_images' && rec.op === 'select') {
      if (rec.filters.includes('is_active')) return { data: options.existingVersion ? [{ id: 'img-old' }] : [], error: null };
      return { data: options.existingVersion ? [{ version: options.existingVersion }] : [], error: null };
    }
    if (rec.table === 'pin_images' && rec.op === 'insert' && single) return { data: { id: 'img-new' }, error: null };
    return { data: null, error: null };
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }) },
    from(table: string) {
      const rec: DbOp & { filters: string[] } = { table, op: 'select', filters: [] };
      run.ops.push(rec);
      const filter = (column: string) => {
        rec.filters.push(column);
        return query;
      };
      const query = {
        select: () => query,
        eq: filter,
        in: filter,
        is: filter,
        neq: filter,
        order: () => query,
        limit: () => query,
        insert: (payload: unknown) => {
          rec.op = 'insert';
          rec.payload = payload;
          return query;
        },
        update: (payload: unknown) => {
          rec.op = 'update';
          rec.payload = payload;
          return query;
        },
        delete: () => {
          rec.op = 'delete';
          return query;
        },
        single: async () => result(rec, true),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result(rec, false)).then(resolve, reject),
      };
      return query;
    },
    storage: {
      from: () => {
        throw new Error('No Supabase bucket call is expected for a composed Pin');
      },
    },
  };
  const storage = {
    provider: 'r2' as const,
    upload: async (input: { key: string; body: Buffer; contentType: string }) => {
      run.uploads.push(input);
      return { provider: 'r2', key: input.key, publicUrl: `https://media.test/${input.key}` };
    },
    read: async () => Buffer.alloc(0),
    remove: async () => undefined,
    list: async () => [],
    publicUrl: (key: string) => `https://media.test/${key}`,
  };
  const fakes: Record<string, unknown> = {
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/rate-limit': { checkRateLimit: async () => ({ allowed: true }), rateLimitErrorResponse: () => { throw new Error('rate limited'); } },
    '@/lib/storage': { createMediaStorage: () => storage },
    '@/lib/ai/engine': {
      generateImage: async () => {
        run.imageCalls += 1;
        throw new Error('The image model must not be called for a numbered Pin');
      },
      resolveImageModel: () => ({ provider: 'openrouter', model: 'test/photo-model' }),
      generateText: async () => {
        throw new Error('Text generation must not be called');
      },
      analyzeImage: async () => {
        throw new Error('Vision must not be called');
      },
    },
  };
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    run.fetches.push({ url, method: init?.method ?? 'GET' });
    return options.serve(url);
  }) as typeof fetch;
  await withFakes(
    fakes,
    '@/app/api/pinterest/generate-images/route',
    async (route) => {
      const response = await route.POST(
        new Request('http://localhost/api/pinterest/generate-images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generationId: '11111111-1111-4111-8111-111111111111' }) })
      );
      run.status = response.status;
      run.body = (await response.json()) as ImageRun['body'];
    },
    fetchFn
  );
  return run;
}

const opsOf = (run: ImageRun, table: string, op: DbOp['op']) => run.ops.filter((item) => item.table === table && item.op === op);

test.describe('POST /api/pinterest/generate-images — numbered Pin on the article photo', () => {
  test('no image-model call, one GET of the article photo, one 1000×1500 JPEG; only the image of the Pin changes', async () => {
    const metadata = listicleMetadata(FIFTEEN, NUMBERED_TITLES[0], { hasDestination: true });
    const run = await runImages(numberedPin(metadata), { serve: async () => imageResponse(await articlePhoto()) });
    expect(run.status).toBe(200);
    expect(run.body.data).toEqual({ imageStatus: 'completed', imagesGenerated: 1, imagesFailed: 0 });
    expect(run.imageCalls).toBe(0);
    expect(run.fetches).toEqual([{ url: metadata.source.imageUrl, method: 'GET' }]);
    expect(run.uploads).toHaveLength(1);
    expect(await sharp(run.uploads[0].body).metadata()).toMatchObject({ format: 'jpeg', width: 1000, height: 1500 });
    expect(opsOf(run, 'pin_images', 'insert')[0].payload).toMatchObject({ image_model: ARTICLE_IMAGE_MODEL, is_active: false, version: 1 });
    const [pinUpdate] = opsOf(run, 'pins', 'update');
    expect(Object.keys(pinUpdate.payload as object).sort()).toEqual(['image_analysis', 'media_url']);
    const stored = readComposerMetadata((pinUpdate.payload as { image_analysis: string }).image_analysis) as ListicleMetadata;
    expect(stored).toMatchObject({ status: 'rendered', source: metadata.source, text: metadata.text });
    // Only OmniFlow tables are written; no WordPress or other external write.
    const written = new Set(run.ops.filter((item) => item.op !== 'select').map((item) => item.table));
    expect([...written].every((table) => ['generations', 'pin_images', 'pins'].includes(table))).toBe(true);
  });

  test('section photo unreadable → featured image (warning stored); both unreadable → nothing stored, Pin unchanged', async () => {
    const metadata = listicleMetadata();
    const fallback = await runImages(numberedPin(metadata), {
      serve: async (url) => (url === FEATURED ? imageResponse(await articlePhoto()) : imageResponse(Buffer.alloc(0), 'image/jpeg', 404)),
    });
    expect(fallback.body.data).toMatchObject({ imagesGenerated: 1 });
    expect(fallback.fetches.map((item) => item.url)).toEqual([metadata.source.imageUrl, FEATURED]);
    const stored = readComposerMetadata((opsOf(fallback, 'pins', 'update')[0].payload as { image_analysis: string }).image_analysis);
    expect(stored?.warnings).toEqual(['SOURCE_FALLBACK_FEATURED']);

    const failed = await runImages(numberedPin(metadata), { serve: async () => imageResponse(Buffer.alloc(0), 'image/jpeg', 500) });
    expect(failed.body.data).toEqual({ imageStatus: 'failed', imagesGenerated: 0, imagesFailed: 1 });
    expect(failed.imageCalls).toBe(0);
    expect(failed.uploads).toEqual([]);
    expect(opsOf(failed, 'pin_images', 'insert')).toEqual([]);
    expect(opsOf(failed, 'pins', 'update')).toEqual([]);
  });

  test('a stored photo URL outside the allowed hosts is never fetched', async () => {
    const metadata = listicleMetadata();
    const pin = numberedPin({ ...metadata, source: { ...metadata.source, imageUrl: 'http://169.254.169.254/latest/meta-data', fallbackUrl: null } });
    const run = await runImages(pin, { serve: async () => imageResponse(await articlePhoto()) });
    expect(run.fetches).toEqual([]);
    expect(run.body.data).toMatchObject({ imagesFailed: 1 });
    expect(run.uploads).toEqual([]);
  });

  test('Regenerate image re-reads the same article photo with the next crop: a different composition, same text and source', async () => {
    const metadata = listicleMetadata();
    const serve = async () => imageResponse(await articlePhoto());
    const first = await runImages(numberedPin(metadata), { serve });
    const second = await runImages(numberedPin(metadata), { serve, existingVersion: 1 });
    expect(second.imageCalls).toBe(0);
    expect(second.fetches.map((item) => item.url)).toEqual([metadata.source.imageUrl]);
    expect(second.uploads[0].body.equals(first.uploads[0].body)).toBe(false);
    const stored = readComposerMetadata((opsOf(second, 'pins', 'update')[0].payload as { image_analysis: string }).image_analysis);
    expect(stored).toMatchObject({ source: metadata.source, text: metadata.text });
  });
});
