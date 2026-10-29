import { expect, test } from 'playwright/test';
import sharp from 'sharp';
import { buildWordPressArticleContext, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import {
  appendArticleVisualBrief,
  attachArticleSourceMetadata,
  buildArticleGrounding,
  formatPinPlanForPrompt,
  formatVisualBrief,
  readArticleSourceMetadata,
} from '@/lib/pinterest/article-briefs';
import {
  STEP_BY_STEP_IMAGE_CALLS,
  attachComposerMetadata,
  buildComposerMetadata,
  composerEligibility,
  composerTemplateForStyle,
  composerTitle,
  markComposerRendered,
  planComposerTemplates,
  readComposerMetadata,
  verifyComposerText,
  type ComposerMetadata,
  type ComposerEligibility,
  type ComposerTemplateType,
  type StepByStepLayout,
  type StepByStepV2Metadata,
} from '@/lib/pinterest/composer/content';
import {
  COMPOSER_MIN_CONTRAST,
  COMPOSER_PALETTE,
  ComposerRenderError,
  STEP_PALETTES,
  contrastRatio,
  renderComposedPin,
} from '@/lib/pinterest/composer/render';
import { composePinImage, composerImageCallCount, composerImagePrompt, metadataForRender } from '@/lib/pinterest/composer/pipeline';
import { withVisualArchetype, type PinVisualArchetype } from '@/lib/pinterest/visual-archetypes';
import { describeVisualFormatSources, readPinVisualFormat } from '@/lib/social/pin-display';
import { generatePinsSchema } from '@/lib/validations/pinterest';
import { PINTEREST_VISUAL_STYLES } from '@/types/pinterest';
import { pickCtaMessage } from '@/lib/pinterest/cta-messages';
import type { Pin } from '@/types/database';

// TASK-079 — Pinterest Template Composer (Hero, Materials & tools; the
// Step-by-step format was withdrawn on 2026-10-29 — stored v1 / v2 contracts
// are still read, shown and regenerated). Offline: no AI, Vision, network, WordPress or real storage
// call. The image route runs with a fake provider photo, a fake Supabase
// client and a fake media storage (R2 and Supabase layouts).

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

const CROCHET_EN = article(
  'How to Make a Crochet Flower Hair Tie: Free Pattern',
  `<p>This crochet flower hair tie is a quick project with a five-petal flower in white and yellow cotton.</p>
<h2>Materials</h2><ul><li>Worsted weight cotton yarn (white and yellow)</li><li>3.5 mm crochet hook</li><li>Hair elastic</li><li>Tapestry needle</li><li>Scissors</li></ul>
<h2>Step 1: Make a magic ring</h2><p>Make a magic ring with the yellow cotton yarn and work 6 single crochet into the ring.</p>
<h2>Step 2: Crochet the five petals</h2><p>Join the white yarn and crochet five petals around the yellow center of the flower.</p>
<h2>Step 3: Sew the flower to the hair tie</h2><p>Sew the crochet flower to the hair elastic with the tapestry needle.</p>
<h2>Step 4: Weave in the ends</h2><p>Weave in all ends of the cotton yarn so the crochet flower hair tie stays neat.</p>`
);

const CROCHET_DE = article(
  'Häkelmütze mit Zopfmuster: Anleitung für Anfänger',
  `<p>Diese Häkelmütze in Waldgrün hat ein weiches Zopfmuster und passt Erwachsenen.</p>
<h2>Materialien</h2><ul><li>Wolle in Waldgrün (200 g)</li><li>Häkelnadel 5 mm</li><li>Maschenmarkierer</li><li>Wollnadel</li></ul>
<h2>Runde 1: Magischer Ring</h2><p>Häkle einen magischen Ring mit 8 festen Maschen für die Mütze.</p>
<h2>Runde 2: Zunahmen häkeln</h2><p>Verdopple jede Masche der Mütze, sodass 16 Maschen entstehen.</p>
<h2>Runde 3: Zopfmuster beginnen</h2><p>Beginne das Zopfmuster der Mütze mit Reliefstäbchen in Waldgrün.</p>`,
  'de'
);

const CLAY_FR = article(
  'Comment faire une coupelle en argile autodurcissante',
  `<p>Cette coupelle en argile autodurcissante se façonne en une heure et se peint en terracotta.</p>
<h2>Matériel</h2><p>Argile autodurcissante, un rouleau à pâtisserie, un petit bol, de la peinture acrylique et du vernis.</p>
<h2>Étape 1 : Étaler l’argile</h2><p>Étale l’argile autodurcissante sur 5 mm d’épaisseur pour la coupelle.</p>
<h2>Étape 2 : Former la coupelle</h2><p>Presse le disque d’argile dans le petit bol pour former la coupelle.</p>
<h2>Étape 3 : Peindre la coupelle</h2><p>Peins la coupelle sèche en terracotta puis applique le vernis.</p>`,
  'fr'
);

const RECIPE_ES = article(
  'Pasta al limón con ajo en 20 minutos',
  `<p>Esta pasta al limón con ajo está lista en 20 minutos y es una cena ligera.</p>
<h2>Ingredientes</h2><ul><li>Espaguetis</li><li>Limón</li><li>Ajo</li><li>Aceite de oliva</li><li>Queso parmesano</li></ul>
<h2>Preparación de la pasta</h2><p>Paso 1: Hierve la pasta en agua con sal. Paso 2: Sofríe el ajo en aceite de oliva. Paso 3: Mezcla la pasta con el limón y el parmesano.</p>
<h2>Cómo servir la pasta al limón</h2><p>Sirve la pasta al limón en un plato blanco con más parmesano por encima.</p>`,
  'es'
);

const HOME_DECOR_DE = article(
  'Neo Deco Wohnzimmer: elegante Ideen für den Trend',
  `<p>Neo Deco interpretiert Art déco für das moderne Wohnzimmer mit Geometrie, Samt und glänzenden Details.</p>
<h2>1. Ein geschwungenes Samtsofa als Mittelpunkt</h2><p>Ein Sofa mit weichen Rundungen gibt dem Raum die typische Silhouette. Dunkelgrüner Samt wirkt tief und wohnlich.</p>
<h2>2. Ein Barwagen als funktionales Art-déco-Detail</h2><p>Ein Barwagen auf Rollen mit zwei Regalböden aus Glas verbindet Dekoration und Alltag.</p>
<h2>3. Samtvorhänge in Waldgrün oder Burgunderrot</h2><p>Schwere, weich fallende Vorhänge rahmen das Fenster neben dem Sofa.</p>`,
  'de'
);

/** Ideas, not a tutorial: numbered headings, no materials list, one color. */
const NO_LISTS_EN = article(
  'Three Cozy Crochet Blankets',
  `<p>Three blankets for the sofa this winter.</p>
<h2>1. Chunky blanket</h2><p>A chunky crochet blanket with a soft texture that keeps you warm on the sofa all winter long.</p>
<h2>2. Granny square blanket</h2><p>A granny square blanket in cream made of small squares joined together for the sofa.</p>
<h2>3. Ripple blanket</h2><p>A ripple blanket with gentle waves that drapes over the back of the sofa.</p>`
);

const SINGLE_TEMPLATES = ['hero', 'materials_and_tools'] as const;
const TEMPLATES: ComposerTemplateType[] = ['hero', 'materials_and_tools', 'step_by_step'];

function build(
  template: (typeof SINGLE_TEMPLATES)[number],
  context: WordPressArticleContext,
  options: { hasDestination?: boolean; sectionId?: string } = {}
): ComposerMetadata {
  const metadata = buildComposerMetadata(template, context, {
    sectionId: options.sectionId ?? context.sections.find((section) => section.kind === 'subject')?.id ?? null,
    language: context.language,
    hasDestination: options.hasDestination ?? false,
    ctaIndex: 0,
  });
  expect(metadata, `${template} for "${context.title}"`).not.toBeNull();
  return metadata!;
}

/**
 * A Step-by-step v2 contract as stored before the format was withdrawn
 * (2026-10-29): kept only to prove older Pins are still read, shown, rendered
 * and regenerated. Its text comes from CROCHET_EN.
 */
function historicalV2(): StepByStepV2Metadata {
  const ids = ['Step 1', 'Step 2', 'Step 4'].map((start) => CROCHET_EN.sections.find((section) => section.heading.startsWith(start))!);
  return {
    templateType: 'step_by_step',
    templateVersion: 'v2',
    renderedBy: 'omniflow-composer',
    language: 'en',
    status: 'planned',
    layout: 'alternating',
    panelCount: 3,
    niche: 'crochet',
    sourceSections: ids.map((section) => section.id),
    sourceHeadings: ids.map((section) => section.heading),
    warnings: ['STEPS_SELECTED:3/4'],
    panels: ids.map((section, index) => ({
      sectionId: section.id,
      sectionTitle: section.heading,
      sectionLanguage: 'en',
      sourceText: section.text,
      imagePrompt: `STEP PHOTO ${index + 1} of 3 — one photograph of this step, no text.`,
    })),
    text: {
      title: 'How to Make a Crochet Flower Hair Tie: Free Pattern',
      steps: [
        { label: 'Step 1', title: 'Make a magic ring' },
        { label: 'Step 2', title: 'Crochet the five petals' },
        { label: 'Step 4', title: 'Weave in the ends' },
      ],
    },
  };
}

function anyTemplate(template: ComposerTemplateType, context: WordPressArticleContext): ComposerMetadata {
  return template === 'step_by_step' ? historicalV2() : build(template, context, { hasDestination: true });
}

let photoCache: Buffer | null = null;
/** A provider-like photo: 1024×1536 PNG, a "subject" in the middle, no text. */
async function providerPhoto(): Promise<Buffer> {
  photoCache ??= await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#6b8f71' } })
    .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><circle cx="512" cy="720" r="300" fill="#d98c5f"/></svg>') }])
    .png()
    .toBuffer();
  return photoCache;
}

/** Three distinct step photos (the fake provider returns one per call). */
async function stepPhotos(): Promise<Buffer[]> {
  return Promise.all(
    ['#8a7f9c', '#c9b79c', '#9cb0c9'].map((background) =>
      sharp({ create: { width: 1024, height: 1536, channels: 3, background } }).png().toBuffer()
    )
  );
}

test.describe('Templates — content comes from the article only', () => {
  test('Hero: the article title, the section subject as subtitle, no CTA without a Destination URL', () => {
    const hero = build('hero', CROCHET_EN);
    expect(hero.templateType).toBe('hero');
    if (hero.templateType !== 'hero') return;
    expect(hero.text.title).toBe('How to Make a Crochet Flower Hair Tie: Free Pattern');
    expect(hero.text.cta).toBeNull();
    expect(hero).toMatchObject({ templateVersion: 'v1', renderedBy: 'omniflow-composer', status: 'planned' });
    expect(verifyComposerText(hero, CROCHET_EN)).toEqual([]);

    const withLink = build('hero', CROCHET_EN, { hasDestination: true });
    if (withLink.templateType !== 'hero') return;
    // The only fixed phrase, localized, and only with a Destination URL.
    expect(withLink.text.cta).toBe(pickCtaMessage('en', 0));
    expect(verifyComposerText(withLink, CROCHET_EN)).toEqual([]);
  });

  test('Materials & tools: the verbatim list items (parentheses dropped), the article heading as label', () => {
    const materials = build('materials_and_tools', CROCHET_EN);
    if (materials.templateType !== 'materials_and_tools') throw new Error('wrong template');
    expect(materials.text.label).toBe('Materials');
    expect(materials.text.items).toEqual(['Worsted weight cotton yarn', '3.5 mm crochet hook', 'Hair elastic', 'Tapestry needle', 'Scissors']);
    expect(materials.text.tools).toEqual([]);
    expect(materials.sourceHeadings).toEqual(['Materials']);
    expect(verifyComposerText(materials, CROCHET_EN)).toEqual([]);
  });

  test('Step-by-step is no longer offered: not a visual format, refused by the request schema, never planned', () => {
    expect(PINTEREST_VISUAL_STYLES).not.toContain('step-by-step');
    const request = { projectId: '11111111-1111-4111-8111-111111111111', keyword: 'crochet', pinsRequested: 1, generationMode: 'photo-only', wordpressPost: { siteId: '22222222-2222-4222-8222-222222222222', postId: 1 } };
    const visualStyleIssues = (visualStyle: string) => {
      const parsed = generatePinsSchema.safeParse({ ...request, visualStyle });
      return parsed.success ? [] : parsed.error.issues.filter((issue) => issue.path.includes('visualStyle'));
    };
    expect(visualStyleIssues('step-by-step').length).toBeGreaterThan(0);
    expect(visualStyleIssues('hero')).toEqual([]);
    expect(Object.keys(composerEligibility(CROCHET_EN)).sort()).toEqual(['hero', 'materials_and_tools']);
    for (const style of PINTEREST_VISUAL_STYLES) {
      const grounding = buildArticleGrounding(CROCHET_EN, 4, {}, { niche: 'Crochet', visualStyle: style });
      expect(grounding.pinTemplates ?? []).not.toContain('step_by_step');
      expect(formatPinPlanForPrompt(grounding)).not.toContain('step labels');
    }
  });

  test('older Step-by-step Pins (v1 and v2 contracts) are still read and displayed — no data is dropped', () => {
    const v2 = historicalV2();
    expect(readComposerMetadata(attachComposerMetadata(null, v2))).toEqual(v2);
    expect(verifyComposerText(v2, CROCHET_EN)).toEqual([]);
    expect(readPinVisualFormat(attachComposerMetadata(null, v2)).warnings).toEqual(["Shows 3 of the article's 4 steps (first, middle and last)"]);
    const v1: ComposerMetadata = { ...build('hero', CROCHET_EN), templateType: 'step_by_step', text: { title: v2.text.title, steps: v2.text.steps.map((step) => ({ label: step.label ?? '', title: step.title })) } };
    expect(readComposerMetadata(attachComposerMetadata(null, v1))).toEqual(v1);
    expect(readPinVisualFormat(attachComposerMetadata(null, v1)).label).toBe('Step-by-step');
  });
});

test.describe('Eligibility by niche and language', () => {
  const cases: Array<[string, WordPressArticleContext, ComposerEligibility]> = [
    ['Crochet (EN)', CROCHET_EN, { hero: true, materials_and_tools: true }],
    ['Crochet (DE)', CROCHET_DE, { hero: true, materials_and_tools: true }],
    ['Clay (FR)', CLAY_FR, { hero: true, materials_and_tools: true }],
    ['Recipes (ES)', RECIPE_ES, { hero: true, materials_and_tools: true }],
    ['Home Decor (DE)', HOME_DECOR_DE, { hero: true, materials_and_tools: false }],
    ['Ideas without lists (EN)', NO_LISTS_EN, { hero: true, materials_and_tools: false }],
  ];
  for (const [name, context, expected] of cases) {
    test(`${name}: ${Object.entries(expected).filter(([, ok]) => ok).map(([id]) => id).join(', ')}`, () => {
      expect(composerEligibility(context)).toEqual(expected);
      for (const template of SINGLE_TEMPLATES) {
        if (!expected[template]) {
          expect(buildComposerMetadata(template, context, { language: context.language, hasDestination: false, ctaIndex: 0 })).toBeNull();
          continue;
        }
        expect(verifyComposerText(build(template, context), context), `${name} ${template}`).toEqual([]);
      }
    });
  }

  test('DE / FR / ES: accents, ß and the article language are kept verbatim', () => {
    const de = build('materials_and_tools', CROCHET_DE);
    if (de.templateType !== 'materials_and_tools') throw new Error('wrong template');
    expect(de.text.label).toBe('Materialien');
    expect(de.text.items).toEqual(['Wolle in Waldgrün', 'Häkelnadel 5 mm', 'Maschenmarkierer', 'Wollnadel']);
    expect(de.language).toBe('de');

    const fr = build('materials_and_tools', CLAY_FR);
    if (fr.templateType !== 'materials_and_tools') throw new Error('wrong template');
    // One inline sentence "a, b, c, d et e" → five items.
    expect(fr.text.items).toEqual(['Argile autodurcissante', 'Un rouleau à pâtisserie', 'Un petit bol', 'De la peinture acrylique', 'Du vernis']);

    const esMaterials = build('materials_and_tools', RECIPE_ES);
    if (esMaterials.templateType !== 'materials_and_tools') throw new Error('wrong template');
    expect(esMaterials.text.label).toBe('Ingredientes');
  });

  test('long titles: a "Title: subtitle" keeps its first part; a title too long to shorten is not a Hero', () => {
    const subtitled = article('Crochet Flower Hair Tie: An Easy and Quick Pattern for Complete Beginners Who Want Something Pretty', '<p>A flower hair tie.</p>');
    expect(composerTitle(subtitled)).toBe('Crochet Flower Hair Tie');
    const endless = article('An Extremely Long Crochet Title Without Any Separator That Keeps Going On And On Beyond Ninety Characters', '<p>Text.</p>');
    expect(composerTitle(endless)).toBeNull();
    expect(composerEligibility(endless).hero).toBe(false);
  });

});

test.describe('Invented content is rejected', () => {
  test('an invented material, step or number fails the article check', () => {
    const materials = build('materials_and_tools', CROCHET_EN);
    if (materials.templateType !== 'materials_and_tools') throw new Error('wrong template');
    const invented = { ...materials, text: { ...materials.text, items: [...materials.text.items, 'Mohair yarn'] } };
    expect(verifyComposerText(invented, CROCHET_EN)).toEqual([{ code: 'COMPOSER_TEXT_NOT_IN_ARTICLE', field: 'items.5' }]);
    const number = { ...materials, text: { ...materials.text, items: materials.text.items.map((item) => item.replace('3.5 mm', '4 mm')) } };
    expect(verifyComposerText(number, CROCHET_EN)).toEqual([{ code: 'COMPOSER_TEXT_NOT_IN_ARTICLE', field: 'items.1' }]);

    const plan = historicalV2();
    const inventedStep: StepByStepV2Metadata = { ...plan, text: { ...plan.text, steps: [...plan.text.steps.slice(0, 2), { label: 'Step 4', title: 'Block the flower on a foam mat' }] } };
    expect(verifyComposerText(inventedStep, CROCHET_EN)).toEqual([{ code: 'COMPOSER_TEXT_NOT_IN_ARTICLE', field: 'steps.2.title' }]);
    const inventedNumber: StepByStepV2Metadata = { ...plan, text: { ...plan.text, steps: [...plan.text.steps.slice(0, 2), { label: 'Step 9', title: 'Weave in the ends' }] } };
    expect(verifyComposerText(inventedNumber, CROCHET_EN)).toEqual([{ code: 'COMPOSER_TEXT_NOT_IN_ARTICLE', field: 'steps.2.label' }]);
  });

  test('a CTA outside the fixed localized phrases, or an unknown source section, is rejected', () => {
    const hero = build('hero', CROCHET_EN, { hasDestination: true });
    if (hero.templateType !== 'hero') throw new Error('wrong template');
    expect(verifyComposerText({ ...hero, text: { ...hero.text, cta: 'Buy now — 50% off' } }, CROCHET_EN)).toEqual([{ code: 'COMPOSER_CTA_NOT_ALLOWED', field: 'cta' }]);
    expect(verifyComposerText({ ...hero, sourceSections: ['s99'] }, CROCHET_EN)).toEqual([{ code: 'COMPOSER_SOURCE_SECTION_UNKNOWN', field: 'sourceSections.0' }]);
  });
});

test.describe('Selection: explicit formats, Auto variety and the Classic fallback', () => {
  test('Classic and keyword flows plan no template; explicit formats map to their template', () => {
    expect(composerTemplateForStyle('classic')).toBeNull();
    expect(composerTemplateForStyle('auto-variety')).toBeNull();
    expect(composerTemplateForStyle('hero')).toBe('hero');
    expect(composerTemplateForStyle('materials-and-tools')).toBe('materials_and_tools');
    const classic = buildArticleGrounding(CROCHET_EN, 3, {}, { niche: 'Crochet' });
    expect(classic.pinTemplates).toBeUndefined();
    expect(formatPinPlanForPrompt(classic)).not.toContain('composed Pin');
  });

  test('an explicit format the article cannot prove plans nothing (the route refuses it before any AI call)', () => {
    const eligibility = composerEligibility(NO_LISTS_EN);
    expect(planComposerTemplates('materials-and-tools', 2, undefined, eligibility)).toEqual([null, null]);
    expect(planComposerTemplates('hero', 2, undefined, eligibility)).toEqual(['hero', 'hero']);
  });

  test('Auto variety: real templates only when proven, never twice in a row, Materials once per batch, never a step format', () => {
    for (const [context, niche] of [[CROCHET_EN, 'Crochet'], [CROCHET_DE, 'Crochet'], [CLAY_FR, 'Clay'], [RECIPE_ES, 'Recipes'], [HOME_DECOR_DE, 'Home Decor']] as const) {
      const grounding = buildArticleGrounding(context, 6, {}, { niche, visualStyle: 'auto-variety' });
      const templates = grounding.pinTemplates!;
      expect(templates).toHaveLength(grounding.sectionPlan.length);
      const eligibility = composerEligibility(context);
      templates.forEach((template, index) => {
        if (template) expect(eligibility[template]).toBe(true);
        if (index > 0 && template) expect(template, `${context.title} Pin ${index + 1}`).not.toBe(templates[index - 1]);
        // A composed slot drops its prompt archetype: one clean photo.
        if (template) expect(grounding.pinArchetypes![index]).toBeNull();
      });
      expect(templates.filter((template) => template === 'materials_and_tools').length).toBeLessThanOrEqual(1);
      expect(templates).not.toContain('step_by_step');
    }
    const crochet = buildArticleGrounding(CROCHET_EN, 4, {}, { niche: 'Crochet', visualStyle: 'auto-variety' });
    expect(crochet.pinTemplates).toContain('hero');
    expect(crochet.pinTemplates).not.toContain('step_by_step');
    // Deterministic.
    expect(buildArticleGrounding(CROCHET_EN, 4, {}, { niche: 'Crochet', visualStyle: 'auto-variety' }).pinTemplates).toEqual(crochet.pinTemplates);
  });

  test('Auto variety without materials, steps or variants: no Materials / Step-by-step template, no variation layout', () => {
    for (const [context, niche] of [[NO_LISTS_EN, 'Crochet'], [HOME_DECOR_DE, 'Home Decor']] as const) {
      const grounding = buildArticleGrounding(context, 5, {}, { niche, visualStyle: 'auto-variety' });
      expect(grounding.pinTemplates!.every((template) => template === null || template === 'hero')).toBe(true);
    }
    const single = buildArticleGrounding(NO_LISTS_EN, 5, {}, { niche: 'Crochet', visualStyle: 'auto-variety' });
    expect((single.pinArchetypes ?? []).some((archetype) => archetype?.id === 'variation_showcase')).toBe(false);
  });

  test('the archetype → template mapping skips a repeat (the second Pin keeps its archetype); a tutorial archetype stays classic', () => {
    const archetype = (id: PinVisualArchetype['id']) => ({ id, label: id, composition: 'x', elements: [] }) as PinVisualArchetype;
    const eligibility = { hero: true, materials_and_tools: true };
    const plan = planComposerTemplates('auto-variety', 6, [archetype('finished_project'), archetype('hero_lifestyle'), archetype('tutorial_steps'), archetype('materials_and_tools'), archetype('collage_grid'), archetype('materials_and_tools')], eligibility);
    expect(plan).toEqual(['hero', null, null, 'materials_and_tools', null, null]);
  });
});

test.describe('Guardrails and persistence', () => {
  test('the main subject and the section brief stay: the composed photo prompt keeps the subject contract and forbids text', () => {
    const grounding = buildArticleGrounding(CROCHET_EN, 1, {}, { niche: 'Crochet', visualStyle: 'hero' });
    const sectionId = grounding.sectionPlan[0];
    const brief = withVisualArchetype(grounding.briefs[sectionId], null);
    for (const [metadata, marker] of [[build('hero', CROCHET_EN), 'COMPOSED PIN PHOTO'], [historicalV2(), 'COMPOSED STEP-BY-STEP PIN']] as const) {
      const json = attachComposerMetadata(attachArticleSourceMetadata(null, { sourceType: 'external_wordpress_post', sectionId, brief }), metadata);
      const prompt = composerImagePrompt(appendArticleVisualBrief('Base image prompt.', json), metadata);
      expect(prompt).toContain('ARTICLE-GROUNDED VISUAL BRIEF');
      expect(prompt).toContain(formatVisualBrief(brief));
      expect(prompt).toContain('No text, letters, numbers, labels, logos or lists anywhere in the image.');
      expect(prompt).toContain('no collage, no panels');
      expect(prompt.indexOf('ARTICLE-GROUNDED VISUAL BRIEF')).toBeLessThan(prompt.indexOf(marker));
      if (brief.subjectContract) expect(prompt).toContain('Required subject:');
      expect(prompt).not.toContain('Visual archetype:');
    }
    expect(composerImageCallCount(build('hero', CROCHET_EN))).toBe(1);
    expect(composerImageCallCount(historicalV2())).toBe(STEP_BY_STEP_IMAGE_CALLS);
    expect(STEP_BY_STEP_IMAGE_CALLS).toBe(4);
  });

  test('the contract is stored in pins.image_analysis next to the other metadata and read back unchanged', () => {
    const metadata = build('materials_and_tools', CROCHET_EN);
    const base = JSON.stringify({ _pinterestStrategy: { angle: 'curiosity' } });
    const json = attachComposerMetadata(base, metadata);
    expect(readComposerMetadata(json)).toEqual(metadata);
    expect(JSON.parse(json)._pinterestStrategy).toEqual({ angle: 'curiosity' });
    const rendered = markComposerRendered(json, metadata, []);
    expect(readComposerMetadata(rendered)).toEqual({ ...metadata, status: 'rendered' });
    expect(readComposerMetadata(rendered)!.sourceSections).toEqual(metadata.sourceSections);
    expect(readPinVisualFormat(rendered)).toEqual({
      label: 'Materials & tools', composed: true, sources: ['Materials'], status: 'rendered', warnings: [], layout: null, panelCount: null, imageCalls: 1,
    });

    // An older Step-by-step v2 Pin: layout, panels and image calls are still read and displayed.
    const plan = historicalV2();
    const stepJson = markComposerRendered(attachComposerMetadata(base, plan), plan, []);
    expect(readComposerMetadata(stepJson)).toEqual({ ...plan, status: 'rendered' });
    expect(JSON.parse(stepJson)._pinterestComposer).toMatchObject({
      templateType: 'step_by_step', templateVersion: 'v2', layout: plan.layout, panelCount: 3, renderedBy: 'omniflow-composer', status: 'rendered',
    });
    expect(readPinVisualFormat(stepJson)).toMatchObject({ label: 'Step-by-step', panelCount: 3, imageCalls: 4, sources: plan.sourceHeadings });
    expect(readPinVisualFormat(stepJson).layout).toMatch(/^(Vertical progression|Editorial grid|Alternating)$/);
  });

  test('older and Classic Pins: no contract, displayed as Classic, malformed data ignored', () => {
    for (const json of [null, '', '{}', 'not json', JSON.stringify({ _pinterestStrategy: { angle: 'listicle' } })]) {
      expect(readComposerMetadata(json)).toBeNull();
      expect(readPinVisualFormat(json)).toEqual({ label: 'Classic', composed: false, sources: [], status: null, warnings: [], layout: null, panelCount: null, imageCalls: null });
    }
    const malformed = JSON.stringify({ _pinterestComposer: { templateType: 'collage', text: {} } });
    expect(readComposerMetadata(malformed)).toBeNull();
    expect(readPinVisualFormat(malformed).label).toBe('Classic');
    expect(describeVisualFormatSources([])).toBeNull();
    expect(describeVisualFormatSources(['Materials'])).toBe('Source: Materials');
    expect(describeVisualFormatSources(['Step 1', 'Step 2', 'Step 3'])).toBe('Sources: Step 1, Step 2 and Step 3');
  });

  test('a Hero CTA is dropped once the Pin has no Destination URL, never added later', () => {
    const withCta = build('hero', CROCHET_EN, { hasDestination: true });
    const withoutCta = build('hero', CROCHET_EN);
    expect(metadataForRender(withCta, true)).toBe(withCta);
    const dropped = metadataForRender(withCta, false);
    expect(dropped.templateType === 'hero' && dropped.text.cta).toBeNull();
    expect(metadataForRender(withoutCta, true)).toBe(withoutCta);
  });
});

test.describe('Rendering — 1000×1500, readable, in memory', () => {
  test('palette contrast: every text/background pair is at least 4.5:1', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    const pairs: Array<[string, string]> = [
      [COMPOSER_PALETTE.ink, COMPOSER_PALETTE.panel],
      [COMPOSER_PALETTE.muted, COMPOSER_PALETTE.panel],
      [COMPOSER_PALETTE.accent, COMPOSER_PALETTE.panel],
      [COMPOSER_PALETTE.onAccent, COMPOSER_PALETTE.accent],
      [COMPOSER_PALETTE.ink, COMPOSER_PALETTE.card],
    ];
    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background), `${foreground} on ${background}`).toBeGreaterThanOrEqual(COMPOSER_MIN_CONTRAST);
    }
    // Step-by-step niche palettes: accent labels on the tint, white numbers on the accent, ink on the tint.
    for (const [niche, palette] of Object.entries(STEP_PALETTES)) {
      for (const [foreground, background] of [[palette.accent, palette.tint], [COMPOSER_PALETTE.onAccent, palette.accent], [COMPOSER_PALETTE.ink, palette.tint]]) {
        expect(contrastRatio(foreground, background), `${niche}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(COMPOSER_MIN_CONTRAST);
      }
    }
  });

  for (const [name, context] of [['EN', CROCHET_EN], ['DE', CROCHET_DE], ['FR', CLAY_FR], ['ES', RECIPE_ES]] as const) {
    test(`${name}: the three templates render a 1000×1500 JPEG with readable contrast`, async () => {
      const photo = await providerPhoto();
      const photos = await stepPhotos();
      for (const template of TEMPLATES) {
        const metadata = anyTemplate(template, context);
        const { optimized, composed } = await composePinImage({ photo, stepPhotos: photos, metadata, hasDestination: true });
        expect(composed.minContrast).toBeGreaterThanOrEqual(COMPOSER_MIN_CONTRAST);
        expect(optimized).toMatchObject({ width: 1000, height: 1500, format: 'jpeg', contentType: 'image/jpeg' });
        const stored = await sharp(optimized.buffer).metadata();
        expect(stored).toMatchObject({ format: 'jpeg', width: 1000, height: 1500 });
      }
    });
  }

  test('long titles, accents and unbreakable compounds wrap inside the margins', async () => {
    const photo = await providerPhoto();
    const hero: ComposerMetadata = {
      templateType: 'hero',
      templateVersion: 'v1',
      sourceSections: ['s1'],
      sourceHeadings: ['Größenübersicht'],
      renderedBy: 'omniflow-composer',
      language: 'de',
      status: 'planned',
      warnings: [],
      text: {
        title: 'Häkelblume Haargummi: Schritt-für-Schritt-Anleitung für Anfängerinnen mit Größenübersicht',
        subtitle: 'Gänseblümchen in Weiß und Gelb',
        cta: 'Für später merken',
      },
    };
    const composed = await renderComposedPin(photo, hero);
    expect(composed).toMatchObject({ width: 1000, height: 1500 });
    expect(['top', 'bottom']).toContain(composed.heroPlacement);
    const steps: ComposerMetadata = {
      ...hero,
      templateType: 'step_by_step',
      text: {
        title: 'Cómo hacer una flor de ganchillo',
        steps: [
          { label: 'Paso 1', title: 'Haz un anillo mágico y teje 6 puntos bajos' },
          { label: 'Paso 2', title: 'Verstärkungsschlaufenbefestigungsanleitung' },
          { label: 'Runde 12', title: 'Teje los pétalos alrededor del anillo mágico…' },
        ],
      },
    };
    expect((await renderComposedPin(photo, steps)).minContrast).toBeGreaterThanOrEqual(COMPOSER_MIN_CONTRAST);
  });

  test('older Step-by-step v2 Pins: the three layouts still render 1000×1500 with long titles, accents and every niche palette', async () => {
    const photo = await providerPhoto();
    const photos = await stepPhotos();
    const plan = historicalV2();
    const longTitles: StepByStepV2Metadata['text'] = {
      title: 'Häkelblume Haargummi: Schritt-für-Schritt-Anleitung für Anfängerinnen mit Größenübersicht',
      steps: [
        { label: 'Runde 12', title: 'Verstärkungsschlaufenbefestigungsanleitung' },
        { label: null, title: 'Étaler l’argile sur cinq millimètres…' },
        { label: 'Paso 3', title: 'Mezcla la pasta con el limón y el parmesano' },
      ],
    };
    for (const layout of ['vertical-progression', 'editorial-grid', 'alternating'] as StepByStepLayout[]) {
      for (const niche of [null, ...Object.keys(STEP_PALETTES)]) {
        for (const text of [plan.text, longTitles]) {
          const composed = await renderComposedPin(photo, { ...plan, layout, niche, text }, photos);
          expect(composed, `${layout} / ${niche}`).toMatchObject({ width: 1000, height: 1500 });
          expect(composed.minContrast).toBeGreaterThanOrEqual(COMPOSER_MIN_CONTRAST);
        }
      }
    }
  });

  test('Step-by-step v2 without its three step photos fails — never a partial Pin', async () => {
    const photo = await providerPhoto();
    const photos = await stepPhotos();
    await expect(renderComposedPin(photo, historicalV2(), photos.slice(0, 2))).rejects.toBeInstanceOf(ComposerRenderError);
    await expect(renderComposedPin(photo, historicalV2(), [photos[0], photos[1], Buffer.from('not an image')])).rejects.toBeInstanceOf(ComposerRenderError);
  });

  test('an unreadable photo fails with ComposerRenderError — no partial image', async () => {
    await expect(renderComposedPin(Buffer.from('not an image'), build('hero', CROCHET_EN))).rejects.toBeInstanceOf(ComposerRenderError);
  });
});

// ---------------------------------------------------------------- image route

interface DbOp {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
}

interface ImageRouteRun {
  status: number;
  body: { data: { imageStatus: string; imagesGenerated: number; imagesFailed: number } | null };
  ops: DbOp[];
  uploads: Array<{ key: string; body: Buffer; contentType: string }>;
  removed: string[];
  imageCalls: Array<{ prompt: string; visualFormat?: string }>;
  fetchCalls: number;
}

function composedPin(metadata: ComposerMetadata | null, overrides: Partial<Pin> = {}): Pin {
  const grounding = buildArticleGrounding(CROCHET_EN, 3, {}, { niche: 'Crochet' });
  const sectionId = grounding.sectionPlan[0];
  const grounded = attachArticleSourceMetadata(JSON.stringify({ _pinterestStrategy: { angle: 'curiosity' } }), {
    sourceType: 'external_wordpress_post',
    sectionId,
    brief: grounding.briefs[sectionId],
  });
  return {
    id: 'pin-1',
    generation_id: 'generation-1',
    language: 'en',
    title: 'A Crochet Flower Hair Tie in One Evening',
    description: 'A quick crochet flower hair tie.',
    keywords: 'crochet, hair tie',
    board: 'Crochet',
    board_id: 'board-1',
    board_section: null,
    image_prompt: 'A white and yellow crochet flower hair tie on a plain linen surface, soft daylight, photorealistic.',
    image_analysis: metadata ? attachComposerMetadata(grounded, metadata) : grounded,
    media_url: null,
    link_url: 'https://crochet.example.test/flower-hair-tie/',
    publish_date: '2026-11-02T09:00:00Z',
    visual_format: 'photo-only',
    overlay_text: null,
    title_banner_template: null,
    cta_banner_template: null,
    created_at: '2026-10-28T00:00:00Z',
    updated_at: '2026-10-28T00:00:00Z',
    ...overrides,
  };
}

async function runImageRoute(
  pin: Pin,
  options: { provider: 'supabase' | 'r2'; photo: Buffer; existingVersion?: number; failImageInsert?: boolean; pinIds?: string[]; failImageCall?: number }
): Promise<ImageRouteRun> {
  const run: ImageRouteRun = { status: 0, body: { data: null }, ops: [], uploads: [], removed: [], imageCalls: [], fetchCalls: 0 };

  const result = (rec: DbOp, single: boolean) => {
    if (rec.table === 'generations' && rec.op === 'select') {
      return { data: { id: 'generation-1', image_status: 'completed', status: 'completed', user_id: 'user-1', project_id: 'project-1' }, error: null };
    }
    if (rec.table === 'projects') return { data: { niche: 'Crochet' }, error: null };
    if (rec.table === 'pins' && rec.op === 'select') return { data: [pin], error: null };
    if (rec.table === 'pin_images' && rec.op === 'select') {
      const activeLookup = rec.filters.some(([, column]) => column === 'is_active');
      if (activeLookup) return { data: options.existingVersion ? [{ id: 'img-old' }] : [], error: null };
      return { data: options.existingVersion ? [{ version: options.existingVersion }] : [], error: null };
    }
    if (rec.table === 'pin_images' && rec.op === 'insert' && single) {
      return options.failImageInsert ? { data: null, error: { message: 'insert denied' } } : { data: { id: 'img-new' }, error: null };
    }
    return { data: null, error: null };
  };

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }) },
    from(table: string) {
      const rec: DbOp = { table, op: 'select', filters: [] };
      run.ops.push(rec);
      const filter = (kind: string) => (column: string, value: unknown) => {
        rec.filters.push([kind, column, value]);
        return query;
      };
      const query = {
        select: () => query,
        eq: filter('eq'),
        in: filter('in'),
        is: filter('is'),
        neq: filter('neq'),
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
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result(rec, false)).then(resolve, reject),
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
    provider: options.provider,
    upload: async (input: { key: string; body: Buffer; contentType: string }) => {
      run.uploads.push(input);
      return { provider: options.provider, key: input.key, publicUrl: `https://media.test/${input.key}` };
    },
    read: async () => Buffer.alloc(0),
    remove: async (keys: string[]) => {
      run.removed.push(...keys);
    },
    list: async () => [],
    publicUrl: (key: string) => `https://media.test/${key}`,
  };

  const fakes: Record<string, unknown> = {
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/rate-limit': {
      checkRateLimit: async () => ({ allowed: true }),
      rateLimitErrorResponse: () => {
        throw new Error('rate limit response must not be reached');
      },
    },
    '@/lib/storage': { createMediaStorage: () => storage },
    '@/lib/ai/engine': {
      generateImage: async (input: { prompt: string; visualFormat?: string }) => {
        run.imageCalls.push({ prompt: input.prompt, visualFormat: input.visualFormat });
        if (options.failImageCall === run.imageCalls.length) throw new Error('provider timeout');
        return options.photo;
      },
      resolveImageModel: (visualFormat?: string) => ({ provider: 'openrouter', model: `test/${visualFormat ?? 'photo'}-model` }),
      generateText: async () => {
        throw new Error('Text generation must not be called');
      },
      analyzeImage: async () => {
        throw new Error('Vision must not be called');
      },
    },
  };

  const routeKey = require.resolve('@/app/api/pinterest/generate-images/route');
  const keys = [...Object.keys(fakes).map((specifier) => require.resolve(specifier)), routeKey];
  const originals = new Map<string, NodeJS.Module | undefined>(keys.map((key) => [key, require.cache[key]]));
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalWarn = console.warn;

  try {
    for (const [specifier, exports] of Object.entries(fakes)) {
      const filename = require.resolve(specifier);
      require.cache[filename] = {
        id: filename,
        filename,
        loaded: true,
        exports,
        children: [],
        paths: [],
        path: '',
        parent: null,
        isPreloading: false,
        require,
      } as unknown as NodeJS.Module;
    }
    delete require.cache[routeKey];
    globalThis.fetch = (async () => {
      run.fetchCalls += 1;
      throw new Error('No network call is allowed in this test');
    }) as typeof fetch;
    console.log = () => undefined;
    console.warn = () => undefined;

    // CommonJS load: the route must be re-evaluated after its dependencies were replaced.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require('@/app/api/pinterest/generate-images/route') as { POST: (request: Request) => Promise<Response> };
    const response = await route.POST(
      new Request('http://localhost/api/pinterest/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: '11111111-1111-4111-8111-111111111111', ...(options.pinIds ? { pinIds: options.pinIds } : {}) }),
      })
    );
    run.status = response.status;
    run.body = (await response.json()) as ImageRouteRun['body'];
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }
  return run;
}

