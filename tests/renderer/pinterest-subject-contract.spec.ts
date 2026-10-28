import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { buildWordPressArticleContext, normalizeForMatch, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import {
  buildArticleGrounding,
  formatVisualBrief,
  mainArticleObject,
  validateArticleGroundedPins,
  type ArticleGrounding,
} from '@/lib/pinterest/article-briefs';
import {
  GENERIC_SUBJECT_TERMS,
  SUBJECT_CONCEPTS,
  findSubjectConcepts,
  isGenericSubjectTerm,
  resolveHeadingSubject,
  subjectConcept,
} from '@/lib/pinterest/subject-concepts';
import { buildImagePromptRepairPrompt, imagePromptRepairTargets, repairImagePrompts } from '@/lib/pinterest/image-prompt-repair';
import { buildStrategySafeguardError } from '@/lib/pinterest/strategy-errors';

// Visual subject contract (subject-concepts.ts + article-briefs.ts), built on
// the real article that produced "Pin 1 does not clearly represent the
// article section. Expected: amigurumi. Detected: hat, ornament. Missing:
// amigurumi." Offline: no AI, Vision, image or WordPress call.

const POST = JSON.parse(readFileSync(join(__dirname, '../fixtures/pinterest/crochet-cat-amigurumi-post.json'), 'utf8')) as {
  title: string;
  excerpt: string;
  link: string;
  featuredImage: { url: string; alt: string; caption: string } | null;
  contentHtml: string;
};

function catContext(): WordPressArticleContext {
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

// Real Vision description of the "Christmas Kitty" photo (controlled run of 2026-10-28).
const KITTY_VISION =
  'Photo shows: A crocheted cat Christmas ornament dressed in a Santa hat and scarf. colors: cream, red, pink, dark brown, green. shape: A seated cat with a large round head, small body, two front paws, and a curled tail.';

function catGrounding(pins = 6, niche: string | null = 'Crochet'): ArticleGrounding {
  const context = catContext();
  return buildArticleGrounding(context, pins, { s2: [{ source: 'vision', text: KITTY_VISION }] }, { niche });
}

const sectionByHeading = (g: ArticleGrounding, start: string) =>
  Object.values(g.briefs).find((brief) => brief.sourceSection.startsWith(start))!;

function checkSection(g: ArticleGrounding, start: string, imagePrompt: string) {
  const sectionId = sectionByHeading(g, start).sectionId;
  return validateArticleGroundedPins([{ sourceSectionId: sectionId, image_prompt: imagePrompt }], { ...g, sectionPlan: [sectionId] });
}

// What the text model wrote for Pin 1 (Vision words, no "amigurumi"): the production error.
const KITTEN_ORNAMENT_ONLY =
  'A small seated cream crocheted kitten Christmas ornament wearing a red Santa hat, with a hanging loop on top, plain cream surface, soft natural light, craft product photography, photorealistic.';
const KITTEN_AMIGURUMI =
  'A small seated cream amigurumi crochet toy kitten wearing a red Santa hat and a scarf, with a hanging loop on top, plain cream surface, soft natural light, craft product photography, photorealistic.';

test.describe('Crochet: the amigurumi article', () => {
  test('the H1 subject is amigurumi, not the first object it names (ornament)', () => {
    expect(mainArticleObject(POST.title)).toBe('amigurumi');
    expect(mainArticleObject(POST.title, { language: 'en', niche: 'crochet' })).toBe('amigurumi');
  });

  test('each pattern section gets one primary subject; accessories never replace it', () => {
    const g = catGrounding();
    const primary = Object.values(g.briefs).map((brief) => [brief.sourceSection, brief.subjectContract?.primarySubjectId]);
    expect(primary).toEqual([
      ['1. Christmas Kitty: a small tree-hanging amigurumi', 'amigurumi'],
      ['2. No-sew Christmas cat bauble with a removable hat', 'ornament'],
      ['3. I Love My Cat: a heart-shaped ornament and applique', 'ornament'],
      ['4. Christmas cat with Santa hat: a three-part video make-along', 'amigurumi'],
      ['5. Chloe the Christmas Cat: an interactive ePattern', 'amigurumi'],
      // A hat for a real cat: here the hat is the project.
      ['6. Crochet Santa hat for a real cat: video and printable instructions', 'hat'],
    ]);
  });

  test('the contract keeps supporting elements from its own section only', () => {
    const kitty = sectionByHeading(catGrounding(), '1. Christmas Kitty').subjectContract!;
    expect(kitty).toMatchObject({
      primarySubjectId: 'amigurumi',
      requiredImageAnchors: ['amigurumi crochet toy'],
      inheritedFromTitle: false,
      evidence: ['section heading'],
    });
    expect(kitty.allowedSupportingElements).toEqual(expect.arrayContaining(['hat', 'ornament', 'scarf']));
    const heart = sectionByHeading(catGrounding(), '3. I Love My Cat').subjectContract!;
    expect(heart.allowedSupportingElements).not.toContain('hat');
    expect(heart.forbiddenElements).toContain('hat');
  });

  test('the brief asks for the explicit anchor and lists supporting elements', () => {
    const brief = formatVisualBrief(sectionByHeading(catGrounding(), '1. Christmas Kitty'));
    expect(brief).toContain('Required subject: the image description must explicitly mention amigurumi and must show a amigurumi as the visible, dominant main subject (write "amigurumi crochet toy")');
    expect(brief).toMatch(/Supporting elements \(only beside the amigurumi, never instead of it\): .*hat/);
  });

  test('an image showing only a hat / ornament is refused with the structured error', () => {
    const issues = checkSection(catGrounding(), '1. Christmas Kitty', KITTEN_ORNAMENT_ONLY);
    expect(issues.map((issue) => issue.reason)).toEqual(['IMAGE_SUBJECT_MISMATCH']);
    expect(issues[0].subject).toEqual({ expected: ['amigurumi'], detected: ['ornament', 'hat'], missing: ['amigurumi'], required: 'amigurumi' });
    const [shown] = buildStrategySafeguardError(issues).issues;
    expect(shown.message).toBe('Pin 1 does not clearly represent the article section. Expected: amigurumi. Detected: ornament, hat. Missing: amigurumi. Required subject: amigurumi.');
    expect(shown.action).toContain('the image must show amigurumi as its main subject');
  });

  test('a hat alone is refused', () => {
    const issues = checkSection(catGrounding(), '1. Christmas Kitty', 'A red crochet Santa hat on a plain cream surface, soft natural light, photorealistic.');
    expect(issues[0].subject).toMatchObject({ detected: ['hat'], missing: ['amigurumi'] });
  });

  test('an amigurumi with the hat its section allows is accepted', () => {
    expect(checkSection(catGrounding(), '1. Christmas Kitty', KITTEN_AMIGURUMI)).toEqual([]);
  });

  test('negated or generic words never count as the subject', () => {
    const g = catGrounding();
    expect(checkSection(g, '1. Christmas Kitty', 'A crochet Santa hat, no amigurumi, on a cream surface.')[0].subject?.missing).toEqual(['amigurumi']);
    for (const generic of ['crochet decoration', 'crochet craft', 'handmade item', 'handmade gift']) {
      const issues = checkSection(g, '1. Christmas Kitty', `A small cream ${generic} with a hanging loop on a plain surface.`);
      expect(issues.find((issue) => issue.reason === 'IMAGE_SUBJECT_MISMATCH')?.subject?.missing).toEqual(['amigurumi']);
    }
  });

  test('real Pin 3 answer (a "motif", never named as the ornament) is refused; the named ornament passes', () => {
    const g = catGrounding();
    const motif = 'A flat crocheted heart-shaped cat motif is centered as the only project, with a clear heart silhouette, cat ears, and embroidered facial features.';
    expect(checkSection(g, '3. I Love My Cat', motif)[0].subject).toMatchObject({ required: 'ornament', missing: ['ornament'] });
    expect(checkSection(g, '3. I Love My Cat', 'A flat heart-shaped crochet ornament with an embroidered cat face, overhead on a plain light gray surface.')).toEqual([]);
  });

  test('an element named only in another section is refused (local proof)', () => {
    const g = catGrounding();
    // The heart ornament section never mentions a hat; three other sections do.
    const issues = checkSection(g, '3. I Love My Cat', 'A flat heart-shaped crochet ornament with an embroidered cat face wearing a tiny Santa hat.');
    expect(issues.map((issue) => issue.reason)).toEqual(['UNGROUNDED_IMAGE_ELEMENTS']);
    expect(issues[0].details).toEqual(['hat']);
    // The same hat is fine where its section names it.
    expect(checkSection(g, '2. No-sew Christmas cat bauble', 'A small crocheted cat bauble with a removable Santa hat on a plain cream surface.')).toEqual([]);
  });

  test('without a known niche, heading hints (cat → amigurumi) never apply: the section inherits the H1', () => {
    const g = catGrounding(6, null);
    expect(sectionByHeading(g, '5. Chloe the Christmas Cat').subjectContract).toMatchObject({ primarySubjectId: 'amigurumi', inheritedFromTitle: true });
    expect(sectionByHeading(g, '1. Christmas Kitty').subjectContract?.primarySubjectId).toBe('amigurumi');
  });
});

test.describe('Step sections inherit the H1 subject', () => {
  function stepGrounding(title: string, niche = 'Crochet', language = 'en') {
    const html = ['<p>A soft toy for a calm weekend.</p>', '<h2>1. Make the head</h2><p>Work six single crochet in a magic ring and increase evenly.</p>', '<h2>2. Stuff the body</h2><p>Stuff firmly before closing the last round.</p>', '<h2>3. Attach the ears</h2><p>Pin both ears before sewing them on.</p>'].join('\n');
    const context = buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html, title, language });
    return buildArticleGrounding(context, 3, {}, { niche });
  }

  test('a step that names no project needs the H1 amigurumi', () => {
    const g = stepGrounding('Easy Amigurumi Bunny: Step by Step');
    for (const id of g.sectionPlan) {
      expect(g.briefs[id].subjectContract).toMatchObject({ primarySubjectId: 'amigurumi', inheritedFromTitle: true, evidence: ['inherited from the article title (H1)'] });
      expect(formatVisualBrief(g.briefs[id])).toContain('this step may be shown on it');
    }
    const check = (prompt: string) => validateArticleGroundedPins([{ sourceSectionId: g.sectionPlan[1], image_prompt: prompt }], { ...g, sectionPlan: [g.sectionPlan[1]] });
    expect(check('Hands stuffing a half-finished amigurumi crochet toy bunny body, soft natural light.')).toEqual([]);
    expect(check('A bag of fiberfill stuffing on a wooden table.')[0].subject).toMatchObject({ required: 'amigurumi', missing: ['amigurumi'] });
  });

  test('a German H1 is resolved through its aliases', () => {
    const g = stepGrounding('Gehäkelte Katze: Anleitung Schritt für Schritt', 'Crochet', 'de');
    expect(g.briefs[g.sectionPlan[0]].subjectContract?.primarySubjectId).toBe('amigurumi');
  });
});

