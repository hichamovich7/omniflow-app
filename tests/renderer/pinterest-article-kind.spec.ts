import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import * as wordpressPostSource from '@/lib/social/pinterest-from-wordpress-post';
import { buildWordPressArticleContext, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import {
  appendArticleVisualBrief,
  articleGlobalSubject,
  attachArticleSourceMetadata,
  buildArticleGrounding,
  formatVisualBrief,
  planArticlePinSections,
  readArticleSourceMetadata,
  validateArticleGroundedPins,
} from '@/lib/pinterest/article-briefs';
import { checkTipImage, classifyArticleKind, isProjectTitle, isTipsTitle, tipActionsOf } from '@/lib/pinterest/article-kind';
import { buildListicleAnglePlan, detectListicleNumber, isNumberedAngle } from '@/lib/pinterest/listicle';
import { readComposerMetadata } from '@/lib/pinterest/composer/content';
import { buildPinterestPinsPrompt } from '@/lib/prompts';
import { paidImageCalls, paidImagesConfirmation } from '@/lib/social/pin-display';
import type { PinterestAngle } from '@/types/pinterest';

// TASK-FIX-089 — project galleries vs tips guides. Offline: no AI, Vision,
// image model, WordPress write or real storage call; the route runs on a
// fake Supabase client and a fake text model.

const SITE = 'https://clay.example.test';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = '22222222-2222-4222-8222-222222222222';
const CLAY_NICHE = 'Clay Crafts & DIY';

// The reported article: 25 numbered tips, each with its own photo.
const TIPS_H1 = '25 Air Dry Clay Tips for Beginners to Get Better Results';
const TIPS = [
  'Knead the clay before you start', 'Keep your hands slightly damp', 'Store opened clay in an airtight bag', 'Roll slabs to an even thickness',
  'Work on a smooth surface', 'Score and slip to join pieces', 'Smooth seams with a damp brush', 'Add an armature for tall pieces',
  'Check the thickness of every wall', 'Let pieces dry slowly', 'Dry pieces on a wire rack', 'Turn pieces while drying',
  'Fix small cracks with slip', 'Sand dry pieces gently', 'Seal the surface before painting', 'Test paint colors on scrap clay',
  'Use acrylic paint in thin layers', 'Apply varnish in light coats', 'Keep your tools clean', 'Cover the clay between sessions',
  'Use texture tools for detail', 'Plan the design on paper first', 'Make a small test piece', 'Do not rush the drying',
  'Keep finished pieces decorative',
];
const tipImage = (index: number) => `${SITE}/wp-content/uploads/tip-${index}.jpg`;
const FEATURED = `${SITE}/wp-content/uploads/featured-tips.jpg`;
const TIPS_HTML = [
  '<p>Air dry clay is easy to start with. These tips help beginners get smoother, stronger results.</p>',
  ...TIPS.map((tip, i) => `<h2>${i + 1}. ${tip}</h2><figure><img src="${tipImage(i + 1)}" alt="${tip}"></figure><p>${tip}: it keeps your air dry clay smooth and helps avoid cracks while it dries.</p>`),
].join('\n');

const CLAY_IDEAS = [
  'Smiling Cactus in a Mini Pot', 'Kawaii Avocado Half Magnet', 'Leaf-Imprint Trinket Dish', 'Tiny Green Dinosaur Figurine',
  'Garden Caterpillar with Curved Antennae', 'Smiling Broccoli Fridge Magnet', 'Layered Lime-Slice Magnet', 'Watermelon Wedge Decor Magnet',
  'Kiwi Slice Pair for a Mini Display', 'Four-Leaf Clover Magnet', 'Lily-Pad Dish with a Tiny Frog', 'Mossy Green Mushroom Sculpture',
];
const IDEAS_H1 = '12 Green Air-Dry Clay Ideas for Cute DIY Decor and Crafts';
const IDEAS_HTML = [
  '<p>Green air-dry clay makes cute decor and small crafts for every room.</p>',
  ...CLAY_IDEAS.map((idea, i) => `<h2>${i + 1}. ${idea}</h2><figure><img src="${SITE}/wp-content/uploads/clay-${i + 1}.jpg" alt="${idea}"></figure><p>Shape the ${idea.toLowerCase()} from green air-dry clay and let it dry for a day.</p>`),
].join('\n');

function numberedHtml(headings: readonly string[], body = 'A short paragraph about this part of the article.'): string {
  return ['<p>An introduction to the article.</p>', ...headings.map((heading, i) => `<h2>${i + 1}. ${heading}</h2><p>${heading}. ${body}</p>`)].join('\n');
}

function article(title: string, html: string, language = 'en'): WordPressArticleContext {
  return buildWordPressArticleContext({
    sourceType: 'external_wordpress_post',
    html,
    title,
    excerpt: '',
    language,
    featuredImage: { url: FEATURED, alt: 'Air dry clay' },
    permalink: `${SITE}/post/`,
  });
}

const TIPS_ARTICLE = article(TIPS_H1, TIPS_HTML);
const IDEAS_ARTICLE = article(IDEAS_H1, IDEAS_HTML);

// ── Classification ───────────────────────────────────────────────────────────

test.describe('Article kind: project gallery, tips guide or article', () => {
  test('"25 Air Dry Clay Tips for Beginners…" (25 numbered sections) → tips_guide, even though its number is detected', () => {
    expect(detectListicleNumber(TIPS_ARTICLE)).toEqual({ value: '25', source: 'title' });
    expect(classifyArticleKind(TIPS_ARTICLE)).toBe('tips_guide');
  });

  test('real project galleries stay project_listicle', () => {
    expect(classifyArticleKind(IDEAS_ARTICLE)).toBe('project_listicle');
    const polymer = ['Polymer clay earrings', 'Polymer clay charm', 'Polymer clay coaster', 'Polymer clay trinket dish', 'Polymer clay vase'];
    expect(classifyArticleKind(article('15 Polymer Clay Craft Ideas', numberedHtml(polymer)))).toBe('project_listicle');
    const magnets = ['Strawberry magnet', 'Daisy magnet', 'Cloud magnet', 'Lemon magnet'];
    expect(classifyArticleKind(article('10 Clay Magnet Projects', numberedHtml(magnets)))).toBe('project_listicle');
    // Without a project word, at least three sections naming an object still prove a gallery.
    const blankets = ['Moss stitch blanket', 'Waffle blanket', 'Ripple blanket', 'Shell blanket'];
    expect(classifyArticleKind(article('Top 12 Crochet Blankets to Make This Winter', numberedHtml(blankets)))).toBe('project_listicle');
  });

  test('an article with no clear kind → generic_article (a number alone never makes a gallery)', () => {
    expect(classifyArticleKind(article('Why I Love Working With Clay', '<p>Clay is calm.</p><h2>The texture</h2><p>Soft.</p><h2>The quiet</h2><p>Calm.</p>'))).toBe('generic_article');
    const reasons = ['It is calm', 'It is cheap', 'It is forgiving', 'It travels well'];
    expect(detectListicleNumber(article('7 Reasons I Started Sculpting', numberedHtml(reasons)))).not.toBeNull();
    expect(classifyArticleKind(article('7 Reasons I Started Sculpting', numberedHtml(reasons)))).toBe('generic_article');
  });

  test('tips words in English, French, German and Spanish', () => {
    for (const title of [
      '25 Air Dry Clay Tips for Beginners', 'Clay Tricks Every Maker Should Know', '10 Mistakes Beginners Make With Clay',
      'Sculpting Techniques for Small Figures', '7 Ways to Improve Your Clay Projects', 'Beginner Advice for Air Dry Clay',
      '25 conseils pour l’argile autodurcissante', 'Astuces pour bien lisser l’argile', 'Les erreurs à éviter avec l’argile', 'Techniques de modelage',
      '25 Tipps für lufttrocknenden Ton', 'Häkeltipps für Anfänger', 'Die häufigsten Anfängerfehler beim Töpfern', 'Techniken für glatte Oberflächen',
      '25 consejos para la arcilla de secado al aire', 'Trucos para pintar arcilla', 'Errores comunes con la arcilla', 'Técnicas de modelado',
    ]) {
      expect(isTipsTitle(title), title).toBe(true);
    }
    for (const title of [IDEAS_H1, '15 Polymer Clay Craft Ideas', '18 gemütliche Häkeldecken-Ideen für den Winter', '15 idées de couvertures au crochet', '15 ideas de mantas de ganchillo']) {
      expect(isTipsTitle(title), title).toBe(false);
      expect(isProjectTitle(title), title).toBe(true);
    }
  });

  test('tips guides in French, German and Spanish are tips_guide; their project galleries stay project_listicle', () => {
    const cases: Array<[string, string, string[], string]> = [
      ['fr', '25 conseils pour réussir l’argile autodurcissante', ['Pétrir l’argile', 'Lisser la surface', 'Réparer une fissure', 'Appliquer le vernis'], 'tips_guide'],
      ['de', '25 Tipps für lufttrocknenden Ton', ['Den Ton kneten', 'Die Oberfläche glätten', 'Risse reparieren', 'Lack auftragen'], 'tips_guide'],
      ['es', '25 consejos para la arcilla de secado al aire', ['Amasar la arcilla', 'Alisar la superficie', 'Reparar una grieta', 'Aplicar el barniz'], 'tips_guide'],
      ['fr', '12 idées de décorations en argile', ['Vide-poche feuille', 'Aimant cactus', 'Petit vase', 'Bougeoir étoile'], 'project_listicle'],
      ['de', '12 Ton-Ideen für dein Zuhause', ['Blatt-Schale', 'Kaktus-Magnet', 'Kleine Vase', 'Sternen-Kerzenhalter'], 'project_listicle'],
      ['es', '12 ideas de decoración con arcilla', ['Bandeja de hoja', 'Imán de cactus', 'Jarrón pequeño', 'Portavelas de estrella'], 'project_listicle'],
    ];
    for (const [language, title, headings, kind] of cases) {
      expect(classifyArticleKind(article(title, numberedHtml(headings), language)), title).toBe(kind);
    }
  });

  test('a tips title that also promises ideas stays a gallery only when sections name distinct projects', () => {
    const projects = ['Clay trinket dish', 'Clay vase', 'Clay coaster', 'Clay charm'];
    expect(classifyArticleKind(article('15 Air Dry Clay Ideas With Tips', numberedHtml(projects)))).toBe('project_listicle');
    expect(classifyArticleKind(article('15 Air Dry Clay Ideas and Tips', numberedHtml(TIPS.slice(0, 5))))).toBe('tips_guide');
  });
});

// ── Briefs and the tip check ─────────────────────────────────────────────────

function tipsGrounding(pins: number, context = TIPS_ARTICLE) {
  return buildArticleGrounding(context, pins, {}, { niche: CLAY_NICHE, articleKind: classifyArticleKind(context) });
}

// What a faithful image prompt says for each tip (English, as the model writes it).
const TIP_SCENES: Record<string, string> = {
  'Knead the clay before you start': 'Two hands kneading a soft ball of white air dry clay on a natural wood board',
  'Check the thickness of every wall': 'Hands checking the thickness of a white air dry clay wall with a small ruler on a wood board',
  'Use acrylic paint in thin layers': 'A hand painting a thin layer of acrylic paint on a white air dry clay piece with a soft brush',
  'Fix small cracks with slip': 'A fingertip filling a small crack in white air dry clay with slip, on a plain board',
  'Seal the surface before painting': 'A brush applying a clear sealer coat to a white air dry clay piece on a plain board',
  'Apply varnish in light coats': 'A flat brush applying a light coat of varnish to a smooth white air dry clay piece',
  'Dry pieces on a wire rack': 'White air dry clay pieces drying on a wire rack near a window',
  'Do not rush the drying': 'White air dry clay pieces left to dry slowly on a board, away from any heater',
};
const sceneFor = (heading: string) => `${TIP_SCENES[heading.replace(/^\d+\.\s*/, '')] ?? `Hands showing how to ${heading.replace(/^\d+\.\s*/, '').toLowerCase()} with white air dry clay on a plain board`}, soft natural light, overhead view, photorealistic.`;

test.describe('tips_guide briefs: the image shows the tip, never a required project', () => {
  test('each planned tip brief carries the tip focus and no project contract', () => {
    const g = tipsGrounding(5);
    expect(g.articleKind).toBe('tips_guide');
    for (const id of g.sectionPlan) {
      const brief = g.briefs[id];
      expect(brief.focus).toBe('tip');
      expect(brief.subjectContract).toBeUndefined();
      const text = formatVisualBrief(brief);
      expect(text).toContain(`Tip, action or technique represented: ${brief.represented}`);
      expect(text).toContain('the image must clearly represent the tip, action or technique of this section');
      expect(text).not.toContain('Pattern or project represented');
      expect(text).not.toContain('Required subject: the image description must explicitly mention');
    }
  });

  test('faithful tip prompts pass for 25 sections — no IMAGE_SUBJECT_MISMATCH, never "no recognizable project"', () => {
    const g = tipsGrounding(25);
    const pins = g.sectionPlan.map((id) => ({ sourceSectionId: id, image_prompt: sceneFor(g.briefs[id].sourceSection) }));
    const issues = validateArticleGroundedPins(pins, g);
    expect(issues).toEqual([]);
    expect(JSON.stringify(issues)).not.toContain('no recognizable project');
  });

  test('the quality gate stays active: an invented project instead of the tip → IMAGE_SUBJECT_MISMATCH on the tip', () => {
    const g = tipsGrounding(25);
    const crack = g.sectionPlan.find((id) => g.briefs[id].represented === 'Fix small cracks with slip')!;
    const issues = validateArticleGroundedPins([{ sourceSectionId: crack, image_prompt: 'A finished white vase on a shelf with a plant, eye-level, photorealistic.' }], { ...g, sectionPlan: [crack] });
    const mismatch = issues.find((issue) => issue.reason === 'IMAGE_SUBJECT_MISMATCH');
    expect(mismatch?.message).toContain('does not clearly represent the tip, action or technique');
    expect(mismatch?.subject).toEqual({ expected: ['crack', 'join'], detected: ['no recognizable tip or action'], missing: ['crack', 'join'], tip: true });
    expect(JSON.stringify(issues)).not.toContain('no recognizable project');
    // The invented-element check still runs on tips.
    const invented = validateArticleGroundedPins([{ sourceSectionId: crack, image_prompt: 'A fingertip filling a crack in a crochet blanket with slip.' }], { ...g, sectionPlan: [crack] });
    expect(invented.map((issue) => issue.reason)).toContain('UNGROUNDED_IMAGE_ELEMENTS');
  });

  test('tip check: known actions in four languages, English content words otherwise', () => {
    expect(tipActionsOf('Lisser l’argile avec une éponge', 'fr')).toEqual(expect.arrayContaining(['smooth', 'tools']));
    expect(tipActionsOf('Risse im Ton reparieren', 'de')).toEqual(['crack']);
    expect(tipActionsOf('Aplicar el barniz en capas finas', 'es')).toEqual(expect.arrayContaining(['varnish']));
    expect(checkTipImage('Hands smoothing white clay with a damp sponge.', 'Lisser l’argile avec une éponge', 'fr').ok).toBe(true);
    expect(checkTipImage('A finished clay vase on a shelf.', 'Risse im Ton reparieren', 'de').ok).toBe(false);
    expect(checkTipImage('A sketch of the design drawn on paper next to white clay.', 'Plan the design on paper first', 'en').ok).toBe(true);
    expect(checkTipImage('A clay vase on a shelf.', 'Plan the design on paper first', 'en').ok).toBe(false);
  });

  test('the stored tip brief survives the round trip and frames the image prompt as a tip', () => {
    const g = tipsGrounding(3);
    const brief = g.briefs[g.sectionPlan[0]];
    const stored = attachArticleSourceMetadata(null, { sourceType: 'external_wordpress_post', sectionId: brief.sectionId, brief });
    expect(readArticleSourceMetadata(stored)?.brief.focus).toBe('tip');
    const prompt = appendArticleVisualBrief('Base prompt.', stored);
    expect(prompt).toContain('the image must clearly represent the tip, action or technique of this section');
    expect(prompt).not.toContain('the image must depict this exact project');
  });

  test('project galleries keep their project briefs and checks (unchanged)', () => {
    const g = buildArticleGrounding(IDEAS_ARTICLE, 3, {}, { niche: CLAY_NICHE, articleKind: classifyArticleKind(IDEAS_ARTICLE) });
    expect(g.articleKind).toBe('project_listicle');
    for (const id of g.sectionPlan) {
      expect(g.briefs[id].focus).toBeUndefined();
      expect(formatVisualBrief(g.briefs[id])).toContain('Pattern or project represented');
    }
    // Same brief as without a kind.
    const legacy = buildArticleGrounding(IDEAS_ARTICLE, 3, {}, { niche: CLAY_NICHE });
    expect(g.briefs).toEqual(legacy.briefs);
  });

  test('the text prompt asks tips guides for the tip, and project articles for the project', () => {
    const base = { keyword: 'air dry clay tips', language: 'en' as const, pinsRequested: 3, generationMode: 'photo-only' as const, textOverlayMode: 'never' as const, articleGrounded: true };
    const tips = buildPinterestPinsPrompt({ ...base, tipsGuide: true }).user;
    expect(tips).toContain('the image must clearly represent the tip, action or technique');
    expect(tips).not.toContain('is the exact project of the pin');
    const projects = buildPinterestPinsPrompt(base).user;
    expect(projects).toContain('is the exact project of the pin');
    expect(projects).not.toContain('the image must clearly represent the tip, action or technique');
  });
});

// ── POST /api/pinterest/generate ─────────────────────────────────────────────

interface GenerateRun {
  status: number;
  body: { data: Record<string, unknown> | null; error: Record<string, unknown> | null };
  events: Array<{ table: string; op: string; row: unknown }>;
  prompts: string[];
  logs: string[];
  imageCalls: number;
}

function wordpressPost(title: string, html: string) {
  return {
    id: 3001,
    title,
    date: '2026-10-20T00:00:00',
    status: 'publish',
    categories: ['Air Dry Clay'],
    categoryIds: [],
    featuredImage: { url: FEATURED, alt: 'Air dry clay', caption: '' },
    excerpt: 'Air dry clay for beginners.',
    contentHtml: html,
    tags: [],
    link: `${SITE}/post/`,
  };
}

const TIPS_NUMBERED_TITLES = ['25 Air Dry Clay Tips for Beginners to Save', 'Better Results With These 25 Air Dry Clay Tips', 'Try These 25 Air Dry Clay Tips at Home'];
const TIPS_OTHER_TITLES = ['The Small Habit That Keeps Clay Smooth', 'A Calmer Way to Work With Air Dry Clay', 'Cracked Clay? Start With This Habit'];
const IDEAS_NUMBERED_TITLES = ['12 Green Air-Dry Clay Ideas for Cute DIY Decor', 'Make One of These 12 Green Air-Dry Clay Crafts', 'Save These 12 Green Air-Dry Clay Ideas'];
const IDEAS_OTHER_TITLES = ['A Fresh Green Clay Craft for Your Shelf', 'The Cutest Green Decor You Can Shape', 'Bare Shelf? Shape a Green Clay Piece'];

function modelAnswer(post: ReturnType<typeof wordpressPost>, angles: PinterestAngle[], scene: (heading: string) => string, titles: { numbered: string[]; other: string[] }): string {
  const context = buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html: post.contentHtml, title: post.title, language: 'en' });
  const sections = planArticlePinSections(context, angles.length);
  let numbered = 0;
  let other = 0;
  return JSON.stringify({
    pins: angles.map((angle, index) => ({
      angle,
      title: isNumberedAngle(angle) ? titles.numbered[numbered++] : titles.other[other++],
      description: [
        'Air dry clay feels easier once this habit is part of every session. The article explains why.',
        'Smoother surfaces start here: a small change that beginners notice on the very first piece.',
        'Cracks, rough edges and uneven walls have one common cause — see what to change before shaping.',
        'Painting and sealing clay go better with this approach, explained with photos in the article.',
        'Save this for your next clay afternoon: a practical habit for stronger, cleaner handmade pieces.',
      ][index % 5],
      keywords: 'air dry clay, clay crafts, beginner clay',
      board: 'Air Dry Clay',
      image_prompt: scene(context.sections.find((section) => section.id === sections[index])!.heading),
      sourceSectionId: sections[index],
      visualFormat: 'photo',
    })),
  });
}

