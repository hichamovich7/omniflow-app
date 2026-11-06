import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import * as wordpressPostSource from '@/lib/social/pinterest-from-wordpress-post';
import { buildWordPressArticleContext, subjectSections, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import {
  buildArticleGrounding,
  formatPinPlanForPrompt,
  planArticlePinSections,
  validateArticleGroundedPins,
} from '@/lib/pinterest/article-briefs';
import { classifyArticleKind } from '@/lib/pinterest/article-kind';
import { buildListicleAnglePlan } from '@/lib/pinterest/listicle';
import {
  INSUFFICIENT_ARTICLE_SECTIONS_CODE,
  listicleProjectSections,
  planListicleSectionAssignments,
  sectionAssignmentLogLine,
  validateSectionAssignments,
} from '@/lib/pinterest/section-assignment';
import { repairTitles, titleRepairMaxTokens, titleRepairProviderError, titleRepairTargets } from '@/lib/pinterest/title-repair';
import { buildStrategySafeguardError } from '@/lib/pinterest/strategy-errors';
import { openRouterPinsResponseSchema } from '@/lib/validations/pinterest';
import { buildPinterestPinsPrompt } from '@/lib/prompts';
import type { PinterestStrategyIssue } from '@/lib/pinterest/strategy';

// TASK-FIX-096 — deterministic section assignment for project galleries,
// built on the real article that failed in production (post 2360, "12 Easy
// Crochet Cardigan Patterns for Beginners"): Pins 1 and 2 shared a section
// (DUPLICATE_SOURCE_SECTION), Pin 9's title was too close to Pin 1's
// (DUPLICATE_TITLE), nothing was saved. Offline: no AI, Vision, image,
// WordPress or network call.

const POST = JSON.parse(readFileSync(join(__dirname, '../fixtures/pinterest/crochet-cardigan-patterns-post.json'), 'utf8')) as {
  id: number;
  title: string;
  excerpt: string;
  link: string;
  featuredImage: { url: string; alt: string; caption: string } | null;
  contentHtml: string;
};

function cardiganContext(): WordPressArticleContext {
  return buildWordPressArticleContext({
    sourceType: 'external_wordpress_post',
    html: POST.contentHtml,
    title: POST.title,
    excerpt: POST.excerpt,
    language: 'en',
    featuredImage: POST.featuredImage,
    permalink: POST.link,
  });
}

const PROJECT_IDS = ['s3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14'];
const PROJECT_TITLES = [
  'The Everyday Easy Crochet Cardigan',
  'Simple Crochet Cardigan by Viv Crochets',
  'Easy Rectangle Cardigan',
  'Fireside Cardigan with Pockets',
  'Cocoon Cardigan from a C2C Square',
  'Short-Sleeve Cardigan in Simple Panels',
  'Polka Crop Cardigan',
  'Elowen Hexagon Cardigan',
  'Easy One-Stitch Lace Cardigan',
  'Modern Granny Square Cardigan',
  'Granny Square Kimono Cardigan',
  'Grateful + Thankful Granny Cardigan',
];

// ── Extraction and assignment (pure) ─────────────────────────────────────

test.describe('Crochet Cardigans: eligible project sections', () => {
  test('the article is a project gallery with exactly its 12 numbered projects', () => {
    const context = cardiganContext();
    expect(classifyArticleKind(context)).toBe('project_listicle');
    const projects = listicleProjectSections(context);
    expect(projects.map((section) => section.id)).toEqual(PROJECT_IDS);
    expect(projects.map((section) => section.subject)).toEqual(PROJECT_TITLES);
  });

  test('never the introduction, a FAQ, general advice or the closing section', () => {
    const context = cardiganContext();
    const eligible = new Set(listicleProjectSections(context).map((section) => section.id));
    const excluded = context.sections.filter((section) => !eligible.has(section.id));
    expect(excluded.map((section) => section.kind).every((kind) => kind !== 'subject')).toBe(true);
    for (const heading of [
      'Choose your first cardigan by construction',
      '12 easy crochet cardigan patterns for beginners',
      'How to get a better fit on your first cardigan',
      'Frequently asked questions',
      'Are these patterns all free?',
      'Pick the project that will keep you crocheting',
    ]) {
      const section = context.sections.find((item) => item.heading === heading);
      expect(section, heading).toBeTruthy();
      expect(eligible.has(section!.id), heading).toBe(false);
    }
    expect(eligible.has('s0')).toBe(false);
  });

  test('12 Pins → 12 distinct sections, Pin 1 … Pin 12 on projects 1 … 12', () => {
    const plan = planListicleSectionAssignments(cardiganContext(), 12);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.assignments.map((item) => item.sourceSectionId)).toEqual(PROJECT_IDS);
    expect(plan.assignments.map((item) => item.sourceSectionIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(plan.assignments.map((item) => item.sourceSectionTitle)).toEqual(PROJECT_TITLES);
    expect(plan.assignments.map((item) => item.pinIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(plan.assignments.map((item) => item.sourceSectionId)).size).toBe(12);
  });

  test('10 Pins → 10 distinct sections, spread and stable', () => {
    const first = planListicleSectionAssignments(cardiganContext(), 10);
    const second = planListicleSectionAssignments(cardiganContext(), 10);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const ids = first.assignments.map((item) => item.sourceSectionId);
    expect(ids).toEqual(['s3', 's4', 's5', 's6', 's7', 's9', 's10', 's11', 's12', 's13']);
    expect(new Set(ids).size).toBe(10);
    expect(first.assignments.map((item) => item.sourceSectionIndex)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
  });

  test('more Pins than projects is refused, never reused', () => {
    expect(planListicleSectionAssignments(cardiganContext(), 13)).toEqual({ ok: false, requested: 13, available: 12 });
    // The planner fails closed: reused ids, and the duplicate check stays on.
    const ids = planArticlePinSections(cardiganContext(), 13, { articleKind: 'project_listicle' });
    expect(ids[12]).toBe('s3');
  });

  test('numbered sub-steps inside a project never count as projects', () => {
    const html = [
      '<p>Three easy crochet hats for beginners, each with its own pattern.</p>',
      '<h2>1. Ribbed Beanie</h2><p>A ribbed crochet beanie worked flat and seamed.</p>',
      '<h3>1. Materials</h3><p>Worsted yarn and a 5 mm hook.</p><h3>2. Ribbing</h3><p>Work back loop rows.</p>',
      '<h2>2. Slouchy Hat</h2><p>A slouchy crochet hat in half double crochet.</p>',
      '<h2>3. Bobble Hat</h2><p>A crochet hat with a bobble stitch band.</p>',
      '<h2>Frequently asked questions</h2><h3>Which hat is fastest?</h3><p>The beanie.</p>',
    ].join('');
    const context = buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html, title: '3 Easy Crochet Hat Patterns', language: 'en' });
    expect(listicleProjectSections(context).map((section) => section.subject)).toEqual(['Ribbed Beanie', 'Slouchy Hat', 'Bobble Hat']);
    expect(planListicleSectionAssignments(context, 4).ok).toBe(false);
  });
});

// ── Grounding, prompt and echo check ─────────────────────────────────────

function cardiganGrounding(pins = 12) {
  return buildArticleGrounding(cardiganContext(), pins, {}, { niche: 'Crochet', articleKind: 'project_listicle' });
}

const echoedPins = (count = 12) =>
  PROJECT_IDS.slice(0, count).map((sourceSectionId, index) => ({
    sourceSectionId,
    sourceSectionIndex: index + 1,
    sourceSectionTitle: PROJECT_TITLES[index],
    image_prompt: `A finished beginner crochet cardigan, the ${PROJECT_TITLES[index]}, laid flat on a plain white surface, overhead shot, soft natural light, craft product photography, photorealistic.`,
  }));

const sectionIssues = (issues: PinterestStrategyIssue[]) =>
  issues.filter((issue) => ['SOURCE_SECTION_MISMATCH', 'DUPLICATE_SOURCE_SECTION', 'MISSING_SOURCE_SECTION'].includes(issue.reason ?? ''));

test.describe('project_listicle: the assignment is fixed and checked', () => {
  test('the grounding carries one assignment per Pin; the prompt lists id, index and title', () => {
    const grounding = cardiganGrounding();
    expect(grounding.sectionPlan).toEqual(PROJECT_IDS);
    expect(grounding.sectionAssignments?.map((item) => item.sourceSectionId)).toEqual(PROJECT_IDS);
    const plan = formatPinPlanForPrompt(grounding);
    expect(plan).toContain('OmniFlow fixed this assignment');
    expect(plan).toContain('Pin 1 → sourceSectionId "s3", sourceSectionIndex 1, sourceSectionTitle "The Everyday Easy Crochet Cardigan"');
    expect(plan).toContain('Pin 12 → sourceSectionId "s14", sourceSectionIndex 12, sourceSectionTitle "Grateful + Thankful Granny Cardigan"');
    expect(plan).not.toMatch(/sourceSectionId "s1[5-9]"|sourceSectionId "s2\d"|sourceSectionId "s[0-2]"/);
  });

  test('every Pin keeping its slot passes the section checks', () => {
    expect(sectionIssues(validateArticleGroundedPins(echoedPins(), cardiganGrounding()))).toEqual([]);
  });

  test('a mutated sourceSectionId is rejected (the production Pin 1 / Pin 2 case)', () => {
    const pins = echoedPins();
    pins[1] = { ...pins[1], sourceSectionId: 's3' };
    const issues = sectionIssues(validateArticleGroundedPins(pins, cardiganGrounding()));
    expect(issues.map((issue) => [issue.reason, issue.pinIndex])).toEqual([
      ['SOURCE_SECTION_MISMATCH', 1],
      ['DUPLICATE_SOURCE_SECTION', 1],
    ]);
    expect(issues[0].details).toEqual(['2']);
  });

  test('two swapped Pins (still distinct) are rejected: the model cannot choose its section', () => {
    const pins = echoedPins();
    [pins[3], pins[4]] = [pins[4], pins[3]];
    const issues = sectionIssues(validateArticleGroundedPins(pins, cardiganGrounding()));
    expect(issues.map((issue) => [issue.reason, issue.pinIndex])).toEqual([
      ['SOURCE_SECTION_MISMATCH', 3],
      ['SOURCE_SECTION_MISMATCH', 4],
    ]);
  });

  test('a mutated sourceSectionIndex alone is rejected; a reworded title echo is not', () => {
    const wrongIndex = echoedPins();
    wrongIndex[5] = { ...wrongIndex[5], sourceSectionIndex: 9 };
    expect(sectionIssues(validateArticleGroundedPins(wrongIndex, cardiganGrounding())).map((issue) => issue.reason)).toEqual(['SOURCE_SECTION_MISMATCH']);
    const reworded = echoedPins();
    reworded[5] = { ...reworded[5], sourceSectionTitle: 'Kurzarm-Cardigan aus einfachen Teilen' };
    expect(sectionIssues(validateArticleGroundedPins(reworded, cardiganGrounding()))).toEqual([]);
  });

  test('a section outside the list is still MISSING_SOURCE_SECTION, never accepted', () => {
    const pins = echoedPins();
    pins[0] = { ...pins[0], sourceSectionId: 's17' };
    expect(sectionIssues(validateArticleGroundedPins(pins, cardiganGrounding())).map((issue) => issue.reason)).toEqual(['MISSING_SOURCE_SECTION']);
  });

  test('validateSectionAssignments checks each slot against the plan', () => {
    const plan = planListicleSectionAssignments(cardiganContext(), 3);
    if (!plan.ok) throw new Error('plan');
    const ids = plan.assignments.map((item) => item.sourceSectionId);
    expect(validateSectionAssignments([{ sourceSectionId: ids[0] }, { sourceSectionId: ids[1] }, { sourceSectionId: ids[2] }], ids, plan.assignments)).toEqual([]);
    expect(validateSectionAssignments([{ sourceSectionId: ids[1] }, { sourceSectionId: ids[0] }, { sourceSectionId: ids[2] }], ids, plan.assignments)).toHaveLength(2);
  });

  test('SOURCE_SECTION_MISMATCH is explained per Pin, retryable, without article text', () => {
    const pins = echoedPins();
    pins[1] = { ...pins[1], sourceSectionId: 's3' };
    const error = buildStrategySafeguardError(sectionIssues(validateArticleGroundedPins(pins, cardiganGrounding())));
    expect(error.retryable).toBe(true);
    expect(error.issues[0]).toMatchObject({ code: 'SOURCE_SECTION_MISMATCH', pinIndex: 2, field: 'sourceSectionId' });
    expect(error.issues[0].message).toBe('Pin 2 is not built from the article project OmniFlow assigned to it (project #2).');
    expect(JSON.stringify(error)).not.toContain('Viv Crochets');
  });

  test('the log line carries section ids and counts only', () => {
    const line = sectionAssignmentLogLine('verified', PROJECT_IDS);
    expect(JSON.parse(line)).toEqual({ stage: 'verified', pins: 12, sections: PROJECT_IDS, distinct: true });
    expect(JSON.parse(sectionAssignmentLogLine('verified', ['s3', 's3'])).distinct).toBe(false);
    expect(line).not.toContain('Cardigan');
  });

  test('the response schema accepts the echoed index (number or digits) and title', () => {
    const base = { angle: 'curiosity', title: 't', description: 'd', keywords: 'k', board: 'b', image_prompt: 'p', visualFormat: 'photo', sourceSectionId: 's3' };
    const parsed = openRouterPinsResponseSchema.parse({ pins: [{ ...base, sourceSectionIndex: '3', sourceSectionTitle: 'x' }, { ...base, sourceSectionIndex: 4 }, base] });
    expect(parsed.pins.map((pin) => pin.sourceSectionIndex)).toEqual([3, 4, undefined]);
    expect(openRouterPinsResponseSchema.safeParse({ pins: [{ ...base, sourceSectionIndex: 'three' }] }).success).toBe(false);
  });
});

// ── Title repair gate ────────────────────────────────────────────────────

test.describe('title repair after the section fix', () => {
  const pins = () => echoedPins().map((pin, index) => ({ ...pin, angle: 'curiosity' as const, title: `Title ${index}`, description: 'd' }));
  const duplicateTitle: PinterestStrategyIssue = { code: 'near-duplicate-title', message: 'x', reason: 'DUPLICATE_TITLE', pinIndex: 8, pinIndexes: [0, 8], field: 'title' };

  test('a near-duplicate title on distinct sections is still repaired', () => {
    const targets = titleRepairTargets([duplicateTitle], pins(), { listicleNumber: '12', focusOf: () => 'focus' });
    expect(targets?.map((target) => target.pinIndex)).toEqual([8]);
  });

  test('the repair call leaves room for a reasoning model (was 440 tokens for one Pin)', async () => {
    expect(titleRepairMaxTokens(1)).toBe(2360);
    expect(titleRepairMaxTokens(3)).toBe(3080);
    const calls: number[] = [];
    const target = titleRepairTargets([duplicateTitle], pins(), { listicleNumber: '12', focusOf: () => 'focus' })!;
    await repairTitles(pins(), target, { language: 'English', sourceTitle: POST.title, listicleNumber: '12', titles: pins().map((pin) => pin.title), evidence: '' }, {
      generateText: async (params) => {
        calls.push(params.maxTokens);
        return '{"titles":[]}';
      },
      validate: () => [],
    });
    expect(calls).toEqual([2360]);
  });

  test('a failed repair call logs a fixed error category (production: empty answer)', async () => {
    const target = titleRepairTargets([duplicateTitle], pins(), { listicleNumber: '12', focusOf: () => 'focus' })!;
    const run = (error: Error) =>
      repairTitles(pins(), target, { language: 'English', sourceTitle: POST.title, listicleNumber: '12', titles: [], evidence: '' }, {
        generateText: async () => {
          throw error;
        },
        validate: () => [],
      });
    expect((await run(new Error('OpenRouter returned empty response'))).stats).toEqual({ pins: 1, parsed: false, rejected: 'provider_error', providerError: 'empty_response' });
    expect((await run(new Error('OpenRouter error: 400'))).stats.providerError).toBe('http_error');
    expect((await run(new DOMException('aborted', 'AbortError'))).stats.providerError).toBe('timeout');
    expect(titleRepairProviderError(new Error('OpenRouter stream error: x'))).toBe('stream_error');
    expect(titleRepairProviderError('boom')).toBe('other');
  });

  test('a duplicate section blocks the title repair', () => {
    const duplicateSection: PinterestStrategyIssue = { code: 'unsupported-claim', message: 'x', reason: 'DUPLICATE_SOURCE_SECTION', pinIndex: 1, pinIndexes: [0, 1], field: 'sourceSectionId' };
    const mismatch: PinterestStrategyIssue = { code: 'unsupported-claim', message: 'x', reason: 'SOURCE_SECTION_MISMATCH', pinIndex: 1, field: 'sourceSectionId' };
    expect(titleRepairTargets([duplicateTitle, duplicateSection], pins(), { listicleNumber: '12', focusOf: () => 'f' })).toBeNull();
    expect(titleRepairTargets([duplicateTitle, mismatch], pins(), { listicleNumber: '12', focusOf: () => 'f' })).toBeNull();
  });
});

// ── Non-regression: other kinds and flows ────────────────────────────────

test.describe('tips_guide, generic_article, Keyword and Research are unchanged', () => {
  const TIPS_HTML = [
    '<p>Air-dry clay rewards patience: these tips help beginners avoid cracks.</p>',
    '<h2>1. Knead the clay before you start</h2><p>Knead the clay for a few minutes until it is smooth and warm.</p>',
    '<h2>2. Keep a damp sponge nearby</h2><p>Smooth small cracks with a damp sponge as you work.</p>',
    '<h2>3. Let it dry slowly</h2><p>Dry each piece on a wire rack away from direct heat.</p>',
  ].join('');
  const GENERIC_HTML = [
    '<p>A short guide about crochet hooks.</p>',
    '<h2>Aluminum hooks</h2><p>Aluminum hooks are light, smooth and fast for most yarns, and they glide through acrylic without snagging the loops.</p>',
    '<h2>Bamboo hooks</h2><p>Bamboo hooks are warm to hold, grip slippery yarn a little better and feel gentle on the hands during long sessions.</p>',
  ].join('');
  const tips = () => buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html: TIPS_HTML, title: '3 Air-Dry Clay Tips for Beginners', language: 'en' });
  const generic = () => buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html: GENERIC_HTML, title: 'Choosing a Crochet Hook', language: 'en' });

  test('tips_guide: same plan as before (sections reused past the count), no assignment', () => {
    const context = tips();
    expect(classifyArticleKind(context)).toBe('tips_guide');
    const legacy = planArticlePinSections(context, 5);
    expect(planArticlePinSections(context, 5, { articleKind: 'tips_guide' })).toEqual(legacy);
    expect(legacy).toEqual(['s1', 's2', 's3', 's1', 's2']);
    const grounding = buildArticleGrounding(context, 5, {}, { niche: 'Clay', articleKind: 'tips_guide' });
    expect(grounding.sectionAssignments).toBeUndefined();
    expect(formatPinPlanForPrompt(grounding)).not.toContain('sourceSectionIndex');
    // Reuse stays allowed on tips guides: no duplicate rejection.
    const issues = validateArticleGroundedPins(
      legacy.map((sourceSectionId) => ({ sourceSectionId, image_prompt: 'Hands kneading air dry clay on a wooden board, overhead, photorealistic.' })),
      grounding
    );
    expect(issues.filter((issue) => issue.reason === 'DUPLICATE_SOURCE_SECTION')).toEqual([]);
  });

  test('generic_article: same plan as before, no assignment', () => {
    const context = generic();
    expect(classifyArticleKind(context)).toBe('generic_article');
    expect(planArticlePinSections(context, 4, { articleKind: 'generic_article' })).toEqual(planArticlePinSections(context, 4));
    expect(subjectSections(context).map((section) => section.id)).toEqual(['s1', 's2']);
    expect(buildArticleGrounding(context, 4, {}, { niche: 'Crochet', articleKind: 'generic_article' }).sectionAssignments).toBeUndefined();
  });

  test('Keyword / Research prompts carry no section fields; article prompts only when locked', () => {
    const base = { keyword: 'crochet cardigan', language: 'en' as const, pinsRequested: 5, textOverlayMode: 'never' as const };
    const keyword = buildPinterestPinsPrompt(base).user;
    expect(keyword).not.toContain('sourceSectionId');
    expect(keyword).not.toContain('sourceSectionIndex');
    const research = buildPinterestPinsPrompt({ ...base, analysisContext: 'Theme: crochet cardigans' }).user;
    expect(research).not.toContain('sourceSectionIndex');
    const article = buildPinterestPinsPrompt({ ...base, articleGrounded: true }).user;
    expect(article).toContain('"sourceSectionId": "s1"');
    expect(article).not.toContain('sourceSectionIndex');
    const locked = buildPinterestPinsPrompt({ ...base, articleGrounded: true, lockedSections: true }).user;
    expect(locked).toContain('"sourceSectionIndex": 1');
    expect(locked).toContain('Pin N always uses line N');
    const tipsPrompt = buildPinterestPinsPrompt({ ...base, articleGrounded: true, tipsGuide: true, lockedSections: true }).user;
    expect(tipsPrompt).not.toContain('sourceSectionIndex');
  });
});