test.describe('Concepts in English, German, French and Spanish', () => {
  const resolve = (heading: string, language: string) => resolveHeadingSubject(heading, { language, niche: 'crochet' });

  test('German', () => {
    expect(resolve('Gehäkeltes Kuscheltier mit Weihnachtsmütze', 'de')).toBe('amigurumi');
    expect(resolve('Katze mit Mütze: kostenlose Anleitung', 'de')).toBe('amigurumi');
    expect(resolve('Weihnachtsmütze für die Katze', 'de')).toBe('hat');
    expect(resolve('Häkeljacke im Patchwork-Stil', 'de')).toBe('cardigan');
    expect(resolve('Schal mit Fransen', 'de')).toBe('scarf');
  });

  test('French', () => {
    expect(resolve('Chat au crochet avec bonnet de Noël', 'fr')).toBe('amigurumi');
    expect(resolve('Bonnet de Noël pour chat', 'fr')).toBe('hat');
    expect(resolve('Écharpe torsadée pour l’hiver', 'fr')).toBe('scarf');
    expect(resolve('Boule de Noël chat au crochet', 'fr')).toBe('ornament');
  });

  test('Spanish', () => {
    expect(resolve('Gato amigurumi con gorro navideño', 'es')).toBe('amigurumi');
    expect(resolve('Adorno navideño de gato con gorro', 'es')).toBe('ornament');
    expect(resolve('Bufanda de ganchillo con flecos', 'es')).toBe('scarf');
    expect(resolve('Suéter oversize de crochet', 'es')).toBe('sweater');
  });

  test('English image prompts are read with the English spellings only', () => {
    expect(findSubjectConcepts('An amigurumi crochet toy cat with a scarf', { language: 'en' })).toEqual(['amigurumi', 'scarf']);
    // A real cat is not an amigurumi: animal words are heading hints, never image proof.
    expect(findSubjectConcepts('A tabby cat wearing a crochet Santa hat', { language: 'en' })).toEqual(['hat']);
  });

  test('every curated concept has an id, an anchor and English aliases; no alias is generic', () => {
    for (const concept of SUBJECT_CONCEPTS) {
      expect(concept.id.length).toBeGreaterThan(0);
      expect(concept.imageAnchor.length).toBeGreaterThan(0);
      expect(concept.aliases.en?.length).toBeGreaterThan(0);
      for (const spellings of Object.values(concept.aliases)) {
        for (const spelling of spellings ?? []) expect(isGenericSubjectTerm(spelling), `${concept.id}: ${spelling}`).toBe(false);
      }
    }
    for (const generic of ['object', 'item', 'craft', 'decoration', 'clothing', 'outfit', 'fashion']) {
      expect(GENERIC_SUBJECT_TERMS.map((term) => normalizeForMatch(term).trim())).toContain(generic);
      expect(resolveHeadingSubject(`A festive ${generic}`, { niche: 'crochet' })).toBeNull();
    }
    const amigurumi = subjectConcept('amigurumi')!;
    for (const language of ['en', 'de', 'fr', 'es'] as const) expect(amigurumi.aliases[language]?.length).toBeGreaterThan(0);
  });
});