const opsOf = (run: ImageRouteRun, table: string, op: DbOp['op']) => run.ops.filter((item) => item.table === table && item.op === op);

test.describe('Image route — composed Pins (generate and regenerate)', () => {
  for (const provider of ['supabase', 'r2'] as const) {
    test(`${provider}: older Step-by-step v2 Pin — 4 photo-only image calls at most, one composed 1000×1500 JPEG stored, then activated`, async () => {
      const metadata = historicalV2();
      const run = await runImageRoute(composedPin(metadata), { provider, photo: await providerPhoto() });
      expect(run.status).toBe(200);
      expect(run.body.data).toEqual({ imageStatus: 'completed', imagesGenerated: 1, imagesFailed: 0 });
      expect(run.fetchCalls).toBe(0);

      // The finished project, then one photo per step panel, from its stored prompt.
      expect(run.imageCalls).toHaveLength(STEP_BY_STEP_IMAGE_CALLS);
      expect(run.imageCalls.every((call) => call.visualFormat === 'photo-only')).toBe(true);
      expect(run.imageCalls[0].prompt).toContain('COMPOSED STEP-BY-STEP PIN');
      expect(run.imageCalls[0].prompt).toContain('ARTICLE-GROUNDED VISUAL BRIEF');
      expect(run.imageCalls.slice(1).map((call) => call.prompt)).toEqual(metadata.panels.map((panel) => panel.imagePrompt));
      // Intermediate photos stay in memory: one single upload, the final Pin.

      expect(run.uploads).toHaveLength(1);
      const [upload] = run.uploads;
      expect(upload.key).toBe(
        provider === 'r2' ? 'images/pinterest/user-1/11111111-1111-4111-8111-111111111111/pin-1/1.jpg' : 'user-1/pin-1/1.jpg'
      );
      expect(upload.contentType).toBe('image/jpeg');
      expect(await sharp(upload.body).metadata()).toMatchObject({ format: 'jpeg', width: 1000, height: 1500 });

      const [inserted] = opsOf(run, 'pin_images', 'insert');
      expect(inserted.payload).toMatchObject({ pin_id: 'pin-1', storage_path: upload.key, url: `https://media.test/${upload.key}`, is_active: false, version: 1, image_model: 'test/photo-only-model' });
      expect(opsOf(run, 'pin_images', 'update').map((item) => item.payload)).toEqual([{ is_active: true }]);
      expect(run.removed).toEqual([]);
    });
  }

  test('only the image changes: text, Destination URL (UTM), schedule and board are never written', async () => {
    const metadata = build('hero', CROCHET_EN, { hasDestination: true });
    const pin = composedPin(metadata);
    const run = await runImageRoute(pin, { provider: 'r2', photo: await providerPhoto() });
    const pinUpdates = opsOf(run, 'pins', 'update');
    expect(pinUpdates).toHaveLength(1);
    const payload = pinUpdates[0].payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['image_analysis', 'media_url']);
    const stored = readComposerMetadata(payload.image_analysis as string)!;
    expect(stored).toEqual({ ...metadata, status: 'rendered' });
    // Other metadata (strategy, article brief) kept.
    expect(readArticleSourceMetadata(payload.image_analysis as string)).toEqual(readArticleSourceMetadata(pin.image_analysis));
    expect(JSON.parse(payload.image_analysis as string)._pinterestStrategy).toEqual({ angle: 'curiosity' });
    // No WordPress, generation text or other table is written.
    const written = run.ops.filter((item) => item.op !== 'select').map((item) => item.table);
    expect([...new Set(written)].sort()).toEqual(['generations', 'pin_images', 'pins']);
  });

  test('Regenerate image keeps the template, the sections and the text; the previous image is replaced only at the end', async () => {
    const metadata = build('materials_and_tools', CROCHET_EN);
    const pin = composedPin(null, { image_analysis: markComposerRendered(composedPin(metadata).image_analysis, metadata, []), media_url: 'https://media.test/old.jpg' });
    const run = await runImageRoute(pin, { provider: 'supabase', photo: await providerPhoto(), existingVersion: 1, pinIds: ['33333333-3333-4333-8333-333333333333'] });
    expect(run.body.data?.imagesGenerated).toBe(1);
    expect(run.uploads[0].key).toBe('user-1/pin-1/2.jpg');
    const updates = opsOf(run, 'pin_images', 'update');
    expect(updates.map((item) => item.payload)).toEqual([{ is_active: false }, { is_active: true }]);
    expect(updates[0].filters).toContainEqual(['in', 'id', ['img-old']]);
    expect(updates[1].filters).toContainEqual(['eq', 'id', 'img-new']);
    const payload = opsOf(run, 'pins', 'update')[0].payload as Record<string, unknown>;
    const stored = readComposerMetadata(payload.image_analysis as string)!;
    expect(stored.templateType).toBe('materials_and_tools');
    expect(stored.text).toEqual(metadata.text);
    expect(stored.sourceSections).toEqual(metadata.sourceSections);
  });

  test('a composition failure stores nothing: no upload, no image row, the current image stays active', async () => {
    const run = await runImageRoute(composedPin(build('hero', CROCHET_EN)), { provider: 'r2', photo: Buffer.from('not an image'), existingVersion: 1 });
    expect(run.status).toBe(200);
    expect(run.body.data).toEqual({ imageStatus: 'failed', imagesGenerated: 0, imagesFailed: 1 });
    expect(run.uploads).toEqual([]);
    expect(opsOf(run, 'pin_images', 'insert')).toEqual([]);
    expect(opsOf(run, 'pin_images', 'update')).toEqual([]);
    expect(opsOf(run, 'pins', 'update')).toEqual([]);
  });

  test('a refused image row removes the uploaded file; the current image and the Pin stay unchanged (retry possible)', async () => {
    const run = await runImageRoute(composedPin(build('hero', CROCHET_EN)), { provider: 'r2', photo: await providerPhoto(), existingVersion: 1, failImageInsert: true });
    expect(run.body.data).toEqual({ imageStatus: 'failed', imagesGenerated: 0, imagesFailed: 1 });
    expect(run.uploads).toHaveLength(1);
    expect(run.removed).toEqual([run.uploads[0].key]);
    expect(opsOf(run, 'pin_images', 'update')).toEqual([]);
    expect(opsOf(run, 'pins', 'update')).toEqual([]);
    const generationUpdates = opsOf(run, 'generations', 'update').map((item) => item.payload);
    expect(generationUpdates).toContainEqual({ image_status: 'failed' });
  });

  test('a failed step photo stores nothing: no upload, no image row, the Pin and its current image unchanged', async () => {
    const run = await runImageRoute(composedPin(historicalV2()), { provider: 'r2', photo: await providerPhoto(), existingVersion: 1, failImageCall: 3 });
    expect(run.body.data).toEqual({ imageStatus: 'failed', imagesGenerated: 0, imagesFailed: 1 });
    // Stopped at the failing panel: no further paid call.
    expect(run.imageCalls).toHaveLength(3);
    expect(run.uploads).toEqual([]);
    expect(opsOf(run, 'pin_images', 'insert')).toEqual([]);
    expect(opsOf(run, 'pin_images', 'update')).toEqual([]);
    expect(opsOf(run, 'pins', 'update')).toEqual([]);
  });

  test('Regenerate image of a Step-by-step Pin keeps the template, layout, sections, text, Destination URL and schedule', async () => {
    const metadata = historicalV2();
    const pin = composedPin(null, { image_analysis: markComposerRendered(composedPin(metadata).image_analysis, metadata, []), media_url: 'https://media.test/old.jpg' });
    const run = await runImageRoute(pin, { provider: 'r2', photo: await providerPhoto(), existingVersion: 2, pinIds: ['33333333-3333-4333-8333-333333333333'] });
    expect(run.body.data?.imagesGenerated).toBe(1);
    expect(run.imageCalls).toHaveLength(4);
    const payload = opsOf(run, 'pins', 'update')[0].payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['image_analysis', 'media_url']);
    const stored = readComposerMetadata(payload.image_analysis as string)!;
    expect(stored).toEqual({ ...metadata, status: 'rendered' });
  });

  test('an older Step-by-step v1 Pin keeps its single-photo layout on regeneration (one image call)', async () => {
    const v1: ComposerMetadata = {
      templateType: 'step_by_step',
      templateVersion: 'v1',
      sourceSections: ['s2', 's3', 's4'],
      sourceHeadings: ['Step 1: Make a magic ring', 'Step 2: Crochet the five petals', 'Step 3: Sew the flower to the hair tie'],
      renderedBy: 'omniflow-composer',
      language: 'en',
      status: 'rendered',
      warnings: [],
      text: {
        title: 'How to Make a Crochet Flower Hair Tie: Free Pattern',
        steps: [
          { label: 'Step 1', title: 'Make a magic ring' },
          { label: 'Step 2', title: 'Crochet the five petals' },
          { label: 'Step 3', title: 'Sew the flower to the hair tie' },
        ],
      },
    };
    expect(readComposerMetadata(attachComposerMetadata(null, v1))).toEqual(v1);
    const run = await runImageRoute(composedPin(v1), { provider: 'supabase', photo: await providerPhoto(), existingVersion: 1 });
    expect(run.body.data?.imagesGenerated).toBe(1);
    expect(run.imageCalls).toHaveLength(1);
    expect(run.imageCalls[0].prompt).toContain('COMPOSED PIN PHOTO');
    expect(readComposerMetadata((opsOf(run, 'pins', 'update')[0].payload as Record<string, unknown>).image_analysis as string)).toEqual(v1);
  });

  test('a Classic Pin keeps its existing path: one image call, no composition, no composer contract', async () => {
    const run = await runImageRoute(composedPin(null), { provider: 'r2', photo: await providerPhoto() });
    expect(run.body.data?.imagesGenerated).toBe(1);
    expect(run.imageCalls).toHaveLength(1);
    expect(run.imageCalls[0].prompt).not.toContain('COMPOSED PIN PHOTO');
    const pinUpdate = opsOf(run, 'pins', 'update')[0]?.payload as Record<string, unknown> | undefined;
    expect(pinUpdate?.image_analysis === undefined || readComposerMetadata(pinUpdate.image_analysis as string) === null).toBe(true);
    // The existing path inserts the row active directly (unchanged behavior).
    expect(opsOf(run, 'pin_images', 'insert')[0].payload).toMatchObject({ is_active: true });
  });
});