// ── Route: POST /api/pinterest/generate ──────────────────────────────────

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = '22222222-2222-4222-8222-222222222222';
const SITE = 'https://crochet.ciencia-y-tecnologia.com';
const CARDIGAN_POST = {
  ...POST,
  date: '2026-11-01T00:00:00',
  status: 'publish',
  categories: ['Crochet Cardigans'],
  categoryIds: [],
  tags: [],
};
const cardiganRequest = (pinsRequested: number) => ({
  projectId: PROJECT_ID,
  keyword: 'easy crochet cardigan patterns',
  language: 'en',
  pinsRequested,
  generationMode: 'photo-only',
  wordpressPost: { siteId: SITE_ID, postId: POST.id },
});

// Listicle plan of a project gallery (TASK-083, TASK-FIX-098): ~30 % numbered
// Pins — slots 1, 4, 7, 10 of 12 and 1, 5, 8 of 10 — the others rotate.
const galleryAngles = (count: number) => buildListicleAnglePlan(count, { articleKind: 'project_listicle' });
// Every title that can sit on a numbered slot (12 or 10 Pins) carries the count 12.
const TITLES = [
  '12 Easy Crochet Cardigans to Start With the Everyday One',
  'Why Viv Crochets Keeps Its Simple Cardigan So Calm',
  'Fold a Rectangle Into Your First Cardigan: 12 Patterns',
  'Pockets on a Fireside Cardigan, One of 12 to Save',
  'Start With a C2C Square: Cocoon Pick From 12 Patterns',
  'Short Sleeves, Simple Panels and No Shaping Stress',
  'One Polka Crop Among 12 Beginner Cardigan Patterns',
  'The Elowen Hexagon Layer Among These 12 Picks',
  'Lace for Beginners: 12 Wearable Cardigan Projects',
  'Granny Squares Become a Modern Layer in This List of 12',
  'Kimono Drape From Squares: 12 Patterns to Try',
  'Thankful Granny Motifs for a Relaxed Fall Layer',
];
// Pin 9 rewritten too close to Pin 1 (the production DUPLICATE_TITLE).
const NEAR_DUPLICATE_TITLE = '12 Easy Crochet Cardigans to Start With the Everyday Lace One';