test.describe('Clay, Home Decor and Recipes', () => {
  test('Clay: a vase section requires the vase and its anchor', () => {
    const context = buildWordPressArticleContext({
      sourceType: 'external_wordpress_post',
      html: '<p>Air dry clay ideas.</p><h2>1. Speckled bud vase</h2><p>A small air dry clay bud vase with a speckled finish. The finish is smooth and the piece is easy to make in one relaxed afternoon at home.</p><h2>2. Ring dish</h2><p>A round air dry clay trinket dish. The finish is smooth and the piece is easy to make in one relaxed afternoon at home.</p>',
      title: 'Air Dry Clay Ideas for a Calm Afternoon',
      language: 'en',
    });
    const g = buildArticleGrounding(context, 2, {}, { niche: 'Clay Crafts & DIY' });
    expect(g.sectionPlan.map((id) => g.briefs[id].subjectContract?.primarySubjectId)).toEqual(['vase', 'trinket dish']);
    expect(formatVisualBrief(g.briefs[g.sectionPlan[0]])).toContain('(write "clay vase")');
    const check = (index: number, prompt: string) => validateArticleGroundedPins([{ sourceSectionId: g.sectionPlan[index], image_prompt: prompt }], { ...g, sectionPlan: [g.sectionPlan[index]] });
    expect(check(0, 'A speckled air dry clay bud vase on a smooth board.')).toEqual([]);
    expect(check(1, 'A speckled air dry clay bud vase on a smooth board.')[0].subject).toMatchObject({ required: 'trinket dish' });
  });

  test('Home Decor: a bar cart section must show the bar cart; furniture of another section is refused', () => {
    const context = buildWordPressArticleContext({
      sourceType: 'external_wordpress_post',
      html: '<p>Art deco ideas for a modern living room.</p><h2>1. A brass bar cart as a functional detail</h2><p>A brass bar cart with two glass shelves in the living room. The finish is smooth and the piece is easy to make in one relaxed afternoon at home.</p><h2>2. A curved velvet sofa</h2><p>A green velvet sofa with soft curves in the living room. The finish is smooth and the piece is easy to make in one relaxed afternoon at home.</p>',
      title: 'Art Deco Living Room Ideas',
      language: 'en',
    });
    const g = buildArticleGrounding(context, 2, {}, { niche: 'Home Decor' });
    expect(g.subjectCheck).toBe('home-decor');
    expect(g.sectionPlan.map((id) => g.briefs[id].subjectContract?.primarySubjectId)).toEqual(['bar cart', 'sofa']);
    const check = (index: number, prompt: string) => validateArticleGroundedPins([{ sourceSectionId: g.sectionPlan[index], image_prompt: prompt }], { ...g, sectionPlan: [g.sectionPlan[index]] });
    expect(check(0, 'A modern living room with a brass bar cart holding two glass shelves, photorealistic.')).toEqual([]);
    const sofaOnly = check(0, 'A modern living room with a green velvet sofa and brass details, photorealistic.');
    expect(sofaOnly.map((issue) => issue.reason)).toEqual(['IMAGE_SUBJECT_MISMATCH', 'UNGROUNDED_IMAGE_ELEMENTS']);
    expect(sofaOnly[0].subject).toMatchObject({ required: 'bar cart', missing: ['bar cart'] });
    expect(sofaOnly[1].details).toContain('sofa');
  });

  test('Home Decor: room sections without a named piece keep the room check only', () => {
    const context = buildWordPressArticleContext({
      sourceType: 'external_wordpress_post',
      html: '<p>Calm kitchens.</p><h2>1. Sage green kitchen cabinets</h2><p>Sage green cabinets with brass handles in a bright kitchen. The finish is smooth and the piece is easy to make in one relaxed afternoon at home.</p>',
      title: 'Calm Kitchen Ideas',
      language: 'en',
    });
    const g = buildArticleGrounding(context, 1, {}, { niche: 'Home Decor' });
    expect(g.briefs[g.sectionPlan[0]].subjectContract).toBeUndefined();
  });

  test('Recipes: dishes are concepts with supporting ingredients; steps inherit the dish', () => {
    const lasagna = subjectConcept('lasagna')!;
    expect(lasagna).toMatchObject({ niches: ['recipes'], role: 'project', imageAnchor: 'baked lasagna' });
    expect(lasagna.supporting).toEqual(expect.arrayContaining(['tomato sauce']));
    expect(Object.keys(lasagna.aliases).sort()).toEqual(['de', 'en', 'es', 'fr']);
    const context = buildWordPressArticleContext({
      sourceType: 'external_wordpress_post',
      html: '<p>A moist loaf for breakfast.</p><h2>1. Mash the bananas</h2><p>Mash three ripe bananas with a fork until almost smooth, then stir in the melted butter and the sugar.</p><h2>2. Bake</h2><p>Bake for fifty minutes until golden, then let the loaf cool in the tin before slicing it.</p>',
      title: 'Easy Banana Bread: Two Simple Steps',
      language: 'en',
    });
    const g = buildArticleGrounding(context, 2, {}, { niche: 'Recipes' });
    for (const id of g.sectionPlan) expect(g.briefs[id].subjectContract).toMatchObject({ primarySubjectId: 'banana bread', inheritedFromTitle: true });
    expect(resolveHeadingSubject('Lasaña de verduras al horno', { language: 'es', niche: 'recipes' })).toBe('lasagna');
    expect(resolveHeadingSubject('Bananenbrot ohne Zucker', { language: 'de', niche: 'recipes' })).toBe('banana bread');
  });
});

