import { expect, test } from 'playwright/test';
import { buildWordPressArticleContext, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import {
  attachArticleSourceMetadata,
  buildArticleGrounding,
  formatPinPlanForPrompt,
  subjectCheckForNiche,
  validateArticleGroundedPins,
  type ArticleGrounding,
} from '@/lib/pinterest/article-briefs';
import { checkHomeDecorSubject, findHomeAnchors, findUngroundedHomeTerms, normalizeGerman } from '@/lib/pinterest/home-decor-anchors';
import { buildStrategySafeguardError } from '@/lib/pinterest/strategy-errors';
import { attachPinterestStrategyMetadata } from '@/lib/pinterest/strategy';
import { buildArticlePinterestSource, regenerateArticlePin } from '@/lib/social/pinterest-from-article';

/**
 * TASK-067 — Home Organization & Decor image check. Offline: no AI call
 * (fetch is trapped), no WordPress write (the article context is frozen).
 */

const SITE = 'https://wohnen.example.test';

// German Home Decor article: H2 per room, colors, furniture, materials, photos.
const GERMAN_HTML = `
<p>Farbe bringt Leben in jedes Zuhause. Diese Ideen zeigen mutige Farben in echten Räumen. Mehr auf <a href="${SITE}/farben">unserer Seite</a>.</p>
<h2>1. Grüne und orange Küche mit Holzinsel</h2>
<figure><img src="${SITE}/kueche.jpg" alt="Küche mit grünen Schränken"><figcaption>Foto: Wohnen</figcaption></figure>
<p>Die Küchenschränke sind salbeigrün lackiert, die Kücheninsel aus Eichenholz trägt orange Barhocker aus Metall. Messinggriffe setzen warme Akzente.</p>
<h2>2. Gemütliches Wohnzimmer in Terrakotta</h2>
<p>Ein Sofa aus Samt in Terrakotta steht vor einer cremeweißen Wand. Ein Teppich aus Jute und Kissen in Senfgelb runden das Wohnzimmer ab.</p>
<h3>Tipp: Kissen kombinieren</h3>
<p>Kurz.</p>
<h2>3. Blaues Schlafzimmer mit Rattan</h2>
<p>Das Bett mit Kopfteil aus Rattan steht vor einer marineblauen Wand. Leinenbettwäsche in Weiß und eine Lampe aus Messing.</p>`;

const ENGLISH_HTML = `
<p>Color brings life to every home, and these real rooms show bold palettes at work.</p>
<h2>1. A Green and Orange Kitchen</h2>
<p>Sage green cabinets meet an oak island with orange metal bar stools and brass handles.</p>
<h2>2. A Cozy Terracotta Living Room</h2>
<p>A terracotta velvet sofa sits against a cream wall with a jute rug and mustard cushions.</p>
<h2>3. A Blue Bedroom with Rattan</h2>
<p>A rattan headboard stands against a navy wall, with white linen bedding and a brass lamp.</p>`;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function homeContext(language: 'de' | 'en'): WordPressArticleContext {
  return deepFreeze(
    buildWordPressArticleContext({
      sourceType: 'external_wordpress_post',
      html: language === 'de' ? GERMAN_HTML : ENGLISH_HTML,
      title: language === 'de' ? 'Farbige Wohnideen: 3 mutige Räume' : 'Colorful Home Ideas: 3 Bold Rooms',
      language,
      siteId: 'site-1',
      wordpressPostId: 42,
      permalink: `${SITE}/farbige-wohnideen/`,
    })
  );
}

function homeGrounding(language: 'de' | 'en', pins = 3, niche: string | null = 'Home Decor'): ArticleGrounding {
  return buildArticleGrounding(homeContext(language), pins, {}, { niche });
}

const KITCHEN = 'A bright kitchen with sage green cabinets, an oak wood kitchen island and orange metal bar stools, vertical 2:3, natural light, photorealistic.';
const LIVING = 'A cozy living room with a terracotta velvet sofa, a jute rug and mustard cushions against a cream wall, vertical 2:3, photorealistic.';
const BEDROOM = 'A calm bedroom with a rattan headboard against a navy wall, white linen bedding and a brass lamp, vertical 2:3, photorealistic.';

function pins(g: ArticleGrounding, prompts: string[]) {
  return g.sectionPlan.map((sourceSectionId, index) => ({ sourceSectionId, image_prompt: prompts[index] }));
}

let fetchCalls = 0;
const realFetch = globalThis.fetch;
test.beforeEach(() => {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error('network disabled in offline tests');
  }) as typeof fetch;
});
test.afterEach(() => {
  expect(fetchCalls).toBe(0);
  globalThis.fetch = realFetch;
});

