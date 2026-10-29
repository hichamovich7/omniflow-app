import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { buildWordPressArticleContext, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import {
  appendArticleVisualBrief,
  attachArticleSourceMetadata,
  buildArticleGrounding,
  formatPinPlanForPrompt,
  formatVisualBrief,
  readArticleSourceMetadata,
  validateArticleGroundedPins,
  type ArticleGrounding,
} from '@/lib/pinterest/article-briefs';
import {
  NICHE_ARCHETYPE_ORDER,
  VISUAL_ARCHETYPE_IDS,
  assignPinArchetypes,
  eligibleArchetypes,
  findMaterialsHeading,
  planVisualArchetypes,
  withVisualArchetype,
  type PinVisualArchetype,
  type VisualArchetypeId,
} from '@/lib/pinterest/visual-archetypes';
import { readPinVisualArchetype } from '@/lib/social/pin-display';
import { generatePinsSchema, AUTO_VARIETY_REQUIRES_ARTICLE_MESSAGE } from '@/lib/validations/pinterest';
import { getMediaProfile } from '@/lib/media/media-profiles';

// TASK-078 Phase A — visual archetypes and the Auto variety planner.
// Offline: no AI, Vision, image, storage or WordPress call. Articles are
// small fixtures (EN, DE, FR, ES) plus the real post 2119 fixture.

function article(title: string, html: string, language = 'en'): WordPressArticleContext {
  return buildWordPressArticleContext({
    sourceType: 'external_wordpress_post',
    html,
    title,
    excerpt: '',
    language,
    featuredImage: null,
    permalink: 'https://example.test/post/',
  });
}

// TASK-079: Auto variety now renders some archetypes as composed templates
// (pinterest-composer.spec.ts). These tests cover the TASK-078 archetype
// planner itself: every slot keeps its planned archetype, no template.
function auto(context: WordPressArticleContext, pins: number, niche: string): ArticleGrounding {
  const grounding = buildArticleGrounding(context, pins, {}, { niche, visualStyle: 'auto-variety' });
  return {
    ...grounding,
    pinArchetypes: planVisualArchetypes(context, grounding.sectionPlan, grounding.briefs, niche),
    pinTemplates: undefined,
  };
}

const ids = (grounding: ArticleGrounding) => (grounding.pinArchetypes ?? []).map((archetype) => archetype?.id ?? null);

const CROCHET_EN = article(
  'Autumn Crochet Cardigan: Steps & Color Ideas',
  `<p>This autumn crochet cardigan uses a textured stitch and a sideways body in warm rust and mustard wool.</p>
<h2>Materials</h2><p>Worsted weight wool yarn in rust and mustard, a 5 mm hook, stitch markers and a tapestry needle.</p>
<h3>1. Measure yourself and select a size</h3><p>Measure around the fullest part of your bust and compare it with a cardigan you already like. Row 1 of the size chart is the bust, row 2 is the length.</p>
<h3>2. Make and measure a textured gauge swatch</h3><p>Work a swatch in the main stitch pattern with rust and mustard stripes, and measure it after blocking. Row 1 sets the pattern, row 2 repeats it.</p>
<h3>3. Work the body sideways</h3><p>The body of the cardigan is worked sideways in rows with puff stitch in rust and mustard. Row 1 starts at the front edge, row 2 turns.</p>
<h3>4. Add ribbing and finish</h3><p>Add ribbing at the cuffs of the cardigan in mustard wool, then block the whole piece flat.</p>`
);

const CLAY_EN = article(
  'Air Dry Clay Trinket Dish: Easy Steps & Painting Ideas',
  `<p>These air dry clay trinket dishes are easy to shape and paint for a small gift.</p>
<h2>What you'll need</h2><p>Air dry clay, a rolling pin, a small bowl as a mold, acrylic paint and varnish.</p>
<h2>How to make the trinket dish</h2><p>Step 1: roll the air dry clay flat. Step 2: cut a circle and press the trinket dish into the bowl. Step 3: let it dry for 24 hours.</p>
<h2>Painting ideas for the trinket dish</h2><p>Paint the trinket dish in pink, green or terracotta with a glossy finish and a floral motif.</p>`
);

const HOME_DECOR_DE = article(
  'Neo Deco Wohnzimmer: elegante Ideen für den Trend',
  `<p>Neo Deco interpretiert Art déco für das moderne Wohnzimmer mit Geometrie, Samt und glänzenden Details.</p>
<h2>1. Ein geschwungenes Samtsofa als Mittelpunkt</h2><p>Ein Sofa mit weichen Rundungen gibt dem Raum die typische Silhouette. Dunkelgrüner Samt wirkt tief und wohnlich.</p>
<h2>2. Ein Barwagen als funktionales Art-déco-Detail</h2><p>Ein Barwagen auf Rollen mit zwei Regalböden aus Glas verbindet Dekoration und Alltag. Chrom und Glas wirken klassisch.</p>
<h2>3. Samtvorhänge in Waldgrün oder Burgunderrot</h2><p>Schwere, weich fallende Vorhänge rahmen das Fenster neben dem Sofa. Waldgrün passt zu Walnuss und Creme.</p>`,
  'de'
);

const RECIPE_EN = article(
  'Lemon Garlic Pasta in 20 Minutes',
  `<p>This lemon garlic pasta is ready in 20 minutes and makes a bright weeknight dinner.</p>
<h2>Ingredients</h2><p>Spaghetti, lemon, garlic, olive oil, parmesan and parsley.</p>
<h2>How to cook the lemon garlic pasta</h2><p>Step 1: boil the spaghetti in salted water. Step 2: sauté the garlic in olive oil. Step 3: toss the pasta with lemon and parmesan.</p>
<h2>Serving the pasta</h2><p>Serve the lemon garlic pasta in a white bowl with extra parmesan and parsley on top for a bright weeknight dinner.</p>`
);

/** A crochet article with neither a materials list nor numbered steps. */
const NO_STEPS_EN = article(
  'Three Cozy Crochet Blankets',
  `<p>Three blankets for the sofa this winter.</p>
<h2>Chunky blanket</h2><p>A chunky crochet blanket with a soft texture that keeps you warm on the sofa all winter long.</p>
<h2>Granny square blanket</h2><p>A colorful granny square crochet blanket that uses up scraps in many shades for a cheerful throw.</p>
<h2>Baby blanket</h2><p>A light crochet baby blanket with a smooth surface, perfect as a gift for a new baby in spring.</p>`
);

const LOCALIZED: Array<{ language: string; title: string; html: string }> = [
  {
    language: 'de',
    title: 'Häkeljacke für den Herbst: Anleitung Schritt für Schritt',
    html: `<p>Diese Häkeljacke für den Herbst wird seitlich gearbeitet.</p>
<h2>Materialien</h2><p>Wolle in Rost und Senf, eine Häkelnadel 5 mm und Maschenmarkierer.</p>
<h3>1. Maschenprobe häkeln</h3><p>Reihe 1 legt das Muster fest, Reihe 2 wiederholt es. Die Maschenprobe nach dem Spannen messen.</p>
<h3>2. Den Körper seitlich häkeln</h3><p>Reihe 1 beginnt an der Vorderkante, Reihe 2 wendet. Der Körper der Jacke wird in Reihen gehäkelt.</p>
<h3>3. Bündchen anhäkeln</h3><p>Reihe 1 der Bündchen in Senf, Reihe 2 in Rost, dann alles flach spannen.</p>`,
  },
  {
    language: 'fr',
    title: "Gilet au crochet pour l'automne : tutoriel étape par étape",
    html: `<p>Ce gilet au crochet pour l'automne se travaille sur le côté.</p>
<h2>Matériel</h2><p>De la laine rouille et moutarde, un crochet de 5 mm et des marqueurs de mailles.</p>
<h3>1. Réaliser un échantillon</h3><p>Étape 1 : crocheter l'échantillon. Étape 2 : le mesurer après blocage.</p>
<h3>2. Crocheter le corps sur le côté</h3><p>Rang 1 commence au bord avant, rang 2 tourne. Le corps du gilet se travaille en rangs.</p>
<h3>3. Ajouter les côtes</h3><p>Rang 1 des côtes en moutarde, rang 2 en rouille, puis bloquer la pièce à plat.</p>`,
  },
  {
    language: 'es',
    title: 'Cárdigan de ganchillo para otoño: tutorial paso a paso',
    html: `<p>Este cárdigan de ganchillo para otoño se teje de lado.</p>
<h2>Materiales</h2><p>Lana color óxido y mostaza, un ganchillo de 5 mm y marcadores de puntos.</p>
<h3>1. Tejer una muestra</h3><p>Paso 1: tejer la muestra. Paso 2: medirla después del bloqueo.</p>
<h3>2. Tejer el cuerpo de lado</h3><p>Fila 1 empieza en el borde delantero, fila 2 gira. El cuerpo del cárdigan se teje en filas.</p>
<h3>3. Añadir el elástico</h3><p>Fila 1 del elástico en mostaza, fila 2 en óxido, después bloquear la pieza.</p>`,
  },
];

const CAT_FIXTURE = JSON.parse(readFileSync(join(__dirname, '../fixtures/pinterest/crochet-cat-amigurumi-post.json'), 'utf8')) as {
  title: string;
  contentHtml: string;
};
const CAT_EN = article(CAT_FIXTURE.title, CAT_FIXTURE.contentHtml);

test.describe('Classic (default) keeps the former behavior', () => {
  test('no visual style → no archetype plan, no archetype in the prompt or the briefs', () => {
    const classic = buildArticleGrounding(CROCHET_EN, 4, {}, { niche: 'Crochet' });
    const explicit = buildArticleGrounding(CROCHET_EN, 4, {}, { niche: 'Crochet', visualStyle: 'classic' });
    expect(classic.pinArchetypes).toBeUndefined();
    expect(explicit).toEqual(classic);
    const prompt = formatPinPlanForPrompt(classic);
    expect(prompt).not.toContain('Visual archetype');
    Object.values(classic.briefs).forEach((brief) => {
      expect(brief.archetype).toBeUndefined();
      expect(formatVisualBrief(brief)).not.toContain('Visual archetype');
    });
  });

  test('the request schema defaults to classic, and Auto variety is refused without an article', () => {
    const base = { projectId: '11111111-1111-4111-8111-111111111111', keyword: 'crochet cardigan', language: 'en', pinsRequested: 3, generationMode: 'photo-only' };
    const keyword = generatePinsSchema.safeParse(base);
    expect(keyword.success && keyword.data.visualStyle).toBe('classic');
    const refused = generatePinsSchema.safeParse({ ...base, visualStyle: 'auto-variety' });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0].message).toBe(AUTO_VARIETY_REQUIRES_ARTICLE_MESSAGE);
    const article = generatePinsSchema.safeParse({
      ...base,
      visualStyle: 'auto-variety',
      wordpressPost: { siteId: '22222222-2222-4222-8222-222222222222', postId: 1957 },
    });
    expect(article.success && article.data.visualStyle).toBe('auto-variety');
    expect(generatePinsSchema.safeParse({ ...base, visualStyle: 'viral' }).success).toBe(false);
  });
});