async function runGenerate(post: ReturnType<typeof wordpressPost>, body: Record<string, unknown>, answer: string): Promise<GenerateRun> {
  const run: GenerateRun = { status: 0, body: { data: null, error: null }, events: [], prompts: [], logs: [], imageCalls: 0 };
  const project = { id: PROJECT_ID, description: null, niche: CLAY_NICHE, user_id: 'user-1', default_language: 'en' };
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
        if (run.prompts.length > 1) throw new Error('unexpected AI call');
        return answer;
      },
      analyzeImage: async () => {
        throw new Error('Vision unavailable in this test');
      },
      generateImage: async () => {
        run.imageCalls += 1;
        throw new Error('Image generation must not be called');
      },
      resolveImageModel: () => {
        run.imageCalls += 1;
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
        ...wordpressPostSource.buildWordPressPostPinterestSource(post, { id: SITE_ID, project_id: PROJECT_ID, site_url: SITE }, { niche: CLAY_NICHE, description: null, default_language: 'en' }),
        contentStreams: [],
        nicheSettings: null,
      }),
    },
  };
  const routeSpecifier = '@/app/api/pinterest/generate/route';
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
    globalThis.fetch = (async () => {
      throw new Error('No network call is allowed in this test');
    }) as typeof fetch;
    const sink = (...args: unknown[]) => {
      run.logs.push(args.map((arg) => (typeof arg === 'string' ? arg : arg instanceof Error ? arg.message : JSON.stringify(arg))).join(' '));
    };
    console.log = sink;
    console.warn = sink;
    console.error = sink;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require(routeSpecifier) as { POST: (request: Request) => Promise<Response> };
    const response = await route.POST(new Request('http://localhost/api/pinterest/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    run.status = response.status;
    run.body = (await response.json()) as GenerateRun['body'];
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
  return run;
}

const articleBody = (pinsRequested: number) => ({
  projectId: PROJECT_ID,
  keyword: 'air dry clay',
  language: 'en',
  pinsRequested,
  generationMode: 'photo-only',
  wordpressPost: { siteId: SITE_ID, postId: 3001 },
  board: 'Air Dry Clay',
  boardSection: 'Beginners',
  listicleTextTreatment: 'ai-design',
});

const savedPins = (run: GenerateRun) => (run.events.find((event) => event.table === 'pins' && event.op === 'insert')?.row ?? []) as Array<Record<string, unknown>>;

test.describe('POST /api/pinterest/generate — tips guide vs project gallery', () => {
  test('25 tips, 3 Pins: numbered titles kept, no listicle_article_image, tip briefs, no image call; link, board, section and dates unchanged', async () => {
    const post = wordpressPost(TIPS_H1, TIPS_HTML);
    const plan = buildListicleAnglePlan(3);
    const run = await runGenerate(post, articleBody(3), modelAnswer(post, plan, sceneFor, { numbered: TIPS_NUMBERED_TITLES, other: TIPS_OTHER_TITLES }));
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
    expect(run.body.data?.articleKind).toBe('tips_guide');
    expect(run.prompts).toHaveLength(1);
    // The number still frames the titles; the image instruction is the tip one.
    expect(run.prompts[0]).toContain('The source article confirms an exact count: 25.');
    expect(run.prompts[0]).toContain('the image must clearly represent the tip, action or technique');
    expect(run.prompts[0]).toContain('Tip, action or technique represented:');
    expect(run.imageCalls).toBe(0);
    expect(run.logs.some((line) => line.includes('Article kind: {"kind":"tips_guide"}'))).toBe(true);
    expect(run.logs.some((line) => line.includes('Listicle:'))).toBe(false);
    const rows = savedPins(run);
    expect(rows).toHaveLength(3);
    expect(run.events.filter((event) => event.table === 'pins')).toHaveLength(1);
    expect(rows.filter((row) => /\b25\b/.test(row.title as string)).length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(readComposerMetadata(row.image_analysis as string)).toBeNull();
      expect(row.visual_format).toBe('photo-only');
      expect(readArticleSourceMetadata(row.image_analysis as string)?.brief.focus).toBe('tip');
      expect(row.image_prompt).toMatch(/clay/);
      expect(row.link_url).toBe(`${SITE}/post/`);
      expect(String(row.link_url)).not.toContain('utm_');
      expect(row.board).toBe('Air Dry Clay');
      expect(row.board_section).toBe('Beginners');
      expect(row).not.toHaveProperty('publish_date');
      expect(row).not.toHaveProperty('scheduled_at');
    }
  });

  test('tips prompts that show the tip pass, whatever the section: no "no recognizable project" for 5 Pins', async () => {
    const post = wordpressPost(TIPS_H1, TIPS_HTML);
    const plan = buildListicleAnglePlan(5);
    const titles = { numbered: TIPS_NUMBERED_TITLES, other: [...TIPS_OTHER_TITLES, 'Smooth Clay Starts Before You Shape It'] };
    const run = await runGenerate(post, articleBody(5), modelAnswer(post, plan, sceneFor, titles));
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
    expect(JSON.stringify(run.body)).not.toContain('no recognizable project');
    expect(savedPins(run)).toHaveLength(5);
    // TASK-FIX-098: a tips guide keeps the half plan (3 of 5 numbered titles), never listicle_article_image.
    expect(plan).toEqual(buildListicleAnglePlan(5, { articleKind: 'tips_guide' }));
    expect(savedPins(run).filter((row) => isNumberedAngle(JSON.parse(row.image_analysis as string)._pinterestStrategy.angle))).toHaveLength(3);
    expect(savedPins(run).every((row) => readComposerMetadata(row.image_analysis as string) === null)).toBe(true);
  });

  test('a tip Pin showing an invented project → 422 IMAGE_SUBJECT_MISMATCH on the tip, nothing saved, no image call', async () => {
    const post = wordpressPost(TIPS_H1, TIPS_HTML);
    const plan = buildListicleAnglePlan(3);
    const invented = (heading: string) => (heading.includes('Use acrylic paint') ? 'A finished white vase on a shelf next to a plant, eye-level, photorealistic.' : sceneFor(heading));
    const run = await runGenerate(post, articleBody(3), modelAnswer(post, plan, invented, { numbered: TIPS_NUMBERED_TITLES, other: TIPS_OTHER_TITLES }));
    expect(run.status).toBe(422);
    const issues = (run.body.error?.issues ?? []) as Array<{ code: string; message: string }>;
    const mismatch = issues.find((issue) => issue.code === 'IMAGE_SUBJECT_MISMATCH');
    expect(mismatch?.message).toContain('tip');
    expect(JSON.stringify(run.body)).not.toContain('no recognizable project');
    expect(run.events.some((event) => event.table === 'pins')).toBe(false);
    expect(run.events.some((event) => event.table === 'generations' && event.op === 'update' && (event.row as { status?: string }).status === 'failed')).toBe(true);
    expect(run.imageCalls).toBe(0);
  });

  test('a real project gallery keeps listicle_article_image on its numbered Pins (unchanged)', async () => {
    const post = wordpressPost(IDEAS_H1, IDEAS_HTML);
    // TASK-FIX-098: ~30 % numbered in a project gallery → 1 of 3.
    const plan = buildListicleAnglePlan(3, { articleKind: 'project_listicle' });
    const scene = (heading: string) => `A small green air dry clay ${heading.replace(/^\d+\.\s*/, '').toLowerCase()} on a plain white surface, soft natural light, eye-level view, photorealistic.`;
    const run = await runGenerate(post, { ...articleBody(3), listicleTextTreatment: 'omniflow-overlay' }, modelAnswer(post, plan, scene, { numbered: IDEAS_NUMBERED_TITLES, other: IDEAS_OTHER_TITLES }));
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
    expect(run.body.data?.articleKind).toBe('project_listicle');
    expect(run.prompts[0]).not.toContain('the image must clearly represent the tip, action or technique');
    const rows = savedPins(run);
    const numbered = rows.filter((row) => isNumberedAngle(JSON.parse(row.image_analysis as string)._pinterestStrategy.angle));
    expect(numbered).toHaveLength(1);
    for (const row of numbered) expect(readComposerMetadata(row.image_analysis as string)?.templateType).toBe('listicle_article_image');
    expect(run.imageCalls).toBe(0);
    for (const row of rows) {
      expect(row.link_url).toBe(`${SITE}/post/`);
      expect(row.board_section).toBe('Beginners');
    }
  });
});

// ── v3.3.0: AI-generated design by default ──────────────────────────────────

const listicleAnalysis = (extra: Record<string, unknown>) =>
  JSON.stringify({
    _pinterestComposer: {
      templateType: 'listicle_article_image',
      templateVersion: 'v2',
      renderedBy: 'omniflow-composer',
      language: 'en',
      status: 'planned',
      sourceSections: ['s2'],
      sourceHeadings: ['3. Leaf-Imprint Trinket Dish'],
      warnings: [],
      text: { displayTitle: 'Leaf-Imprint Trinket Dish', number: '12', cta: null },
      source: { imageUrl: `${SITE}/leaf.jpg`, imageKey: null, origin: 'section', sectionId: 's2', fallbackUrl: null, crop: 0 },
      ...extra,
    },
  });

test.describe('v3.3.0 — AI-generated design by default', () => {
  test('a project gallery with no treatment sent → numbered Pins stored as ai-design (reference = an article photo); tips never get one', async () => {
    const ideas = wordpressPost(IDEAS_H1, IDEAS_HTML);
    // TASK-FIX-098: the gallery numbers 2 of 5 Pins; the tips guide keeps the half plan.
    const plan = buildListicleAnglePlan(5, { articleKind: 'project_listicle' });
    const tipsPlan = buildListicleAnglePlan(3);
    const scene = (heading: string) => `A small green air dry clay ${heading.replace(/^\d+\.\s*/, '').toLowerCase()} on a plain white surface, soft natural light, eye-level view, photorealistic.`;
    const { listicleTextTreatment: _omit, ...body } = articleBody(3);
    void _omit;
    const run = await runGenerate(ideas, { ...body, pinsRequested: 5 }, modelAnswer(ideas, plan, scene, { numbered: IDEAS_NUMBERED_TITLES, other: IDEAS_OTHER_TITLES }));
    expect(run.status, JSON.stringify(run.body.error)).toBe(201);
    const contracts = savedPins(run).map((row) => readComposerMetadata(row.image_analysis as string)).filter((item) => item !== null);
    expect(contracts).toHaveLength(2);
    for (const contract of contracts) {
      expect(contract).toMatchObject({ templateType: 'listicle_article_image', textTreatment: 'ai-design' });
      expect((contract as { source: { imageUrl: string } }).source.imageUrl).toMatch(/^https:\/\/clay\.example\.test\/wp-content\/uploads\/clay-\d+\.jpg$/);
    }
    expect(run.imageCalls).toBe(0);

    const tipsPost = wordpressPost(TIPS_H1, TIPS_HTML);
    const tips = await runGenerate(tipsPost, body, modelAnswer(tipsPost, tipsPlan, sceneFor, { numbered: TIPS_NUMBERED_TITLES, other: TIPS_OTHER_TITLES }));
    expect(tips.status, JSON.stringify(tips.body.error)).toBe(201);
    expect(savedPins(tips).every((row) => readComposerMetadata(row.image_analysis as string) === null)).toBe(true);
  });

  test('paid image calls follow each Pin\'s own mode; the confirmation states the exact number', () => {
    const pins = [
      { image_analysis: listicleAnalysis({ textTreatment: 'ai-design' }) },
      { image_analysis: listicleAnalysis({ textTreatment: 'omniflow-overlay' }) },
      { image_analysis: listicleAnalysis({ textTreatment: 'photo-only' }) },
      // Stored before v3.3.0 without a mode: the overlay, no image call.
      { image_analysis: listicleAnalysis({}) },
      // AI Integrated / Classic Pins: one call each.
      { image_analysis: null },
      { image_analysis: JSON.stringify({ _pinterestStrategy: { angle: 'curiosity' } }) },
    ];
    expect(paidImageCalls(pins)).toBe(3);
    expect(paidImagesConfirmation(3)).toBe('This action will generate 3 paid images. Continue?');
    expect(paidImagesConfirmation(1)).toBe('This action will generate 1 paid image. Continue?');
  });

  test('both global "generate images" actions ask for the paid confirmation first (source level)', () => {
    const button = readFileSync(join(process.cwd(), 'components/pinterest/generate-images-button.tsx'), 'utf8');
    expect(button).toContain('paidImagesConfirmation(paidImages)');
    expect(button).toMatch(/paidImages > 0 \? setConfirmOpen\(true\) : handleGenerate\(\)/);
    const workspace = readFileSync(join(process.cwd(), 'components/editorial/editorial-workspace.tsx'), 'utf8');
    expect(workspace).toContain('paidImages={paidWithoutImages}');
    expect(workspace).toContain('paidImages={paidSelected}');
    const cards = readFileSync(join(process.cwd(), 'components/social/article-pin-results.tsx'), 'utf8');
    expect(cards).toContain('paidImageCalls(pins.filter((pin) => !pin.media_url))');
  });

  test('tips guides: titles and image text say tips / advice in the article language, never "ideas"', () => {
    const base = { keyword: 'air dry clay tips', language: 'en' as const, pinsRequested: 3, generationMode: 'ai-integrated' as const, textOverlayMode: 'never' as const, articleGrounded: true };
    const tips = buildPinterestPinsPrompt({ ...base, tipsGuide: true }).user;
    expect(tips).toContain('call its items tips, advice or techniques');
    expect(tips).toContain('Never call them "ideas" or "projects".');
    expect(tips).toContain('French: conseils, astuces, techniques; German: Tipps, Techniken; Spanish: consejos, trucos, técnicas');
    expect(buildPinterestPinsPrompt(base).user).not.toContain('Never call them "ideas"');
  });
});

// ── TASK-FIX-090: project galleries inherit the H1's global subject ─────────────

// Real post 642 of clay.ciencia-y-tecnologia.com (public REST API, read once on 2026-11-01).
const PUMPKIN = JSON.parse(readFileSync(join(__dirname, '../fixtures/pinterest/clay-pumpkin-painting-post.json'), 'utf8')) as {
  title: string;
  excerpt: string;
  link: string;
  featuredImage: { url: string; alt: string; caption: string } | null;
  contentHtml: string;
};
const pumpkinContext = (html = PUMPKIN.contentHtml) =>
  buildWordPressArticleContext({
    sourceType: 'external_wordpress_post',
    html,
    title: PUMPKIN.title,
    excerpt: PUMPKIN.excerpt,
    language: 'en',
    featuredImage: PUMPKIN.featuredImage,
    permalink: PUMPKIN.link,
  });
function pumpkinGrounding(html?: string, kind?: 'project_listicle' | 'tips_guide' | 'generic_article') {
  const context = pumpkinContext(html);
  return buildArticleGrounding(context, 10, {}, { niche: CLAY_NICHE, articleKind: kind ?? classifyArticleKind(context) });
}
const sectionOf = (g: ReturnType<typeof pumpkinGrounding>, heading: string) => g.sectionPlan.find((id) => g.briefs[id].sourceSection === heading)!;
const checkOne = (g: ReturnType<typeof pumpkinGrounding>, sectionId: string, prompt: string) =>
  validateArticleGroundedPins([{ sourceSectionId: sectionId, image_prompt: prompt }], { ...g, sectionPlan: [sectionId] });

const SPECKLED = '4. Speckled Stoneware Look';
const WILDFLOWER = '6. Cottage-Style Wildflower Details';
const SPECKLED_PROMPT = 'A speckled stoneware finish on an air-dry clay pumpkin, cream with rust and charcoal speckles, on a natural wood surface, soft natural light, eye-level, photorealistic.';
const FLORAL_PROMPT = 'A terracotta air-dry clay pumpkin with hand-painted cream floral details and olive leaves, on linen, soft natural light, close-up, photorealistic.';

test.describe('TASK-FIX-090 — project_listicle sections inherit the H1 subject', () => {
  test('the real article: project_listicle, global subject "air-dry clay pumpkin painting" (anchor pumpkin) on sections 4 and 6', () => {
    expect(classifyArticleKind(pumpkinContext())).toBe('project_listicle');
    expect(articleGlobalSubject(PUMPKIN.title, 'en')).toEqual({ label: 'air-dry clay pumpkin painting', anchors: ['pumpkin'] });
    const g = pumpkinGrounding();
    for (const heading of [SPECKLED, WILDFLOWER]) {
      const brief = g.briefs[sectionOf(g, heading)];
      expect(brief.globalSubject).toEqual({ label: 'air-dry clay pumpkin painting', anchors: ['pumpkin'] });
      const text = formatVisualBrief(brief);
      // The image brief always carries the H1 subject, the exact section title, the allowed and the forbidden elements.
      expect(text).toContain('Article global subject (from the H1): air-dry clay pumpkin painting');
      expect(text).toContain(`Source section: ${heading}`);
      expect(text).toContain(`with this section's variation ("${heading}") on it`);
      expect(text).toMatch(/Allowed elements: the article's air-dry clay pumpkin painting \(a pumpkin\) as the single main subject/);
      expect(text).toMatch(/Forbidden elements: .*a different project than the one represented/);
      const stored = attachArticleSourceMetadata(null, { sourceType: 'external_wordpress_post', sectionId: brief.sectionId, brief });
      expect(appendArticleVisualBrief('Base prompt.', stored)).toContain('Article global subject (from the H1): air-dry clay pumpkin painting');
    }
    expect(formatVisualBrief(g.briefs[sectionOf(g, WILDFLOWER)])).toContain('floral details (documented in this section)');
  });

  test('sections 4 and 6: a pumpkin with the section variation passes — no IMAGE_SUBJECT_MISMATCH, no ungrounded element', () => {
    const g = pumpkinGrounding();
    expect(checkOne(g, sectionOf(g, SPECKLED), SPECKLED_PROMPT)).toEqual([]);
    expect(checkOne(g, sectionOf(g, SPECKLED), 'A cream air-dry clay pumpkin with tiny rust and charcoal speckles, overhead view.')).toEqual([]);
    expect(checkOne(g, sectionOf(g, WILDFLOWER), FLORAL_PROMPT)).toEqual([]);
    expect(checkOne(g, sectionOf(g, WILDFLOWER), 'A terracotta air-dry clay pumpkin with tiny cream wildflower details and olive leaves, close-up.')).toEqual([]);
    expect(checkOne(g, sectionOf(g, WILDFLOWER), 'A terracotta air-dry clay pumpkin with little painted flower details, close-up.')).toEqual([]);
  });

  test('"floral" is accepted only because the source says wildflowers', () => {
    // Same article without any wildflower / flower wording: floral is invented again.
    const withoutFlowers = PUMPKIN.contentHtml.replace(/wild\s*flowers?/gi, 'dots').replace(/flowers?/gi, 'dots');
    const g = pumpkinGrounding(withoutFlowers);
    const id = g.sectionPlan.find((sectionId) => /Cottage-Style/.test(g.briefs[sectionId].sourceSection))!;
    expect(g.briefs[id].sourceSection).toBe('6. Cottage-Style dots Details');
    const issues = checkOne(g, id, FLORAL_PROMPT);
    expect(issues.find((issue) => issue.reason === 'UNGROUNDED_IMAGE_ELEMENTS')?.details).toEqual(['floral']);
    expect(formatVisualBrief(g.briefs[id])).not.toContain('floral details (documented in this section)');
  });

  test('a project really absent is still rejected: another object, or no variation of the section', () => {
    const g = pumpkinGrounding();
    const mug = checkOne(g, sectionOf(g, SPECKLED), 'A speckled stoneware mug on a natural wood surface, soft natural light, eye-level, photorealistic.');
    expect(mug.find((issue) => issue.reason === 'IMAGE_SUBJECT_MISMATCH')?.subject).toMatchObject({ required: 'pumpkin', missing: ['pumpkin'] });
    const plain = checkOne(g, sectionOf(g, WILDFLOWER), 'A terracotta air-dry clay pumpkin on linen, soft natural light, close-up.');
    expect(plain.find((issue) => issue.reason === 'IMAGE_SUBJECT_MISMATCH')?.subject).toMatchObject({ required: 'pumpkin', missing: ['cottage', 'wildflower'] });
    // The invented-element check still runs: a crochet hat on the pumpkin.
    expect(checkOne(g, sectionOf(g, SPECKLED), `${SPECKLED_PROMPT} A crochet hat sits on top.`).map((issue) => issue.reason)).toContain('UNGROUNDED_IMAGE_ELEMENTS');
  });

  test('tips_guide and generic_article are unchanged: no global subject, no synonym proof', () => {
    for (const kind of ['tips_guide', 'generic_article'] as const) {
      const g = pumpkinGrounding(undefined, kind);
      expect(Object.values(g.briefs).every((brief) => brief.globalSubject === undefined)).toBe(true);
    }
    const generic = pumpkinGrounding(undefined, 'generic_article');
    expect(checkOne(generic, sectionOf(generic, WILDFLOWER), FLORAL_PROMPT).map((issue) => issue.reason)).toContain('UNGROUNDED_IMAGE_ELEMENTS');
    const tips = tipsGrounding(3);
    expect(tips.sectionPlan.every((id) => tips.briefs[id].globalSubject === undefined)).toBe(true);
    // Galleries whose H1 names no object ("12 Green Air-Dry Clay Ideas") keep their former briefs.
    expect(articleGlobalSubject(IDEAS_H1, 'en')).toBeNull();
    expect(articleGlobalSubject('15 Polymer Clay Craft Ideas', 'en')).toBeNull();
    expect(articleGlobalSubject('10 idées de citrouilles en argile', 'fr')).toBeNull();
  });

  test('a stored global subject survives the round trip; a malformed one is dropped', () => {
    const g = pumpkinGrounding();
    const brief = g.briefs[sectionOf(g, SPECKLED)];
    const stored = attachArticleSourceMetadata(null, { sourceType: 'external_wordpress_post', sectionId: brief.sectionId, brief });
    expect(readArticleSourceMetadata(stored)?.brief.globalSubject).toEqual(brief.globalSubject);
    const broken = attachArticleSourceMetadata(null, { sourceType: 'external_wordpress_post', sectionId: brief.sectionId, brief: { ...brief, globalSubject: { label: 'x', anchors: [] } } });
    expect(readArticleSourceMetadata(broken)?.brief).not.toHaveProperty('globalSubject');
  });

  test('POST /api/pinterest/generate on the real article: grounded Pins pass; an absent project → 422, nothing saved, no image call', async () => {
    const post = wordpressPost(PUMPKIN.title, PUMPKIN.contentHtml);
    const plan = buildListicleAnglePlan(2);
    const titles = { numbered: ['10 Air-Dry Clay Pumpkin Painting Ideas for Cozy Fall Decor'], other: ['A Calmer Way to Paint a Small Clay Pumpkin'] };
    const scene = (variant: 'ok' | 'absent') => (heading: string) => {
      if (/Wildflower/.test(heading)) return variant === 'ok' ? FLORAL_PROMPT : 'A small terracotta vase with cream floral details on linen, close-up, photorealistic.';
      return `An air-dry clay pumpkin with the ${heading.replace(/^\d+\.\s*/, '').toLowerCase()} finish, on a natural wood surface, soft natural light, eye-level, photorealistic.`;
    };
    // 2 Pins on the 10 ideas → idea 1 and idea 6 (the wildflower section).
    const ok = await runGenerate(post, articleBody(2), modelAnswer(post, plan, scene('ok'), titles));
    expect(ok.status, JSON.stringify(ok.body.error)).toBe(201);
    expect(ok.body.data?.articleKind).toBe('project_listicle');
    expect(ok.prompts[0]).toContain('Article global subject (from the H1): air-dry clay pumpkin painting');
    expect(ok.prompts[0]).toContain(`Source section: ${WILDFLOWER}`);
    expect(savedPins(ok).map((row) => readArticleSourceMetadata(row.image_analysis as string)?.brief.globalSubject?.anchors)).toEqual([['pumpkin'], ['pumpkin']]);
    expect(JSON.stringify(ok.body)).not.toContain('IMAGE_SUBJECT_MISMATCH');
    expect(ok.imageCalls).toBe(0);

    const absent = await runGenerate(post, articleBody(2), modelAnswer(post, plan, scene('absent'), titles));
    expect(absent.status).toBe(422);
    const issues = (absent.body.error?.issues ?? []) as Array<{ code: string; message: string }>;
    expect(issues.find((issue) => issue.code === 'IMAGE_SUBJECT_MISMATCH')?.message).toContain('Required subject: pumpkin.');
    expect(absent.events.some((event) => event.table === 'pins')).toBe(false);
    expect(absent.imageCalls).toBe(0);
  });
});