function cardiganPlan(options: { sectionIds?: string[]; titles?: string[] } = {}) {
  const ids = options.sectionIds ?? PROJECT_IDS;
  const titles = options.titles ?? TITLES;
  const angles = galleryAngles(ids.length);
  return JSON.stringify({
    pins: ids.map((sourceSectionId, index) => ({
      angle: angles[index],
      title: titles[index],
      description: `Project ${index + 1} of this beginner cardigan roundup: ${PROJECT_TITLES[index]}. Save this Pin and open the article for the full pattern link.`,
      keywords: `crochet cardigan, beginner crochet, cardigan pattern ${index + 1}`,
      board: 'Crochet Cardigans',
      image_prompt: `A finished beginner crochet cardigan, the ${PROJECT_TITLES[index]}, scene ${index + 1}, laid flat on a plain white surface, overhead shot, soft natural light, craft product photography, photorealistic.`,
      sourceSectionId,
      sourceSectionIndex: PROJECT_IDS.indexOf(sourceSectionId) + 1,
      sourceSectionTitle: PROJECT_TITLES[PROJECT_IDS.indexOf(sourceSectionId)],
      visualFormat: 'photo',
    })),
  });
}

interface RecordedEvent {
  table: string;
  op: 'insert' | 'update';
  row: unknown;
}