test.describe('German normalization and controlled vocabulary', () => {
  test('case, umlauts, ß, plurals, inflections and compounds map to English anchors', () => {
    expect(normalizeGerman('Küche  GROßE Schränke')).toBe(' kueche grosse schraenke ');
    expect(findHomeAnchors('Küchenschränke', 'de')).toEqual(expect.arrayContaining(['kitchen', 'cabinets']));
    expect(findHomeAnchors('Kueche', 'de')).toEqual(['kitchen']);
    expect(findHomeAnchors('salbeigrüne Wände', 'de')).toEqual(expect.arrayContaining(['sage', 'green']));
    expect(findHomeAnchors('Eichenholz', 'de')).toEqual(['wood']);
    expect(findHomeAnchors('marineblauen', 'de')).toEqual(expect.arrayContaining(['navy', 'blue']));
    expect(findHomeAnchors('cremeweißen', 'de')).toEqual(expect.arrayContaining(['cream', 'white']));
  });

  test('look-alike German words create no anchor (no free translation)', () => {
    for (const word of ['Kuchen', 'Frost', 'Brot', 'Grundriss', 'Gründe', 'minimalistisch', 'dramatisch']) {
      const found = findHomeAnchors(word, 'de');
      expect(found.filter((term) => ['kitchen', 'rust', 'red', 'green', 'table'].includes(term)), word).toEqual([]);
    }
    expect(findHomeAnchors('Barhocker', 'de')).toEqual(['bar stool']);
    // German spellings are not used for English text.
    expect(findHomeAnchors('Küche', 'en')).toEqual([]);
  });

  test('the niche selects the check: Home Decor aliases vs Crochet / Clay / unknown', () => {
    for (const niche of ['Home Organization & Decor', 'Home Decor', 'home-decor', 'Home Décor', 'Interior Design']) expect(subjectCheckForNiche(niche)).toBe('home-decor');
    for (const niche of ['Crochet', 'Clay Crafts & DIY', 'Clay', 'Food & Recipes', 'Something else', null]) expect(subjectCheckForNiche(niche)).toBe('project');
  });
});

