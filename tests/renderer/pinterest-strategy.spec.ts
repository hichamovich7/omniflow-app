import { expect, test } from 'playwright/test';
import { buildPinterestPinsPrompt } from '@/lib/prompts/pinterest-pins';
import {
  ANGLE_TEMPLATE_MAP,
  selectHeadlineTemplateForAngle,
  validatePinterestStrategyBatch,
  type PinterestStrategyPin,
} from '@/lib/pinterest/strategy';
import { openRouterPinsResponseSchema } from '@/lib/validations/pinterest';
import { PINTEREST_ANGLES, type PinterestAngle } from '@/types/pinterest';

function strategyPin(
  angle: PinterestAngle,
  title: string,
  variant: string
): PinterestStrategyPin {
  return {
    angle,
    title,
    description: `A distinct promise about ${variant} with a specific reason to keep reading.`,
    image_prompt: `A unique ${variant} scene with different materials, framing, and composition.`,
  };
}

const fivePins: PinterestStrategyPin[] = [
  strategyPin('curiosity', 'The Bathroom Detail Designers Notice First', 'brass shelf'),
  strategyPin('problem-solution', 'Short on Storage? Start With the Empty Corners', 'oak cabinet'),
  strategyPin('listicle', 'Small Bathroom Storage Ideas Worth Saving', 'linen baskets'),
  strategyPin('discovery', 'Small Bathroom Storage Can Look This Calm', 'ceramic ledge'),
  strategyPin('article-promise', 'A Practical Guide to Better Bathroom Storage', 'walnut vanity'),
];

const tenPins: PinterestStrategyPin[] = [
  ...fivePins,
  strategyPin('curiosity', 'What Calm Bathrooms Hide in Plain Sight', 'recessed niche'),
  strategyPin('problem-solution', 'Cluttered Vanity? Give Daily Items a Clear Home', 'glass cabinet'),
  strategyPin('listicle', 'Storage Moves That Make Compact Bathrooms Work', 'wall hooks'),
  strategyPin('discovery', 'Unexpected Places to Add Useful Bathroom Storage', 'window shelf'),
  strategyPin('article-promise', 'Plan a More Functional Bathroom Without the Clutter', 'reeded drawers'),
];

test.describe('Pinterest Strategy Engine', () => {
  test('requires a structured angle in every generated pin', () => {
    const result = openRouterPinsResponseSchema.safeParse({
      pins: [{
        title: 'A title',
        description: 'A description',
        keywords: 'bathroom storage',
        board: 'Bathrooms',
        image_prompt: 'A bathroom scene.',
        visualFormat: 'photo',
        ctaBannerTemplate: 'minimal',
      }],
    });
    expect(result.success).toBe(false);
  });

  test('accepts exactly one of each angle for a five-pin batch', () => {
    expect(validatePinterestStrategyBatch(fivePins, 5)).toEqual([]);
    expect(new Set(fivePins.map((pin) => pin.angle))).toEqual(new Set(PINTEREST_ANGLES));
  });

  test('rejects incomplete angle coverage for a five-pin batch', () => {
    const invalid = fivePins.map((pin, index) =>
      index === 4 ? { ...pin, angle: 'curiosity' as const } : pin
    );
    expect(validatePinterestStrategyBatch(invalid, 5)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'angle-coverage' })])
    );
  });

  test('accepts two genuinely different variants per angle for ten pins', () => {
    expect(validatePinterestStrategyBatch(tenPins, 10)).toEqual([]);
    for (const angle of PINTEREST_ANGLES) {
      expect(tenPins.filter((pin) => pin.angle === angle)).toHaveLength(2);
    }
  });

  test('rejects titles that only swap a minor modifier', () => {
    const invalid = [...fivePins];
    invalid[0] = strategyPin(
      'curiosity',
      'Small Bathroom Storage Ideas for a Calm Stylish Home',
      'brass shelf'
    );
    invalid[1] = strategyPin(
      'problem-solution',
      'Small Bathroom Storage Ideas for a Warm Stylish Home',
      'oak cabinet'
    );
    expect(validatePinterestStrategyBatch(invalid, 5)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'near-duplicate-title' })])
    );
  });

  test('rejects repeated promise and scene for two variants of one angle', () => {
    const invalid = tenPins.map((pin) => ({ ...pin }));
    invalid[5].description = invalid[0].description;
    invalid[5].image_prompt = invalid[0].image_prompt;
    expect(validatePinterestStrategyBatch(invalid, 10)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'near-duplicate-variant' })])
    );
  });

  test('rejects ungrounded numbers, free, and beginner/easy claims', () => {
    const unsupported = strategyPin(
      'listicle',
      '7 Free and Easy Bathroom Storage Ideas for Beginners',
      'painted shelf'
    );
    const issues = validatePinterestStrategyBatch(
      [unsupported],
      1,
      'small bathroom storage ideas'
    );
    expect(issues.filter((issue) => issue.code === 'unsupported-claim')).toHaveLength(3);
  });

  test('allows sensitive claims only when the source evidence confirms them', () => {
    const grounded = strategyPin(
      'listicle',
      '7 Free and Easy Bathroom Storage Ideas for Beginners',
      'painted shelf'
    );
    expect(
      validatePinterestStrategyBatch(
        [grounded],
        1,
        '7 free and easy bathroom storage ideas for beginners'
      )
    ).toEqual([]);
  });

  test('maps every angle to its approved headline template family', () => {
    expect(ANGLE_TEMPLATE_MAP).toEqual({
      curiosity: ['minimal', 'editorial'],
      'problem-solution': ['editorial', 'split'],
      listicle: ['magazine'],
      discovery: ['minimal', 'editorial'],
      'article-promise': ['editorial', 'split'],
    });
    expect(selectHeadlineTemplateForAngle('curiosity', 0, ['minimal', 'editorial'])).toBe('minimal');
    expect(selectHeadlineTemplateForAngle('curiosity', 1, ['minimal', 'editorial'])).toBe('editorial');
    expect(selectHeadlineTemplateForAngle('listicle', 1, ['magazine', 'minimal'])).toBe('magazine');
    expect(selectHeadlineTemplateForAngle('article-promise', 0, ['clean-band'])).toBe('clean-band');
  });

  test('prompts exact 5/10 coverage and source-grounded claims', () => {
    const base = {
      keyword: 'small bathroom storage',
      language: 'en' as const,
      niche: 'Personal Finance / Budgeting',
      textOverlayMode: 'always' as const,
    };
    const fivePrompt = buildPinterestPinsPrompt({ ...base, pinsRequested: 5 }).user;
    const tenPrompt = buildPinterestPinsPrompt({ ...base, pinsRequested: 10 }).user;

    expect(fivePrompt).toContain('Use each of the five angles exactly once');
    expect(tenPrompt).toContain('Use each of the five angles exactly twice');
    expect(tenPrompt).toContain('not synonym swaps');
    expect(fivePrompt).toContain('Never invent a number');
    expect(fivePrompt).toContain('do not use "free"');
    expect(fivePrompt).toContain('An angle is not evidence');
    expect(fivePrompt).toContain('Distribute the main keyword naturally');
    expect(fivePrompt).toContain('"angle": "curiosity"');
    expect(fivePrompt).not.toContain('"titleBannerTemplate":');
  });
});