interface Harness {
  post: (body: unknown) => Promise<Response>;
  events: RecordedEvent[];
  textCalls: Array<{ user?: string }>;
  visionCalls: number;
  imageCalls: number;
  logs: string[];
}

async function withRoute(steps: string[], run: (harness: Harness) => Promise<void>): Promise<void> {
  const harness: Harness = {
    post: async () => {
      throw new Error('not initialised');
    },
    events: [],
    textCalls: [],
    visionCalls: 0,
    imageCalls: 0,
    logs: [],
  };
  const project = { id: PROJECT_ID, description: null, niche: 'Crochet', user_id: 'user-1', default_language: 'en' };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }) },
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        insert: (row: unknown) => {
          harness.events.push({ table, op: 'insert', row });
          return query;
        },
        update: (row: unknown) => {
          harness.events.push({ table, op: 'update', row });
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
    '@/lib/rate-limit': {
      checkRateLimit: async () => ({ allowed: true }),
      rateLimitErrorResponse: () => {
        throw new Error('rate limit response must not be reached');
      },
    },
    '@/lib/ai/engine': {
      generateText: async (params: { messages?: Array<{ content: string }> }) => {
        // System + user: the <pin_plan> travels in the system message (analysis context).
        harness.textCalls.push({ user: params.messages?.map((message) => message.content).join('\n') });
        const step = steps.shift();
        if (step === undefined) throw new Error('unexpected AI call');
        return step;
      },
      analyzeImage: async () => {
        harness.visionCalls++;
        throw new Error('Vision is best-effort in this test');
      },
      generateImage: async () => {
        harness.imageCalls++;
        throw new Error('Image generation must not be called');
      },
      resolveImageModel: () => {
        harness.imageCalls++;
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
          CARDIGAN_POST,
          { id: SITE_ID, project_id: PROJECT_ID, site_url: SITE },
          { niche: 'Crochet', description: null, default_language: 'en' }
        ),
        contentStreams: [],
        nicheSettings: null,
      }),
    },
  };

  const routeKey = require.resolve('@/app/api/pinterest/generate/route');
  const keys = [...Object.keys(fakes).map((specifier) => require.resolve(specifier)), routeKey];
  const originals = new Map(keys.map((key) => [key, require.cache[key]]));
  const originalFetch = globalThis.fetch;
  const original = { error: console.error, log: console.log, warn: console.warn };
  try {
    for (const [specifier, exports] of Object.entries(fakes)) {
      const filename = require.resolve(specifier);
      require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [], path: '', parent: null, isPreloading: false, require } as unknown as NodeJS.Module;
    }
    delete require.cache[routeKey];
    globalThis.fetch = (async () => {
      throw new Error('No network call is allowed in this test');
    }) as typeof fetch;
    const capture = (...args: unknown[]) => harness.logs.push(args.map(String).join(' '));
    console.error = capture;
    console.log = capture;
    console.warn = capture;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require('@/app/api/pinterest/generate/route') as { POST: (request: Request) => Promise<Response> };
    harness.post = (body) =>
      route.POST(new Request('http://localhost/api/pinterest/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    await run(harness);
  } finally {
    console.error = original.error;
    console.log = original.log;
    console.warn = original.warn;
    globalThis.fetch = originalFetch;
    for (const [key, value] of originals) {
      if (value) require.cache[key] = value;
      else delete require.cache[key];
    }
  }
}