test.describe('One targeted repair', () => {
  const pinsFor = (g: ArticleGrounding, prompt: string) => {
    const sectionId = sectionByHeading(g, '1. Christmas Kitty').sectionId;
    return { sectionId, pins: [{ sourceSectionId: sectionId, image_prompt: prompt, title: 'Kitten title', description: 'Kitten description' }] };
  };

  test('a subject mismatch becomes one repair target: name the anchor, keep allowed accessories', () => {
    const g = catGrounding();
    const { sectionId, pins } = pinsFor(g, KITTEN_ORNAMENT_ONLY);
    const scoped = { ...g, sectionPlan: [sectionId] };
    const targets = imagePromptRepairTargets(validateArticleGroundedPins(pins, scoped), pins, scoped)!;
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ pinIndex: 0, required: { id: 'amigurumi', anchor: 'amigurumi crochet toy' }, remove: [] });
    const { system, user } = buildImagePromptRepairPrompt(targets);
    expect(system).toContain('never add anything else');
    expect(user).toContain('The image must clearly show the primary subject amigurumi: write "amigurumi crochet toy" explicitly. The primary subject must remain visible and dominant.');
    expect(user).toMatch(/Supporting elements allowed \(only beside the amigurumi\): .*hat/);
  });

  test('accessories the section does not allow are listed for removal', () => {
    const g = catGrounding();
    const sectionId = sectionByHeading(g, '3. I Love My Cat').sectionId;
    const pins = [{ sourceSectionId: sectionId, image_prompt: 'A crocheted cat face wearing a Santa hat, plain surface.' }];
    const scoped = { ...g, sectionPlan: [sectionId] };
    const [target] = imagePromptRepairTargets(validateArticleGroundedPins(pins, scoped), pins, scoped)!;
    expect(target.required?.id).toBe('ornament');
    expect(target.remove).toEqual(['hat']);
  });

  test('success: only the image_prompt changes and the revalidation passes', async () => {
    const g = catGrounding();
    const { sectionId, pins } = pinsFor(g, KITTEN_ORNAMENT_ONLY);
    const scoped = { ...g, sectionPlan: [sectionId] };
    const targets = imagePromptRepairTargets(validateArticleGroundedPins(pins, scoped), pins, scoped)!;
    let calls = 0;
    const repaired = await repairImagePrompts(pins, targets, {
      generateText: async () => {
        calls += 1;
        return JSON.stringify({ pins: [{ pin: 1, image_prompt: KITTEN_AMIGURUMI }] });
      },
    });
    expect(calls).toBe(1);
    expect(repaired![0]).toEqual({ ...pins[0], image_prompt: KITTEN_AMIGURUMI });
    expect(validateArticleGroundedPins(repaired!, scoped)).toEqual([]);
  });

  test('failure: the revalidation still refuses it, with the required subject', async () => {
    const g = catGrounding();
    const { sectionId, pins } = pinsFor(g, KITTEN_ORNAMENT_ONLY);
    const scoped = { ...g, sectionPlan: [sectionId] };
    const targets = imagePromptRepairTargets(validateArticleGroundedPins(pins, scoped), pins, scoped)!;
    const repaired = await repairImagePrompts(pins, targets, { generateText: async () => JSON.stringify({ pins: [{ pin: 1, image_prompt: KITTEN_ORNAMENT_ONLY }] }) });
    const issues = validateArticleGroundedPins(repaired!, scoped);
    expect(issues[0].subject).toMatchObject({ required: 'amigurumi', missing: ['amigurumi'] });
    expect(await repairImagePrompts(pins, targets, { generateText: async () => 'not json' })).toBeNull();
  });

  test('other failures are not repaired', () => {
    const g = catGrounding();
    const { pins } = pinsFor(g, KITTEN_ORNAMENT_ONLY);
    expect(imagePromptRepairTargets([{ code: 'unsupported-claim', message: 'x', reason: 'MISSING_SOURCE_SECTION', pinIndex: 0, field: 'sourceSectionId' }], pins, g)).toBeNull();
    expect(imagePromptRepairTargets([], pins, g)).toBeNull();
  });
});