test.describe('Home Decor sections are validated by their visual anchors', () => {
  test('1. German Home Decor: faithful English image prompts pass', () => {
    const g = homeGrounding('de');
    expect(g.subjectCheck).toBe('home-decor');
    expect(g.enforceVocabulary).toBe(false);
    expect(g.sectionPlan).toEqual(['s1', 's2', 's4']);
    expect(validateArticleGroundedPins(pins(g, [KITCHEN, LIVING, BEDROOM]), g)).toEqual([]);
  });

  test('1b. before the fix, the same German Pins failed (project check kept for other niches)', () => {
    const g = homeGrounding('de', 3, 'Crochet');
    const issues = validateArticleGroundedPins(pins(g, [KITCHEN, LIVING, BEDROOM]), g);
    expect(issues.map((issue) => issue.reason)).toContain('IMAGE_SUBJECT_MISMATCH');
  });

  test('2. English Home Decor: faithful prompts pass and need no "project" word', () => {
    const g = homeGrounding('en');
    expect(validateArticleGroundedPins(pins(g, [KITCHEN, LIVING, BEDROOM]), g)).toEqual([]);
    expect(KITCHEN).not.toMatch(/project|pattern/i);
  });

  test('3. a living room is not accepted for a kitchen section (and vice versa)', () => {
    for (const language of ['de', 'en'] as const) {
      const g = homeGrounding(language);
      const issues = validateArticleGroundedPins(pins(g, [LIVING, KITCHEN, BEDROOM]), g);
      const mismatched = issues.filter((issue) => issue.reason === 'IMAGE_SUBJECT_MISMATCH').map((issue) => issue.pinIndex);
      expect(mismatched, language).toEqual([0, 1]);
      expect(issues[0].subject?.expected).toContain('kitchen');
      expect(issues[0].subject?.detected).toContain('living room');
      expect(issues[0].subject?.missing).toContain('kitchen');
    }
  });

  test('4. colors present in the article are accepted; the palette is part of the expected anchors', () => {
    const g = homeGrounding('de');
    const kitchen = checkHomeDecorSubject('A kitchen with sage green cabinets and orange bar stools.', g.sectionTexts!.s1, g.evidence, 'de');
    expect(kitchen.ok).toBe(true);
    expect(kitchen.expected).toEqual(expect.arrayContaining(['kitchen', 'green', 'orange', 'sage', 'wood', 'metal', 'brass']));
    expect(findUngroundedHomeTerms('A kitchen with sage green cabinets and orange bar stools.', g.evidence, 'de')).toEqual([]);
  });

  test('5. furniture, materials or colors absent from the article are rejected (German article too)', () => {
    const g = homeGrounding('de');
    const invented = KITCHEN.replace('oak wood kitchen island', 'marble kitchen island next to a fireplace and a red leather sofa');
    const issues = validateArticleGroundedPins(pins(g, [invented, LIVING, BEDROOM]), g);
    const ungrounded = issues.find((issue) => issue.reason === 'UNGROUNDED_IMAGE_ELEMENTS');
    expect(ungrounded?.pinIndex).toBe(0);
    expect(ungrounded?.details).toEqual(expect.arrayContaining(['marble', 'fireplace', 'red', 'leather']));
    // The sofa is only in the living room section: furniture is checked per section, so it is refused in the kitchen.
    expect(ungrounded?.details).toContain('sofa');
    // Negated mentions and neutral backdrops are not claims.
    const negated = validateArticleGroundedPins([{ sourceSectionId: 's1', image_prompt: 'A kitchen with green cabinets, no marble, white walls, gray floor, green plants.' }], g);
    expect(negated).toEqual([]);
  });

  test('6. a generic interior is rejected', () => {
    for (const language of ['de', 'en'] as const) {
      const g = homeGrounding(language);
      const generic = ['A beautiful stylish interior, soft natural light, vertical 2:3.', 'A cozy and inviting home interior with warm light.', 'A cozy interior with soft light.'];
      const issues = validateArticleGroundedPins(pins(g, generic), g).filter((issue) => issue.reason === 'IMAGE_SUBJECT_MISMATCH');
      expect(issues.map((issue) => issue.pinIndex), language).toEqual([0, 1, 2]);
      expect(issues[0].subject?.detected).toEqual(['generic interior']);
    }
  });

  test('7. a completely off-topic image is rejected', () => {
    const g = homeGrounding('de');
    const issues = validateArticleGroundedPins(pins(g, ['A plate of pasta with basil, overhead food photography.', 'A crochet scarf laid flat.', 'A mountain landscape at sunset.']), g);
    expect(issues.filter((issue) => issue.reason === 'IMAGE_SUBJECT_MISMATCH')).toHaveLength(3);
  });

  test('a section without a room still needs two of its own anchors', () => {
    const context = buildWordPressArticleContext({
      sourceType: 'external_wordpress_post',
      html: '<p>Farbpaletten für das Zuhause, die wirklich funktionieren und lange schön bleiben.</p><h2>Salbeigrün und Terrakotta kombinieren</h2><p>Salbeigrün und Terrakotta wirken zusammen ruhig, besonders mit Leinen und hellem Holz.</p>',
      title: 'Farbpaletten',
      language: 'de',
    });
    const g = buildArticleGrounding(context, 1, {}, { niche: 'Home Decor' });
    expect(validateArticleGroundedPins([{ sourceSectionId: g.sectionPlan[0], image_prompt: 'A sage green and terracotta corner with linen and light wood.' }], g)).toEqual([]);
    expect(validateArticleGroundedPins([{ sourceSectionId: g.sectionPlan[0], image_prompt: 'A calm corner with soft light.' }], g)[0]?.reason).toBe('IMAGE_SUBJECT_MISMATCH');
  });
});