const inserts = (events: RecordedEvent[], table: string) => events.filter((event) => event.table === table && event.op === 'insert');
const sectionOf = (row: unknown) => (JSON.parse((row as { image_analysis: string }).image_analysis) as { _articleSource?: { sectionId: string } })._articleSource?.sectionId;

test.describe('POST /api/pinterest/generate — Crochet Cardigans', () => {
  test('12 Pins: one text call, 12 Pins saved on 12 distinct projects, no image call', async () => {
    await withRoute([cardiganPlan()], async (harness) => {
      const response = await harness.post(cardiganRequest(12));
      const body = await response.json();
      expect(response.status, JSON.stringify(body.error)).toBe(201);
      expect(harness.textCalls).toHaveLength(1);
      expect(harness.textCalls[0].user).toContain('Pin 9 → sourceSectionId "s11", sourceSectionIndex 9');
      expect(harness.imageCalls).toBe(0);
      const rows = inserts(harness.events, 'pins')[0].row as unknown[];
      expect(rows).toHaveLength(12);
      expect(rows.map(sectionOf)).toEqual(PROJECT_IDS);
      const logged = harness.logs.filter((line) => line.includes('Section assignment:')).map((line) => JSON.parse(line.slice(line.indexOf('{'))));
      expect(logged).toEqual([
        { stage: 'planned', pins: 12, eligibleSections: 12, sections: PROJECT_IDS, distinct: true },
        { stage: 'verified', pins: 12, sections: PROJECT_IDS, distinct: true },
      ]);
    });
  });

  test('13 Pins: 422 insufficient_article_sections before any AI call or write', async () => {
    await withRoute([], async (harness) => {
      const response = await harness.post(cardiganRequest(13));
      const body = await response.json();
      expect(response.status).toBe(422);
      expect(body.error.code).toBe(INSUFFICIENT_ARTICLE_SECTIONS_CODE);
      expect(body.error.retryable).toBe(false);
      expect(body.error.message).toContain('This article lists 12 projects, but 13 Pins were requested');
      expect(harness.textCalls).toHaveLength(0);
      expect(harness.visionCalls).toBe(0);
      expect(harness.imageCalls).toBe(0);
      expect(harness.events).toEqual([]);
    });
  });

  test('the production failure (Pin 2 on Pin 1\'s section + near-duplicate Pin 9): 422, no title repair, nothing saved', async () => {
    const ids = [...PROJECT_IDS];
    ids[1] = 's3';
    const titles = [...TITLES];
    titles[8] = NEAR_DUPLICATE_TITLE;
    await withRoute([cardiganPlan({ sectionIds: ids, titles })], async (harness) => {
      const response = await harness.post(cardiganRequest(12));
      const body = await response.json();
      expect(response.status).toBe(422);
      expect(body.error.code).toBe('strategy_safeguard_failed');
      const codes = body.error.issues.map((issue: { code: string }) => issue.code);
      expect(codes).toContain('DUPLICATE_SOURCE_SECTION');
      expect(codes).toContain('SOURCE_SECTION_MISMATCH');
      // One call only: a batch with a section failure never goes to the title repair.
      expect(harness.textCalls).toHaveLength(1);
      expect(harness.logs.some((line) => line.includes('Title repair:'))).toBe(false);
      expect(inserts(harness.events, 'pins')).toEqual([]);
      expect(harness.imageCalls).toBe(0);
      expect(harness.events.some((event) => event.table === 'generations' && event.op === 'update' && (event.row as { status?: string }).status === 'failed')).toBe(true);
    });
  });

  test('distinct sections + near-duplicate title only: the title repair still runs, sections are kept', async () => {
    const titles = [...TITLES];
    titles[8] = NEAR_DUPLICATE_TITLE;
    const repair = JSON.stringify({ titles: [{ pinIndex: 9, candidates: ['One-Stitch Lace Layers Among 12 Beginner Cardigan Patterns'] }] });
    await withRoute([cardiganPlan({ titles }), repair], async (harness) => {
      const response = await harness.post(cardiganRequest(12));
      const body = await response.json();
      expect(response.status, JSON.stringify(body.error)).toBe(201);
      expect(harness.textCalls).toHaveLength(2);
      const rows = inserts(harness.events, 'pins')[0].row as Array<{ title: string; description: string; keywords: string }>;
      expect(rows[8].title).toBe('One-Stitch Lace Layers Among 12 Beginner Cardigan Patterns');
      expect(rows.map(sectionOf)).toEqual(PROJECT_IDS);
      // Only the title changed: descriptions and keywords are the model's.
      const original = JSON.parse(cardiganPlan({ titles })).pins;
      expect(rows.map((row) => row.description)).toEqual(original.map((pin: { description: string }) => pin.description));
      expect(rows.map((row) => row.keywords)).toEqual(original.map((pin: { keywords: string }) => pin.keywords));
      expect(harness.imageCalls).toBe(0);
    });
  });

  test('a mutated sourceSectionId alone (swap, still distinct): 422, nothing saved', async () => {
    const ids = [...PROJECT_IDS];
    [ids[3], ids[4]] = [ids[4], ids[3]];
    await withRoute([cardiganPlan({ sectionIds: ids })], async (harness) => {
      const response = await harness.post(cardiganRequest(12));
      const body = await response.json();
      expect(response.status).toBe(422);
      expect(body.error.issues.map((issue: { code: string }) => issue.code)).toEqual(['SOURCE_SECTION_MISMATCH', 'SOURCE_SECTION_MISMATCH']);
      expect(inserts(harness.events, 'pins')).toEqual([]);
      expect(harness.imageCalls).toBe(0);
    });
  });

  test('10 Pins: 10 distinct projects saved in plan order', async () => {
    const plan = planListicleSectionAssignments(cardiganContext(), 10);
    if (!plan.ok) throw new Error('plan');
    const ids = plan.assignments.map((item) => item.sourceSectionId);
    const angles = galleryAngles(10);
    const pins = JSON.parse(cardiganPlan()).pins.slice(0, 10).map((pin: Record<string, unknown>, index: number) => ({
      ...pin,
      angle: angles[index],
      sourceSectionId: ids[index],
      sourceSectionIndex: plan.assignments[index].sourceSectionIndex,
      sourceSectionTitle: plan.assignments[index].sourceSectionTitle,
    }));
    // 10 Pins: 3 numbered (TASK-FIX-098), the others rotate on three angles (TASK-083).
    await withRoute([JSON.stringify({ pins })], async (harness) => {
      const response = await harness.post(cardiganRequest(10));
      const body = await response.json();
      expect(response.status, JSON.stringify(body.error)).toBe(201);
      const rows = inserts(harness.events, 'pins')[0].row as unknown[];
      expect(rows.map(sectionOf)).toEqual(ids);
      expect(new Set(rows.map(sectionOf)).size).toBe(10);
    });
  });
});
