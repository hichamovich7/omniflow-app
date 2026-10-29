import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { buildWordPressArticleContext, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import { buildArticleGrounding } from '@/lib/pinterest/article-briefs';
import { planVisualArchetypes } from '@/lib/pinterest/visual-archetypes';
import * as nicheResolve from '@/lib/niche/resolve';

// Production 500 "ReferenceError: context is not defined" (Auto variety,
// WordPress article → Pinterest). The source was correct: the production
// minifier inlined eligibleArchetypes() into the planVisualArchetypes()
// .map() callback and kept the shorthand keys `{ context, section, brief }`
// after renaming the parameters. Unminified tests could not see it, so the
// bundle case runs the compiled planner from `.next` (after `npx next build`;
// skipped without a build). Offline: no AI, Vision, Supabase or WordPress call.

function article(title: string, html: string, options: { language?: string; sourceType?: WordPressArticleContext['sourceType'] } = {}): WordPressArticleContext {
  return buildWordPressArticleContext({
    sourceType: options.sourceType ?? 'external_wordpress_post',
    html,
    title,
    excerpt: '',
    language: options.language ?? 'en',
    featuredImage: null,
    permalink: 'https://example.test/post/',
  });
}

const CAT_FIXTURE = JSON.parse(readFileSync(join(__dirname, '../fixtures/pinterest/crochet-cat-amigurumi-post.json'), 'utf8')) as {
  title: string;
  contentHtml: string;
};

const CROCHET_EN = article(
  'Autumn Crochet Cardigan: Steps & Color Ideas',
  `<p>This autumn crochet cardigan uses a textured stitch and a sideways body in warm rust and mustard wool.</p>
<h2>Materials</h2><p>Worsted weight wool yarn in rust and mustard, a 5 mm hook, stitch markers and a tapestry needle.</p>
<h3>1. Make a textured gauge swatch</h3><p>Work a swatch of the cardigan stitch in rust and mustard stripes. Row 1 sets the pattern, row 2 repeats it.</p>
<h3>2. Work the body sideways</h3><p>The body of the cardigan is worked sideways in rows with puff stitch in rust and mustard. Row 1 starts at the front edge, row 2 turns.</p>
<h3>3. Add ribbing and finish</h3><p>Add ribbing at the cuffs of the cardigan in mustard wool, then block the whole piece flat.</p>`,
  { sourceType: 'omniflow_article' }
);

const CROCHET_DE = article(
  'Häkeljacke für den Herbst: Anleitung Schritt für Schritt',
  `<p>Diese Häkeljacke für den Herbst wird seitlich gearbeitet.</p>
<h2>Materialien</h2><p>Wolle in Rost und Senf, eine Häkelnadel 5 mm und Maschenmarkierer.</p>
<h3>1. Maschenprobe häkeln</h3><p>Reihe 1 legt das Muster fest, Reihe 2 wiederholt es. Die Maschenprobe nach dem Spannen messen.</p>
<h3>2. Den Körper seitlich häkeln</h3><p>Reihe 1 beginnt an der Vorderkante, Reihe 2 wendet. Der Körper der Jacke wird in Reihen gehäkelt.</p>`,
  { language: 'de' }
);

const HOME_DECOR_DE = article(
  'Neo Deco Wohnzimmer: elegante Ideen für den Trend',
  `<p>Neo Deco interpretiert Art déco für das moderne Wohnzimmer mit Geometrie, Samt und glänzenden Details.</p>
<h2>1. Ein geschwungenes Samtsofa als Mittelpunkt</h2><p>Ein Sofa mit weichen Rundungen gibt dem Raum die typische Silhouette. Dunkelgrüner Samt wirkt tief und wohnlich.</p>
<h2>2. Ein Barwagen als funktionales Art-déco-Detail</h2><p>Ein Barwagen auf Rollen mit zwei Regalböden aus Glas verbindet Dekoration und Alltag. Chrom und Glas wirken klassisch.</p>
<h2>3. Samtvorhänge in Waldgrün oder Burgunderrot</h2><p>Schwere, weich fallende Vorhänge rahmen das Fenster neben dem Sofa. Waldgrün passt zu Walnuss und Creme.</p>`,
  { language: 'de' }
);

const CASES: Array<{ name: string; context: WordPressArticleContext; niche: string; pins: number }> = [
  { name: 'external WordPress post 2119 (Crochet, EN)', context: article(CAT_FIXTURE.title, CAT_FIXTURE.contentHtml), niche: 'Crochet', pins: 5 },
  { name: 'OmniFlow article (Crochet, EN, materials + steps)', context: CROCHET_EN, niche: 'Crochet', pins: 6 },
  { name: 'external WordPress post (Crochet, DE)', context: CROCHET_DE, niche: 'Crochet', pins: 4 },
  { name: 'external WordPress post (Home Decor, DE)', context: HOME_DECOR_DE, niche: 'Home Decor', pins: 4 },
];

type Planner = typeof planVisualArchetypes;

/** The compiled planVisualArchetypes() of the production server bundle, or null without a build. */
function loadBundledPlanner(): { planner: Planner; source: string } | null {
  const dir = join(__dirname, '../../.next/server/chunks');
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => join(dir, name))
    .find((path) => readFileSync(path, 'utf8').includes('"planVisualArchetypes",0,'));
  if (!file) return null;

  // Minimal Turbopack runtime: `e.i()` imports resolve by export name to the
  // real source modules the planner needs, `e.s()` collects the exports.
  const realImports: Record<string, unknown> = { ...nicheResolve };
  const inert: unknown = new Proxy(() => inert, { get: (_t, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => '' : inert), apply: () => inert });
  const imported = new Proxy({}, { get: (_t, key) => (typeof key === 'string' && key in realImports ? realImports[key] : inert) });
  const exported: Record<string, unknown> = {};
  const runtime = {
    i: () => imported,
    s: (list: unknown[]) => {
      for (let i = 0; i + 2 < list.length; i += 3) exported[String(list[i])] = list[i + 2];
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const entries = require(file) as unknown[];
  for (const entry of entries) if (typeof entry === 'function') (entry as (rt: typeof runtime) => void)(runtime);
  const planner = exported.planVisualArchetypes;
  return typeof planner === 'function' ? { planner: planner as Planner, source: readFileSync(file, 'utf8') } : null;
}

test.describe('Auto variety: the article context reaches every Pin (context is not defined)', () => {
  for (const { name, context, niche, pins } of CASES) {
    test(`source planner — ${name}: one archetype per Pin, built from this article`, () => {
      const grounding = buildArticleGrounding(context, pins, {}, { niche, visualStyle: 'auto-variety' });
      expect(grounding.sectionPlan.length).toBeGreaterThan(1);
      const plan = planVisualArchetypes(context, grounding.sectionPlan, grounding.briefs, niche);
      expect(plan).toHaveLength(grounding.sectionPlan.length);
      for (const archetype of plan) {
        if (!archetype) continue;
        // Materials come from this article's own list, never from another context.
        if (archetype.id === 'materials_and_tools' && context.materials.length >= 2) {
          expect(archetype.elements.join(' ')).toContain(context.materials.join(', '));
        }
      }
      if (niche === 'Home Decor') {
        expect(plan.map((archetype) => archetype?.id)).not.toContain('materials_and_tools');
      }
    });
  }

  test('production bundle: the compiled planner runs the .map() over several Pins and matches the source', () => {
    const bundle = loadBundledPlanner();
    test.skip(!bundle, 'No production build — run `npx next build` first');
    if (!bundle) return;
    // No shorthand `{…,context,…}` object left by the minifier (the old bundle had `{niche:K(n),context,section,brief,…}`).
    expect(bundle.source).not.toMatch(/[{,]context,section,brief[,}]/);
    for (const { context, niche, pins } of CASES) {
      const grounding = buildArticleGrounding(context, pins, {}, { niche, visualStyle: 'auto-variety' });
      const expected = planVisualArchetypes(context, grounding.sectionPlan, grounding.briefs, niche);
      expect(() => bundle.planner(context, grounding.sectionPlan, grounding.briefs, niche)).not.toThrow();
      expect(bundle.planner(context, grounding.sectionPlan, grounding.briefs, niche)).toEqual(expected);
    }
  });
});