test.describe('Crochet and Clay do not regress', () => {
  const CROCHET_HTML = `<p>A colorful crochet scarf can change the feel of a coat with stripes and waves.</p>
<h2>1. Red Heart Neapolitan Scarf</h2><p>Worked side to side, the long scarf shows burgundy and pink stripes along its length.</p>
<h2>2. Caron Waves Scarf</h2><p>A double crochet repeat turns self-striping shades into flowing waves.</p>
<h2>3. Ripple Cowl</h2><p>A short cowl with ripple stripes in teal and mustard, worked in the round.</p>`;

  function crochet(language: 'en' | 'de', niche: string) {
    const context = buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html: CROCHET_HTML, title: '3 Colorful Crochet Scarves', language });
    return { context, g: buildArticleGrounding(context, 3, {}, { niche }) };
  }

  test('8. Crochet and Clay keep the project check, its message and the vocabulary check', () => {
    for (const niche of ['Crochet', 'Clay Crafts & DIY']) {
      const { context, g } = crochet('en', niche);
      expect(g.subjectCheck).toBe('project');
      const good = g.sectionPlan.map((id) => ({ sourceSectionId: id, image_prompt: `A ${context.sections.find((s) => s.id === id)!.subject} laid flat, overhead.` }));
      expect(validateArticleGroundedPins(good, g)).toEqual([]);
      const offTopic = validateArticleGroundedPins(good.map((pin) => ({ ...pin, image_prompt: 'A cozy reading nook with a mug of tea.' })), g);
      expect(offTopic.every((issue) => issue.message.includes("does not show its source section's project"))).toBe(true);
      expect(offTopic[0].subject).toEqual({ expected: ['scarf'], detected: ['no recognizable project'], missing: ['scarf'], required: 'scarf' });
      const invented = validateArticleGroundedPins([{ ...good[0], image_prompt: 'A chunky wool scarf with fringe.' }], g);
      expect(invented.find((issue) => issue.reason === 'UNGROUNDED_IMAGE_ELEMENTS')?.details).toEqual(expect.arrayContaining(['chunky', 'wool', 'fringe']));
    }
  });

  test('8b. German Crochet keeps its previous behavior (no Home Decor anchors involved)', () => {
    const { context, g } = crochet('de', 'Crochet');
    const pinsWithCowl = g.sectionPlan.map((id) => ({ sourceSectionId: id, image_prompt: `A ${context.sections.find((s) => s.id === id)!.subject} next to a chunky cowl and a red sofa.` }));
    expect(validateArticleGroundedPins(pinsWithCowl, g)).toEqual([]);
  });
});

