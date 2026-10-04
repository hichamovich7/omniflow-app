import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import {
  generatePinsSchema,
  pinsRequestedSchema,
  validatePinsRequested,
  PINS_REQUESTED_RANGE_MESSAGE,
  PINS_REQUESTED_WHOLE_MESSAGE,
} from '@/lib/validations/pinterest';
import {
  buildPinterestAnglePlan,
  validatePinterestStrategyBatch,
  type PinterestStrategyPin,
} from '@/lib/pinterest/strategy';
import { buildPinterestPinsPrompt } from '@/lib/prompts/pinterest-pins';
import { guideSections } from '@/lib/guide/content';
import {
  DEFAULT_ARTICLE_PINS_REQUESTED,
  DEFAULT_PINS_REQUESTED,
  PINS_MAX,
  PINS_MIN,
  PINS_OPTIONS,
  PINTEREST_ANGLES,
  type PinterestAngle,
} from '@/types/pinterest';

/**
 * Custom number of Pinterest Pins (TASK-046): any whole number from 1 to 30,
 * balanced angles (every angle before any repeat), real variants above five,
 * no destination URL ever added. Offline — no AI, no Supabase, no network.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const ARTICLE_ID = '22222222-2222-4222-8222-222222222222';
const base = { projectId: PROJECT_ID, keyword: 'clay coasters', language: 'en', generationMode: 'photo-only' } as const;

const SUBJECTS = [
  'marbled coasters', 'terracotta stamps', 'speckled glaze', 'cork backing', 'sage drying rack',
  'ochre gift box', 'linen wrap', 'oak tray', 'ceramic dish', 'rope handle', 'blue slip', 'stone texture',
];
const HOOKS = [
  'The Detail Behind', 'Why Makers Rethink', 'Ideas Worth Saving for', 'A Fresh Take on',
  'Inside the Guide to', 'What Changes With', 'Notes on Finishing', 'Rethinking Everyday',
];

function variantPins(angles: PinterestAngle[]): PinterestStrategyPin[] {
  return angles.map((angle, index) => ({
    angle,
    title: `${HOOKS[index % HOOKS.length]} ${SUBJECTS[index % SUBJECTS.length]} ${['at home', 'this season', 'on the table', 'for gifting'][index % 4]}`,
    description: `Pin ${['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu'][index]} explores ${SUBJECTS[index % SUBJECTS.length]} with its own promise and reason to click.`,
    image_prompt: `A ${SUBJECTS[(index + 3) % SUBJECTS.length]} scene, ${['overhead', 'eye-level', 'close-up', 'three-quarter'][index % 4]} angle, palette ${index}.`,
  }));
}

test.describe('Number of Pins — validation', () => {
  test('defaults are unchanged: 10 for the keyword flow, 5 from an article, presets kept', () => {
    expect(DEFAULT_PINS_REQUESTED).toBe(10);
    expect(DEFAULT_ARTICLE_PINS_REQUESTED).toBe(5);
    expect([...PINS_OPTIONS]).toEqual([1, 3, 5, 7, 8, 10, 20, 30]);
    expect([PINS_MIN, PINS_MAX]).toEqual([1, 30]);
    const form = read('components/pinterest/pin-form.tsx');
    expect(form).toContain('articleSource ? DEFAULT_ARTICLE_PINS_REQUESTED : DEFAULT_PINS_REQUESTED');
  });

  test('accepts a custom value of 6 (number or numeric string), and 7 and 12', () => {
    expect(generatePinsSchema.safeParse({ ...base, pinsRequested: 6 }).success).toBe(true);
    const fromString = generatePinsSchema.safeParse({ ...base, pinsRequested: '6' });
    expect(fromString.success && fromString.data.pinsRequested).toBe(6);
    for (const value of [7, 12]) expect(validatePinsRequested(value)).toEqual({ ok: true, value });
  });

  test('accepts the bounds 1 and 30, in both flows', () => {
    for (const pinsRequested of [1, 30]) {
      expect(generatePinsSchema.safeParse({ ...base, pinsRequested }).success).toBe(true);
      expect(generatePinsSchema.safeParse({ ...base, pinsRequested, wordpressArticleId: ARTICLE_ID }).success).toBe(true);
    }
    for (let n = PINS_MIN; n <= PINS_MAX; n++) expect(pinsRequestedSchema.safeParse(n).success).toBe(true);
  });

  test('refuses 0, negatives, decimals, values above 30 and non-numbers', () => {
    for (const value of [0, -1, -6, 31, 100, '0', '31', '', '  ', 'six', null, undefined, true, Number.NaN, Infinity]) {
      expect(generatePinsSchema.safeParse({ ...base, pinsRequested: value }).success, String(value)).toBe(false);
    }
    expect(validatePinsRequested(0)).toEqual({ ok: false, message: PINS_REQUESTED_RANGE_MESSAGE });
    expect(validatePinsRequested(31)).toEqual({ ok: false, message: PINS_REQUESTED_RANGE_MESSAGE });
    expect(validatePinsRequested(-3)).toEqual({ ok: false, message: PINS_REQUESTED_RANGE_MESSAGE });
    for (const value of [6.5, '6.5', 1.1]) {
      expect(validatePinsRequested(value)).toEqual({ ok: false, message: PINS_REQUESTED_WHOLE_MESSAGE });
    }
  });

  test('the form offers a Custom value checked with the same rule before sending', () => {
    const form = read('components/pinterest/pin-form.tsx');
    expect(form).toContain('<SelectItem value={CUSTOM_PINS_VALUE}>Custom…</SelectItem>');
    expect(form).toContain('id="pins-custom"');
    expect(form).toContain('min={PINS_MIN}');
    expect(form).toContain('max={PINS_MAX}');
    expect(form).toContain('validatePinsRequested(pinsChoice === CUSTOM_PINS_VALUE ? customPins : pinsChoice)');
    // The check happens before the request: an invalid value returns early.
    const check = form.indexOf('if (!pinsCheck.ok)');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(form.indexOf("fetch('/api/pinterest/generate'"));
  });

  test('every flow uses the same field: keyword, from an article, and Regenerate', () => {
    const regenerate = read('components/pinterest/regenerate-generation-button.tsx');
    expect(regenerate).toContain('body: JSON.stringify({ projectId, keyword, language, pinsRequested })');
    // A saved custom count (e.g. 6) is accepted again by the same schema.
    expect(generatePinsSchema.safeParse({ ...base, pinsRequested: 6, generationMode: undefined }).success).toBe(true);
  });
});

test.describe('Number of Pins — angles', () => {
  test('the plan keeps the five angles and covers them all before any repeat', () => {
    expect(buildPinterestAnglePlan(5)).toEqual([...PINTEREST_ANGLES]);
    expect(buildPinterestAnglePlan(3)).toEqual(PINTEREST_ANGLES.slice(0, 3));
    expect(buildPinterestAnglePlan(1)).toEqual(['curiosity']);
    const six = buildPinterestAnglePlan(6);
    expect(six.slice(0, 5)).toEqual([...PINTEREST_ANGLES]);
    expect(six[5]).toBe('curiosity');
    for (const n of [6, 7, 12, 30]) {
      const plan = buildPinterestAnglePlan(n);
      expect(plan).toHaveLength(n);
      const counts = PINTEREST_ANGLES.map((angle) => plan.filter((a) => a === angle).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      // No angle repeats before all five are used.
      expect(new Set(plan.slice(0, 5)).size).toBe(5);
    }
  });

  test('the prompt gives the exact angle order for custom counts and keeps 5 / 10 wording', () => {
    const prompt = (pinsRequested: number) =>
      buildPinterestPinsPrompt({ keyword: 'clay coasters', language: 'en', pinsRequested, textOverlayMode: 'auto' }).user;
    expect(prompt(6)).toContain('Generate 6 unique Pinterest pins');
    expect(prompt(6)).toContain('pin 1 = "curiosity", pin 2 = "problem-solution", pin 3 = "listicle", pin 4 = "discovery", pin 5 = "article-promise", pin 6 = "curiosity"');
    expect(prompt(6)).toContain('Pins that share an angle must use different hook structures, promises, descriptions, and image scenes');
    expect(prompt(3)).toContain('Every pin uses a different angle.');
    expect(prompt(30)).toContain('pin 30 = "article-promise"');
    expect(prompt(5)).toContain('Use each of the five angles exactly once in this batch.');
    expect(prompt(10)).toContain('Use each of the five angles exactly twice');
  });

  test('balanced batches of 6, 7 and 12 with real variants pass', () => {
    for (const n of [6, 7, 12]) {
      expect(validatePinterestStrategyBatch(variantPins(buildPinterestAnglePlan(n)), n), String(n)).toEqual([]);
    }
  });

  test('a repeated angle before all five are covered is refused (3 and 6 Pins)', () => {
    const three = variantPins(['curiosity', 'curiosity', 'listicle']);
    expect(validatePinterestStrategyBatch(three, 3)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'angle-coverage' })])
    );
    const six = variantPins(['curiosity', 'curiosity', 'curiosity', 'listicle', 'discovery', 'article-promise']);
    expect(validatePinterestStrategyBatch(six, 6)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'angle-coverage' })])
    );
    // AI-recommended / manual strategies keep their freedom (no balance enforced).
    expect(
      validatePinterestStrategyBatch(three, 3, '', { enforceBalancedAngles: false }).filter((i) => i.code === 'angle-coverage')
    ).toEqual([]);
  });

  test('above five, Pins sharing an angle must really differ', () => {
    const pins = variantPins(buildPinterestAnglePlan(7));
    pins[5] = { ...pins[5], description: pins[0].description, image_prompt: pins[0].image_prompt };
    expect(validatePinterestStrategyBatch(pins, 7)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'near-duplicate-variant', pinIndexes: [0, 5] })])
    );
  });

  test('a partial batch is not judged on balance', () => {
    expect(validatePinterestStrategyBatch(variantPins(['curiosity', 'curiosity']), 6)).toEqual([]);
  });
});

test.describe('Number of Pins — no destination URL', () => {
  test('the generator never adds a link_url, and website_url only comes from the request', () => {
    const route = read('app/api/pinterest/generate/route.ts');
    expect(route).not.toContain('link_url');
    expect(route).toContain('website_url: websiteUrl ?? null');
    expect(route.match(/website_url/g)).toHaveLength(1);
  });

  test('an article-based request still refuses destination URLs for any count', () => {
    for (const pinsRequested of [1, 6, 30]) {
      const parsed = generatePinsSchema.safeParse({
        ...base,
        pinsRequested,
        wordpressArticleId: ARTICLE_ID,
        websiteUrl: 'https://example.com/post',
      });
      expect(parsed.success).toBe(false);
    }
  });

  test('the prompt for a custom count asks for no URL field', () => {
    const user = buildPinterestPinsPrompt({ keyword: 'clay coasters', language: 'en', pinsRequested: 12, textOverlayMode: 'auto' }).user;
    expect(user).not.toMatch(/link_url|website_url|destination url/i);
  });
});

test('the in-app Guide documents the custom number of Pins', () => {
  const text = guideSections.find((s) => s.id === 'generate')!.points.join('\n');
  expect(text).toContain('"Custom…"');
  expect(text).toMatch(/any whole number from 1 to 30/);
  expect(text).toMatch(/No destination link is ever added/);
});