test.describe('Archetype selection follows the article', () => {
  test('Crochet (EN): steps and a materials list → tutorial and materials layouts, all different', () => {
    const grounding = auto(CROCHET_EN, 4, 'Crochet');
    const plan = ids(grounding);
    expect(plan).toHaveLength(4);
    expect(plan.every(Boolean)).toBe(true);
    expect(new Set(plan).size).toBe(4);
    expect(plan).toContain('tutorial_steps');
    expect(plan).toContain('materials_and_tools');
  });

  test('materials come from the article only: listed materials, never invented ones', () => {
    const grounding = auto(CROCHET_EN, 4, 'Crochet');
    const materials = grounding.pinArchetypes!.find((archetype) => archetype?.id === 'materials_and_tools')!;
    const text = materials.elements.join(' ');
    expect(text).toContain('wool');
    expect(text).toContain('worsted');
    expect(text).not.toMatch(/cotton yarn|mohair|alpaca|acrylic/);
  });

  test('no materials and no steps → never a materials or tutorial layout', () => {
    const plan = ids(auto(NO_STEPS_EN, 3, 'Crochet'));
    expect(plan.every(Boolean)).toBe(true);
    expect(plan).not.toContain('materials_and_tools');
    expect(plan).not.toContain('tutorial_steps');
    expect(findMaterialsHeading(NO_STEPS_EN)).toBeNull();
  });

  test('the amigurumi roundup (post 2119): no step or materials layout it cannot back', () => {
    const grounding = auto(CAT_EN, 5, 'Crochet');
    grounding.sectionPlan.forEach((sectionId, index) => {
      const archetype = grounding.pinArchetypes![index];
      if (!archetype) return;
      const section = CAT_EN.sections.find((item) => item.id === sectionId)!;
      expect(eligibleArchetypes(CAT_EN, section, grounding.briefs[sectionId], 'Crochet')).toContain(archetype.id);
    });
    // Required subject untouched by the archetype: every stored brief still asks for the amigurumi anchor when the contract does.
    grounding.sectionPlan.forEach((sectionId, index) => {
      const brief = withVisualArchetype(grounding.briefs[sectionId], grounding.pinArchetypes![index]);
      expect(brief.subjectContract).toEqual(grounding.briefs[sectionId].subjectContract);
    });
  });

  test('Clay (EN): steps, materials and colors are used; every layout differs', () => {
    const plan = ids(auto(CLAY_EN, 3, 'Clay'));
    expect(plan.every(Boolean)).toBe(true);
    expect(new Set(plan).size).toBe(plan.length);
    const sections = CLAY_EN.sections.filter((section) => section.kind === 'subject');
    const stepSection = sections.find((section) => section.heading.startsWith('How to make'))!;
    const brief = auto(CLAY_EN, 3, 'Clay').briefs[stepSection.id];
    const eligible = eligibleArchetypes(CLAY_EN, stepSection, brief, 'Clay');
    expect(eligible).toContain('tutorial_steps');
    expect(eligible).toContain('materials_and_tools');
    expect(eligible).toContain('hands_in_action');
  });

  test('Home Decor (DE): room layouts only — no tutorial, materials, hands or finished-object layout', () => {
    const grounding = auto(HOME_DECOR_DE, 3, 'Home Decor');
    const plan = ids(grounding);
    expect(plan.every(Boolean)).toBe(true);
    expect(new Set(plan).size).toBe(3);
    expect(plan[0]).toBe('hero_lifestyle');
    for (const forbidden of ['tutorial_steps', 'materials_and_tools', 'hands_in_action', 'finished_project', 'recipe_card'] as VisualArchetypeId[]) {
      expect(plan).not.toContain(forbidden);
    }
  });

  test('Recipes (EN): final dish, ingredients and recipe layouts; never a product showcase', () => {
    const grounding = auto(RECIPE_EN, 3, 'Recipes');
    const plan = ids(grounding);
    expect(plan.every(Boolean)).toBe(true);
    expect(new Set(plan).size).toBe(3);
    expect(plan[0]).toBe('finished_project');
    expect(plan).not.toContain('product_showcase');
    const ingredients = grounding.pinArchetypes!.find((archetype) => archetype?.id === 'materials_and_tools' || archetype?.id === 'recipe_card');
    expect(ingredients?.elements.join(' ')).toContain('"Ingredients"');
  });

  for (const { language, title, html } of LOCALIZED) {
    test(`Crochet (${language.toUpperCase()}): materials heading and step markers are recognized`, () => {
      const context = article(title, html, language);
      expect(findMaterialsHeading(context)).not.toBeNull();
      const plan = ids(auto(context, 3, 'Crochet'));
      expect(plan.every(Boolean)).toBe(true);
      expect(new Set(plan).size).toBe(3);
      expect(plan).toContain('tutorial_steps');
      expect(plan).toContain('materials_and_tools');
    });
  }

  test('every niche order only names known archetypes', () => {
    for (const order of Object.values(NICHE_ARCHETYPE_ORDER)) {
      order.forEach((id) => expect(VISUAL_ARCHETYPE_IDS).toContain(id));
      expect(new Set(order).size).toBe(order.length);
    }
  });
});