test.describe('Errors, prompts and safety', () => {
  test('9. IMAGE_SUBJECT_MISMATCH stays active and explains expected / detected / missing / action', () => {
    const g = homeGrounding('de');
    const issues = validateArticleGroundedPins(pins(g, ['A beautiful stylish interior, soft light.', LIVING, BEDROOM]), g);
    const error = buildStrategySafeguardError(issues);
    expect(error.retryable).toBe(true);
    const [issue] = error.issues;
    expect(issue.code).toBe('IMAGE_SUBJECT_MISMATCH');
    expect(issue.pinIndex).toBe(1);
    expect(issue.message).toMatch(/^Pin 1 does not clearly represent the article section\. Expected: kitchen, .*green.*palette.*\. Detected: generic interior\. Missing: kitchen, /);
    expect(issue.action).toBe('Try again, or review the article section.');
    // Only fixed-vocabulary terms: no German article text, no model text.
    expect(issue.message).not.toMatch(/Küche|Holzinsel|stylish/);

    const single = buildStrategySafeguardError(issues, 'pin').issues[0];
    expect(single.message.startsWith('The Pin does not clearly represent the article section.')).toBe(true);
  });

  test('10. the Pin plan lists English anchors and no destination URL', () => {
    const g = homeGrounding('de');
    const plan = formatPinPlanForPrompt(g);
    expect(plan).toContain('Visual anchors the image prompt must show (English terms taken from this section): kitchen,');
    expect(plan).toContain('living room, sofa');
    expect(plan).not.toMatch(/https?:|wohnen\.example|www\./);
    expect(g.evidence).not.toMatch(/https?:/);
    // Crochet plans are unchanged.
    expect(formatPinPlanForPrompt(homeGrounding('de', 3, 'Crochet'))).not.toContain('Visual anchors');
  });

  test('13. Neo Deco post 1489: shelves the article never names stay rejected, and the plan forbids them', () => {
    // Real sections 7 and 9 (the bar cart's "Glasablagen" are the cart's own glass tiers, not shelves).
    const html = `
<p>Neo Deco interpretiert Art déco für das moderne Wohnzimmer mit Geometrie, Samt und glänzenden Details.</p>
<h2>7. Ein Barwagen als funktionales Art-déco-Detail</h2>
<figure><img src="${SITE}/barwagen.webp" alt="Eleganter Barwagen mit Chromrahmen, Glasablagen und Kristallkaraffe in einem modernen Wohnzimmer"><figcaption>Ein Barwagen verbindet eine praktische Ablage mit einem klassischen Art-déco-Detail.</figcaption></figure>
<p>Ein Barwagen auf Rollen verbindet Dekoration und Alltag. Chrom und Glas wirken klassisch, dunkles Holz etwas wärmer. Lass genügend freie Ablagefläche und gruppiere Gegenstände auf einem Tablett.</p>
<h2>9. Samtvorhänge in Waldgrün oder Burgunderrot</h2>
<figure><img src="${SITE}/vorhaenge.webp" alt="Dunkelgrüne Samtvorhänge rahmen ein helles Wohnzimmer mit geschwungenem Sofa und Chromdetails"><figcaption>Samtvorhänge bringen Farbe, Stofflichkeit und einen weichen Rahmen ans Fenster.</figcaption></figure>
<p>Schwere, weich fallende Vorhänge rahmen das Fenster und bringen eine satte Farbe in den Raum. Waldgrün passt zu Walnuss und Creme; Burgunderrot harmoniert mit warmen neutralen Tönen.</p>`;
    const context = deepFreeze(
      buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html, title: 'Neo Deco Wohnzimmer: 12 elegante Ideen für den Trend 2026', language: 'de', siteId: 'site-1', wordpressPostId: 1489 })
    );
    const g = buildArticleGrounding(context, 2, {}, { niche: 'Home Decor' });
    expect(findHomeAnchors(g.evidence, 'de')).not.toContain('shelves');

    const curtains = 'A bright living room where dark forest green velvet curtains frame a tall window, a curved sofa and cream walls, walnut wood accents, eye-level, photorealistic.';
    const bar = 'A modern living room with an elegant chrome and glass bar cart on wheels, dark wood floor, wide shot, photorealistic.';
    expect(validateArticleGroundedPins(pins(g, [bar, curtains]), g)).toEqual([]);

    const invented = curtains.replace('cream walls', 'cream walls and open wooden shelves styled with books');
    const issues = validateArticleGroundedPins(pins(g, [bar, invented]), g);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ reason: 'UNGROUNDED_IMAGE_ELEMENTS', pinIndex: 1, details: ['shelves'] });

    const plan = formatPinPlanForPrompt(g);
    const curtainBrief = plan.slice(plan.indexOf(`section "${g.sectionPlan[1]}"`));
    expect(curtainBrief).toContain('Furniture and decor allowed in the image prompt: only sofa, curtains (named in this section).');
    expect(curtainBrief).toContain('Do not add any other furniture, storage or decorative element this section does not name.');
    expect(curtainBrief).toMatch(/Never show \(this section never mentions them\): [^\n]*\bshelves\b/);
    // The section's own furniture is never listed as forbidden.
    expect(curtainBrief).not.toMatch(/Never show[^\n]*\b(sofa|curtains)\b/);
    // Crochet plans are unchanged.
    expect(formatPinPlanForPrompt(homeGrounding('de', 3, 'Crochet'))).not.toContain('Furniture and decor allowed');
  });

  test('14. furniture is grounded per section: the bar cart\'s Vision "glass shelves" do not allow shelves in the curtain Pin', () => {
    const html = `
<p>Neo Deco interpretiert Art déco für das moderne Wohnzimmer.</p>
<h2>7. Ein Barwagen als funktionales Art-déco-Detail</h2>
<figure><img src="${SITE}/barwagen.webp" alt="Barwagen"></figure>
<p>Ein Barwagen auf Rollen verbindet Dekoration und Alltag. Chrom und Glas wirken klassisch, dunkles Holz etwas wärmer.</p>
<h2>9. Samtvorhänge in Waldgrün oder Burgunderrot</h2>
<p>Schwere, weich fallende Samtvorhänge rahmen das Fenster neben dem geschwungenen Sofa. Waldgrün passt zu Walnuss und Creme.</p>`;
    const context = deepFreeze(
      buildWordPressArticleContext({ sourceType: 'external_wordpress_post', html, title: 'Neo Deco Wohnzimmer', language: 'de', siteId: 'site-1', wordpressPostId: 1489 })
    );
    const [bar, curtainsId] = buildArticleGrounding(context, 2, {}, { niche: 'Home Decor' }).sectionPlan;
    // Real Vision answer for the bar cart photo (live run, 2026-10-25).
    const g = buildArticleGrounding(context, 2, { [bar]: [{ source: 'vision', text: 'Photo shows: A two-tier bar cart. construction: Open metal frame with two glass shelves and curved handles.' }] }, { niche: 'Home Decor' });
    expect(findHomeAnchors(g.evidence, 'de')).toContain('shelves');
    expect(findHomeAnchors(g.sectionTexts?.[curtainsId] ?? '', 'de')).not.toContain('shelves');

    const barPrompt = 'A modern living room with a chrome bar cart on wheels, two glass shelves and dark wood accents, wide shot, photorealistic.';
    const curtains = 'A bright living room where dark forest green velvet curtains frame a tall window beside a curved sofa, cream walls, eye-level, photorealistic.';
    // Shelves of the bar cart's own section are grounded; a faithful curtain prompt passes.
    expect(validateArticleGroundedPins([{ sourceSectionId: bar, image_prompt: barPrompt }, { sourceSectionId: curtainsId, image_prompt: curtains }], g)).toEqual([]);
    // Shelves (or a synonym) in the curtain Pin stay refused although another section has them.
    for (const added of ['open wooden shelves', 'a tall bookcase', 'wall shelving']) {
      const issues = validateArticleGroundedPins([{ sourceSectionId: bar, image_prompt: barPrompt }, { sourceSectionId: curtainsId, image_prompt: curtains.replace('cream walls', `cream walls and ${added}`) }], g);
      expect(issues).toEqual([expect.objectContaining({ reason: 'UNGROUNDED_IMAGE_ELEMENTS', pinIndex: 1, field: 'image_prompt', details: ['shelves'] })]);
    }
    // The section-level list in the plan forbids shelves for the curtain Pin even though the article has them.
    const plan = formatPinPlanForPrompt(g);
    expect(plan.slice(plan.indexOf(`section "${curtainsId}"`))).toMatch(/Never show \(this section never mentions them\): [^\n]*\bshelves\b/);
  });

  test('11-12. regeneration is checked the same way, offline, without touching the article', async () => {
    const markdown = [
      'Farbe bringt Leben in jedes Zuhause, auch in kleinen Wohnungen und Mietwohnungen.',
      '## 1. Grüne und orange Küche mit Holzinsel',
      'Die Küchenschränke sind salbeigrün lackiert, die Kücheninsel aus Eichenholz trägt orange Barhocker aus Metall.',
      '## 2. Gemütliches Wohnzimmer in Terrakotta',
      'Ein Sofa aus Samt in Terrakotta steht vor einer cremeweißen Wand mit einem Teppich aus Jute.',
    ].join('\n\n');
    const source = buildArticlePinterestSource(
      { id: 'gen-de', project_id: 'project-1', language: 'de', seo_keywords: 'farbige küche' },
      { title: 'Farbige Wohnideen', meta_title: null, meta_description: 'Mutige Farben für Küche und Wohnzimmer.', content: markdown, featured_image_url: null, featured_image_prompt: 'Farbige Küche' },
      'farbige küche',
      { niche: 'Home Organization & Decor', description: null }
    );
    const before = JSON.stringify(source.context);
    const g = buildArticleGrounding(source.context, 2, {}, { niche: source.niche });
    const brief = g.briefs[g.sectionPlan[0]];
    const image_analysis = attachArticleSourceMetadata(attachPinterestStrategyMetadata(null, 'curiosity'), { sourceType: 'omniflow_article', sectionId: brief.sectionId, brief });
    let modelCalls = 0;
    const answer = (imagePrompt: string) => async () => {
      modelCalls++;
      return JSON.stringify({
        pins: [{ angle: 'curiosity', title: 'Die Küche, die alle nachmachen wollen', description: 'Salbeigrün trifft Orange: so wirkt die Küche warm und modern.', keywords: 'farbige küche', board: 'Wohnideen', image_prompt: imagePrompt, sourceSectionId: brief.sectionId, visualFormat: 'photo' }],
      });
    };
    const params = {
      pin: { id: 'p1', title: 'Alt', description: 'd', keywords: 'k', image_prompt: 'i', image_analysis, visual_format: 'photo' as const, overlay_text: null },
      siblingTitles: [],
      keyword: 'farbige küche',
      language: 'de' as const,
      source,
    };
    const update = await regenerateArticlePin(params, { generateText: answer(KITCHEN) as never });
    expect(update.image_prompt).toBe(KITCHEN);
    await expect(regenerateArticlePin(params, { generateText: answer(LIVING) as never })).rejects.toMatchObject({
      code: 'strategy_safeguard_failed',
      safeguard: { issues: expect.arrayContaining([expect.objectContaining({ code: 'IMAGE_SUBJECT_MISMATCH', message: expect.stringContaining('Expected: kitchen') })]) },
    });
    expect(modelCalls).toBe(2); // the stub only — no provider reached (fetch is trapped)
    expect(JSON.stringify(source.context)).toBe(before);
  });
});
