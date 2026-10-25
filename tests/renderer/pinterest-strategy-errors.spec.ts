import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { validatePinterestStrategyBatch, type PinterestStrategyIssue } from '@/lib/pinterest/strategy';
import {
  buildStrategySafeguardError,
  isStrategySafeguardError,
  MAX_RESPONSE_ISSUES,
  STRATEGY_SAFEGUARD_ERROR_CODE,
  strategySafeguardLogLine,
  strategySafeguardSummary,
} from '@/lib/pinterest/strategy-errors';
import { validateDistinctAngles } from '@/lib/social/pinterest-from-article';
import { strategySafeguardView } from '@/components/pinterest/strategy-safeguard-alert';
import { PINTEREST_ANGLES, type PinterestAngle } from '@/types/pinterest';

/**
 * Strategy-safeguard errors (422 strategy_safeguard_failed): the user sees
 * which check failed, on which Pin and field, and what to do — instead of the
 * former single generic sentence. The safeguards themselves are unchanged.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const DISTINCT = [
  { title: 'Hidden corner shelves for a tiny bathroom', description: 'Corner shelves turn wasted angles into storage for towels and jars.', image_prompt: 'Corner shelf with folded towels, sage wall, eye-level.' },
  { title: 'Why your vanity drawers always overflow', description: 'Drawer dividers keep makeup and hair tools apart so nothing spills over.', image_prompt: 'Open vanity drawer with bamboo dividers, overhead.' },
  { title: 'Mirror cabinets that double as a medicine chest', description: 'A recessed mirror cabinet hides daily products behind one clean surface.', image_prompt: 'Recessed mirror cabinet half open, warm light.' },
  { title: 'Over-the-door hooks nobody notices', description: 'Slim door hooks hold robes and baskets without drilling into tiles.', image_prompt: 'Back of a bathroom door with linen robes on hooks.' },
  { title: 'A rolling cart beside the tub', description: 'A narrow rolling cart slides out for bath time and tucks away after.', image_prompt: 'Narrow white rolling cart beside a freestanding tub.' },
];

function batch(angles: PinterestAngle[] = [...PINTEREST_ANGLES]) {
  return angles.map((angle, index) => ({ angle, ...DISTINCT[index % DISTINCT.length] }));
}

const EVIDENCE = 'small bathroom storage ideas';

test.describe('Each safeguard has an explicit code, Pin and field', () => {
  test('a clean batch has no issue (the safeguards still pass valid content)', () => {
    expect(validatePinterestStrategyBatch(batch(), 5, EVIDENCE)).toEqual([]);
  });

  test('UNBALANCED_ANGLES: batch-wide, no Pin number, counts in the message', () => {
    const issues = validatePinterestStrategyBatch(batch(['curiosity', 'curiosity', 'listicle', 'discovery', 'article-promise']), 5, EVIDENCE);
    const error = buildStrategySafeguardError(issues.filter((issue) => issue.code === 'angle-coverage'));
    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'UNBALANCED_ANGLES', field: 'angle' }),
    ]);
    expect(error.issues[0].pinIndex).toBeUndefined();
    expect(error.issues[0].message).toContain('expected 1 per angle');
    expect(error.issues[0].message).toContain('curiosity=2');
    expect(error.issues[0].message).toContain('problem-solution=0');
  });

  test('DUPLICATE_ANGLE (article flow below 5 Pins): on the Pin that repeats it', () => {
    const issues = validateDistinctAngles([{ angle: 'curiosity' }, { angle: 'listicle' }, { angle: 'curiosity' }], 3);
    expect(buildStrategySafeguardError(issues).issues).toEqual([
      expect.objectContaining({ code: 'DUPLICATE_ANGLE', pinIndex: 3, field: 'angle', message: expect.stringContaining('"curiosity"') }),
    ]);
  });

  test('DUPLICATE_TITLE: the later Pin, with the Pin it duplicates', () => {
    const pins = batch();
    pins[3] = { ...pins[3], title: pins[1].title };
    const [issue] = buildStrategySafeguardError(validatePinterestStrategyBatch(pins, 5, EVIDENCE)).issues;
    expect(issue).toMatchObject({ code: 'DUPLICATE_TITLE', pinIndex: 4, relatedPinIndex: 2, field: 'title' });
    expect(issue.message).toBe("Pin 4's title is too close to Pin 2's title.");
  });

  test('DUPLICATE_PIN: a repeated-angle variant copied from another, on the copied field', () => {
    const pins = batch([...PINTEREST_ANGLES, 'curiosity']);
    pins[5] = { ...pins[5], title: 'A different promise entirely for small baths', description: pins[0].description, image_prompt: 'Something else, overhead, linen.' };
    const issues = validatePinterestStrategyBatch(pins, 6, EVIDENCE).filter((issue) => issue.code === 'near-duplicate-variant');
    expect(buildStrategySafeguardError(issues).issues).toEqual([
      expect.objectContaining({ code: 'DUPLICATE_PIN', pinIndex: 6, relatedPinIndex: 1, field: 'description' }),
    ]);
  });

  test('UNSUPPORTED_NUMBER and UNSUPPORTED_CLAIM: on the Pin and field that make them', () => {
    const pins = batch();
    pins[1] = { ...pins[1], title: '17 vanity drawer tricks' };
    pins[2] = { ...pins[2], description: 'An easy mirror cabinet anyone can hang.' };
    const issues = buildStrategySafeguardError(validatePinterestStrategyBatch(pins, 5, EVIDENCE)).issues;
    expect(issues).toEqual([
      expect.objectContaining({ code: 'UNSUPPORTED_NUMBER', pinIndex: 2, field: 'title', message: expect.stringContaining('(17)') }),
      expect.objectContaining({ code: 'UNSUPPORTED_CLAIM', pinIndex: 3, field: 'description', message: expect.stringContaining('"beginner/easy"') }),
    ]);
  });

  test('article-grounding codes get a readable message and action', () => {
    const issues: PinterestStrategyIssue[] = [
      { code: 'unsupported-claim', message: 'internal', reason: 'MISSING_SOURCE_SECTION', pinIndex: 0, field: 'sourceSectionId' },
      { code: 'unsupported-claim', message: 'internal', reason: 'DUPLICATE_SOURCE_SECTION', pinIndex: 2, pinIndexes: [1, 2], field: 'sourceSectionId' },
      { code: 'unsupported-claim', message: 'internal', reason: 'IMAGE_SUBJECT_MISMATCH', pinIndex: 3, field: 'image_prompt' },
      { code: 'unsupported-claim', message: 'internal', reason: 'UNGROUNDED_IMAGE_ELEMENTS', pinIndex: 4, field: 'image_prompt', details: ['cowl', 'wool'] },
    ];
    const error = buildStrategySafeguardError(issues);
    expect(error.issues.map((issue) => [issue.code, issue.pinIndex])).toEqual([
      ['MISSING_SOURCE_SECTION', 1],
      ['DUPLICATE_SOURCE_SECTION', 3],
      ['IMAGE_SUBJECT_MISMATCH', 4],
      ['UNGROUNDED_IMAGE_ELEMENTS', 5],
    ]);
    expect(error.issues[1].message).toBe('Pins 2 and 3 are built from the same article section.');
    expect(error.issues[3].message).toContain('cowl, wool');
    for (const issue of error.issues) {
      expect(issue.message).not.toContain('internal');
      expect(issue.action.length).toBeGreaterThan(0);
    }
  });

  test('an issue without a reason still maps from its family (never an empty code)', () => {
    const [issue] = buildStrategySafeguardError([{ code: 'near-duplicate-title', message: 'x', pinIndexes: [0, 1] }]).issues;
    expect(issue.code).toBe('DUPLICATE_TITLE');
  });
});

test.describe('The error object', () => {
  test('several problems in one batch: global count, every issue listed, retryable', () => {
    const pins = batch(['curiosity', 'curiosity', 'listicle', 'discovery', 'article-promise']);
    pins[4] = { ...pins[4], title: '17 cart tricks', description: 'Free and easy cart ideas.' };
    const issues = validatePinterestStrategyBatch(pins, 5, EVIDENCE);
    const error = buildStrategySafeguardError(issues);
    expect(error.code).toBe(STRATEGY_SAFEGUARD_ERROR_CODE);
    expect(error.issueCount).toBe(issues.length);
    expect(error.issueCount).toBeGreaterThanOrEqual(3);
    expect(error.message).toBe(`The AI's Pins were rejected by ${issues.length} quality checks. Nothing was saved.`);
    expect(error.retryable).toBe(true);
    expect(new Set(error.issues.map((issue) => issue.code))).toEqual(
      new Set(['UNBALANCED_ANGLES', 'UNSUPPORTED_NUMBER', 'UNSUPPORTED_CLAIM'])
    );
  });

  test('issues are capped for the browser, the total is kept', () => {
    const many: PinterestStrategyIssue[] = Array.from({ length: MAX_RESPONSE_ISSUES + 5 }, (_, index) => ({
      code: 'unsupported-claim', message: 'x', reason: 'UNSUPPORTED_CLAIM', pinIndex: index, field: 'title', details: ['free'],
    }));
    const error = buildStrategySafeguardError(many);
    expect(error.issues).toHaveLength(MAX_RESPONSE_ISSUES);
    expect(error.issueCount).toBe(MAX_RESPONSE_ISSUES + 5);
    expect(strategySafeguardSummary(error)).toContain(`(+${MAX_RESPONSE_ISSUES + 2} more)`);
  });

  test('one Pin regenerated: no Pin number, its own wording', () => {
    const error = buildStrategySafeguardError(
      [{ code: 'near-duplicate-title', message: 'x', reason: 'DUPLICATE_TITLE', pinIndex: 0, field: 'title' }],
      'pin'
    );
    expect(error.message).toBe('The regenerated Pin was rejected by 1 quality check. The Pin was not changed.');
    expect(error.issues[0]).toEqual({
      code: 'DUPLICATE_TITLE',
      field: 'title',
      message: "The Pin's title is too close to another Pin's title.",
      action: 'Try again so each Pin gets a distinct title.',
    });
  });

  test('retryable vs not: only a structured, retryable error offers "Try again"', () => {
    const retryable = buildStrategySafeguardError([{ code: 'unsupported-claim', message: 'x', reason: 'UNSUPPORTED_CLAIM', pinIndex: 0 }]);
    expect(isStrategySafeguardError(retryable)).toBe(true);
    // Any other API error (plan failure, auth, ownership…) is not a safeguard error: no retry button.
    expect(isStrategySafeguardError({ message: 'Unauthorized', code: 'unauthorized' })).toBe(false);
    expect(isStrategySafeguardError({ message: 'x', code: 'invalid_pin_plan' })).toBe(false);
    expect(isStrategySafeguardError(null)).toBe(false);

    expect(strategySafeguardView(retryable, true).showRetry).toBe(true);
    expect(strategySafeguardView({ ...retryable, retryable: false }, true).showRetry).toBe(false);
    // No retry handler on that screen → no button either.
    expect(strategySafeguardView(retryable, false).showRetry).toBe(false);
    // The button is rendered only from that flag.
    expect(read('components/pinterest/strategy-safeguard-alert.tsx')).toMatch(/\{view\.showRetry && \(/);
  });
});

test.describe('Readable display, nothing sensitive', () => {
  const SECRET = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789';
  const PROMPT_FRAGMENT = 'You are a Pinterest strategist';

  function leakyIssues(): PinterestStrategyIssue[] {
    // The internal message may quote model output — it must never be shown or logged.
    return [
      { code: 'unsupported-claim', message: `Pin 1 has no planned source section (got "${SECRET} ${PROMPT_FRAGMENT}")`, reason: 'MISSING_SOURCE_SECTION', pinIndex: 0, field: 'sourceSectionId' },
      { code: 'near-duplicate-title', message: `Titles 1 and 2 are too similar: ${PROMPT_FRAGMENT}`, reason: 'DUPLICATE_TITLE', pinIndex: 1, pinIndexes: [0, 1], field: 'title' },
      { code: 'angle-coverage', message: 'Expected 1 pin(s) per Pinterest angle', reason: 'UNBALANCED_ANGLES', field: 'angle', details: ['1', 'curiosity=2'] },
    ];
  }

  test('the alert shows the general message, the count, Pin, field, explanation and action', () => {
    const error = buildStrategySafeguardError(leakyIssues());
    const view = strategySafeguardView(error, false);
    expect(view.message).toContain('rejected by 3 quality checks');
    expect(view.countLabel).toBe('3 problems found');
    expect(view.items.map((item) => item.location)).toEqual([
      'Pin 1 · Article section',
      'Pin 2 · Title',
      // Batch-wide problem: field only, no Pin number.
      'Angle',
    ]);
    expect(view.items[1]).toMatchObject({
      message: "Pin 2's title is too close to Pin 1's title.",
      action: 'Try again so each Pin gets a distinct title.',
    });
    expect(view.items[2].message).toContain('curiosity=2');
    expect(view.hiddenCount).toBe(0);
    // Rendered inside the shared danger Alert (role="alert").
    expect(read('components/pinterest/strategy-safeguard-alert.tsx')).toContain('<Alert data-testid="strategy-safeguard-error">');
  });

  test('no secret, prompt or raw model text in the response, the stored message or the log line', () => {
    const issues = leakyIssues();
    const error = buildStrategySafeguardError(issues);
    const surfaces = [
      JSON.stringify(error),
      strategySafeguardSummary(error),
      strategySafeguardLogLine(issues, { step: 'generate', model: 'google/gemini-2.5-flash', role: 'FAST' }),
      JSON.stringify(strategySafeguardView(error, true)),
    ];
    for (const surface of surfaces) {
      expect(surface).not.toContain(SECRET);
      expect(surface).not.toContain('sk-or');
      expect(surface).not.toContain(PROMPT_FRAGMENT);
    }
  });

  test('the log line carries only code, step, Pin index, field, model and role', () => {
    const line = strategySafeguardLogLine(leakyIssues(), { step: 'regenerate', model: 'google/gemini-2.5-flash', role: 'FAST' });
    const parsed = JSON.parse(line) as { issues: Array<Record<string, unknown>> } & Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['issueCount', 'issues', 'model', 'role', 'step']);
    expect(parsed).toMatchObject({ step: 'regenerate', model: 'google/gemini-2.5-flash', role: 'FAST', issueCount: 3 });
    for (const issue of parsed.issues) {
      for (const key of Object.keys(issue)) expect(['reason', 'code', 'pinIndex', 'field']).toContain(key);
    }
  });
});

test.describe('Every flow uses the structured error, safeguards untouched', () => {
  test('one code path for Keyword, OmniFlow article, existing WordPress post (and articles from Pins)', () => {
    const route = read('app/api/pinterest/generate/route.ts');
    // The three sources share this single validation block.
    expect(route).toContain('validatePinterestStrategyBatch(');
    expect(route).toContain('validateDistinctAngles(pinsToCheck, pinsRequested)');
    expect(route).toContain('validateArticleGroundedPins(pinsToCheck, articleGrounding)');
    expect(route).toContain('buildStrategySafeguardError(strategyIssues)');
    expect(route).toContain('{ status: 422 }');
    expect(route).not.toContain('failed strategy safeguards. Try again.');
    expect(route).not.toContain("'invalid_strategy_plan'");
  });

  test('single-Pin regeneration returns the structured error through the API', () => {
    const route = read('app/api/pinterest/pins/[id]/regenerate/route.ts');
    expect(route).toContain('err.toApiError()');
    expect(read('lib/social/pinterest-from-article.ts')).toContain("buildStrategySafeguardError(issues, 'pin')");
  });

  test('the UI renders it in the generator form and in the regeneration toasts', () => {
    expect(read('components/pinterest/pin-form.tsx')).toContain('<StrategySafeguardAlert');
    expect(read('components/social/article-pin-results.tsx')).toContain('toastApiError(');
    expect(read('components/pinterest/regenerate-generation-button.tsx')).toContain('toastApiError(');
  });

  test('the safeguard thresholds are unchanged', () => {
    const strategy = read('lib/pinterest/strategy.ts');
    expect(strategy).toContain('const TITLE_SIMILARITY_LIMIT = 0.8;');
    expect(strategy).toContain('const VARIANT_SIMILARITY_LIMIT = 0.95;');
  });
});