test.describe('Controlled diversity', () => {
  test('deterministic: same article, niche and count → same plan', () => {
    expect(ids(auto(CROCHET_EN, 6, 'Crochet'))).toEqual(ids(auto(CROCHET_EN, 6, 'Crochet')));
  });

  test('more Pins than sections: no repeat before the eligible archetypes run out, never twice in a row', () => {
    for (const [context, niche] of [[CROCHET_EN, 'Crochet'], [CLAY_EN, 'Clay'], [HOME_DECOR_DE, 'Home Decor'], [RECIPE_EN, 'Recipes']] as const) {
      const grounding = auto(context, 7, niche);
      const plan = ids(grounding);
      expect(plan).toHaveLength(7);
      for (let index = 1; index < plan.length; index += 1) {
        expect(plan[index], `${niche} Pin ${index + 1}`).not.toBe(plan[index - 1]);
      }
      const eligibleUnion = new Set(
        grounding.sectionPlan.flatMap((sectionId) =>
          eligibleArchetypes(context, context.sections.find((section) => section.id === sectionId)!, grounding.briefs[sectionId], niche)
        )
      );
      const firstRepeat = plan.findIndex((id, index) => plan.indexOf(id) !== index);
      if (firstRepeat >= 0) expect(new Set(plan.slice(0, firstRepeat)).size).toBeGreaterThanOrEqual(Math.min(eligibleUnion.size - 1, firstRepeat));
    }
  });

  test('a Pin returned on another section takes that section\'s slot, else keeps the classic brief', () => {
    const a = { id: 'tutorial_steps', label: 'A', composition: 'a', elements: [] } as PinVisualArchetype;
    const b = { id: 'collage_grid', label: 'B', composition: 'b', elements: [] } as PinVisualArchetype;
    const c = { id: 'finished_project', label: 'C', composition: 'c', elements: [] } as PinVisualArchetype;
    expect(assignPinArchetypes(['s1', 's2', 's3'], [a, b, c], ['s1', 's2', 's3'])).toEqual([a, b, c]);
    expect(assignPinArchetypes(['s1', 's2', 's3'], [a, b, c], ['s2', 's1', 's3'])).toEqual([b, a, c]);
    expect(assignPinArchetypes(['s1', 's2'], [a, b], ['s1', 's9'])).toEqual([a, null]);
    expect(assignPinArchetypes(['s1', 's1'], [a, b], ['s1', 's1'])).toEqual([a, b]);
    expect(assignPinArchetypes(['s1'], [a], [undefined])).toEqual([null]);
  });
});

test.describe('The article stays the source of truth', () => {
  test('the subject contract comes before the archetype, and the archetype forbids written text', () => {
    const grounding = auto(CROCHET_EN, 4, 'Crochet');
    grounding.sectionPlan.forEach((sectionId, index) => {
      const brief = withVisualArchetype(grounding.briefs[sectionId], grounding.pinArchetypes![index]);
      const text = formatVisualBrief(brief);
      const archetypeAt = text.indexOf('Visual archetype:');
      expect(archetypeAt).toBeGreaterThan(-1);
      if (brief.subjectContract) expect(text.indexOf('Required subject:')).toBeLessThan(archetypeAt);
      expect(text).toContain('No written step text, numbers, labels or lists inside the image');
      // The fixed forbidden list (text, logos, brand names) is never removed.
      expect(brief.forbiddenElements).toEqual(grounding.briefs[sectionId].forbiddenElements);
      expect(text).not.toMatch(/https?:\/\//);
    });
  });

  test('the per-Pin plan reaches the text prompt after the section assignment', () => {
    const prompt = formatPinPlanForPrompt(auto(CROCHET_EN, 4, 'Crochet'));
    expect(prompt).toContain('Visual archetype for Pin 1:');
    expect(prompt).toContain('Visual archetype for Pin 4:');
    expect(prompt).toContain('the required subject of the section brief stays the dominant main subject');
  });

  test('safeguards still reject an object absent from the article and a missing subject', () => {
    const grounding = auto(CROCHET_EN, 4, 'Crochet');
    const [first] = grounding.sectionPlan;
    const invented = validateArticleGroundedPins(
      [{ sourceSectionId: first, image_prompt: 'Overhead flat-lay of a rust crochet cardigan with mohair yarn and a crochet hat beside it, photorealistic.' }],
      grounding
    );
    expect(invented.map((issue) => issue.reason)).toContain('UNGROUNDED_IMAGE_ELEMENTS');
    const noSubject = validateArticleGroundedPins(
      [{ sourceSectionId: first, image_prompt: 'Overhead flat-lay of rust and mustard wool skeins and a hook on a wooden table, photorealistic.' }],
      grounding
    );
    expect(noSubject.map((issue) => issue.reason)).toContain('IMAGE_SUBJECT_MISMATCH');
  });

  test('a styling-props allowance is replaced only by layouts that need more elements', () => {
    const grounding = auto(CROCHET_EN, 4, 'Crochet');
    const brief = grounding.briefs[grounding.sectionPlan[0]];
    const props = (value: typeof brief) => value.allowedElements.some((element) => element.startsWith('at most one or two'));
    expect(props(brief)).toBe(true);
    const materials = grounding.pinArchetypes!.find((archetype) => archetype?.id === 'materials_and_tools')!;
    expect(props(withVisualArchetype(brief, materials))).toBe(false);
    const finished = { id: 'finished_project', label: 'Finished project', composition: 'x', elements: [] } as PinVisualArchetype;
    expect(props(withVisualArchetype(brief, finished))).toBe(true);
    expect(withVisualArchetype(brief, null)).toBe(brief);
  });
});

test.describe('Persistence and image regeneration', () => {
  test('the archetype is stored on the Pin, read back, appended to the image prompt and shown as a label', () => {
    const grounding = auto(CROCHET_EN, 4, 'Crochet');
    const sectionId = grounding.sectionPlan[1];
    const brief = withVisualArchetype(grounding.briefs[sectionId], grounding.pinArchetypes![1]);
    const json = attachArticleSourceMetadata(JSON.stringify({ _pinterestStrategy: { angle: 'curiosity' } }), {
      sourceType: 'external_wordpress_post',
      sectionId,
      brief,
    });
    const stored = readArticleSourceMetadata(json)!;
    expect(stored.brief.archetype).toEqual(grounding.pinArchetypes![1]);
    // Regenerate image: generate-images appends the stored brief, archetype included.
    const prompt = appendArticleVisualBrief('Base image prompt.', json);
    expect(prompt).toContain(`Visual archetype: ${grounding.pinArchetypes![1]!.label}`);
    expect(readPinVisualArchetype(json)).toBe(grounding.pinArchetypes![1]!.label);
    // Other metadata kept.
    expect(JSON.parse(json)._pinterestStrategy).toEqual({ angle: 'curiosity' });
  });

  test('classic and older Pins: no label, unchanged image prompt; a malformed archetype is dropped', () => {
    const grounding = buildArticleGrounding(CROCHET_EN, 2, {}, { niche: 'Crochet' });
    const sectionId = grounding.sectionPlan[0];
    const brief = grounding.briefs[sectionId];
    const json = attachArticleSourceMetadata(null, { sourceType: 'external_wordpress_post', sectionId, brief });
    expect(readPinVisualArchetype(json)).toBeNull();
    expect(appendArticleVisualBrief('Base.', json)).not.toContain('Visual archetype');
    expect(readPinVisualArchetype(null)).toBeNull();
    expect(appendArticleVisualBrief('Keyword Pin prompt.', null)).toBe('Keyword Pin prompt.');

    const malformed = attachArticleSourceMetadata(null, {
      sourceType: 'external_wordpress_post',
      sectionId,
      brief: { ...brief, archetype: { id: 'copy_this_pin', label: 'x', composition: 'y', elements: [] } as unknown as PinVisualArchetype },
    });
    const read = readArticleSourceMetadata(malformed)!;
    expect(read.brief.archetype).toBeUndefined();
    expect(appendArticleVisualBrief('Base.', malformed)).not.toContain('Visual archetype');
  });

  test('the Pin image profile is still 1000×1500 JPEG', () => {
    const profile = getMediaProfile('pinterest-pin');
    expect(profile.resize).toMatchObject({ width: 1000, height: 1500 });
    expect(profile.format).toBe('jpeg');
  });
});
