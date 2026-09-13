import path from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import { compositeBannerWithDiagnostics } from '@/lib/pinterest/compositing';
import { LOCAL_CONTRAST_TARGET } from '@/lib/pinterest/local-contrast';
import {
  ANGLE_TEMPLATE_MAP,
  attachPinterestStrategyMetadata,
  readPinterestStrategyAngle,
} from '@/lib/pinterest/strategy';
import { layoutBannerText } from '@/lib/pinterest/text-layout';
import {
  selectHeadlineTemplate,
  selectHeadlineTemplateBatch,
  type AutoTemplateSelectionInput,
} from '@/lib/pinterest/template-selection';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import { PINTEREST_ANGLES, type PinterestAngle } from '@/types/pinterest';

const FIXTURE_DIR = path.resolve('tests/fixtures/pinterest');
const TEST_ACCENT = { r: 176, g: 122, b: 91 };
const ALLOWED: BannerTemplate[] = [
  'clean-band',
  'minimal',
  'editorial',
  'split',
  'magazine',
];

async function fixtureBuffer(name: string): Promise<Buffer> {
  return sharp(path.join(FIXTURE_DIR, `${name}.svg`))
    .resize(1000, 1500, { fit: 'fill' })
    .png()
    .toBuffer();
}

function input(
  imageBuffer: Buffer,
  angle: PinterestAngle,
  text: string,
  allowedTemplates: readonly BannerTemplate[] = ALLOWED
): AutoTemplateSelectionInput {
  return { imageBuffer, angle, text, accentColor: TEST_ACCENT, allowedTemplates };
}

function batchInputs(
  images: readonly Buffer[],
  angles: readonly PinterestAngle[]
): AutoTemplateSelectionInput[] {
  return angles.map((angle, index) =>
    input(
      images[index % images.length],
      angle,
      [
        'The Detail That Makes Small Rooms Feel Considered',
        'Short on Space? Give Everyday Objects a Clear Home',
        'Storage Ideas Worth Saving for Your Next Refresh',
        'Unexpected Places to Add Calm and Useful Storage',
        'A Practical Guide to a More Functional Small Room',
      ][index % 5]
    )
  );
}

test.describe('Pinterest Auto Template Selection', () => {
  test('stores the angle in existing JSON metadata without losing reference style', () => {
    const metadata = attachPinterestStrategyMetadata(
      JSON.stringify({ mood: 'calm', colorPalette: ['#ffffff', '#111111'] }),
      'discovery'
    );

    expect(readPinterestStrategyAngle(metadata)).toBe('discovery');
    expect(JSON.parse(metadata)).toMatchObject({
      mood: 'calm',
      colorPalette: ['#ffffff', '#111111'],
    });
  });

  test('ignores malformed or legacy metadata without a structured angle', () => {
    expect(readPinterestStrategyAngle('{broken')).toBeNull();
    expect(readPinterestStrategyAngle(JSON.stringify({ mood: 'calm' }))).toBeNull();
  });

  test('chooses only a compatible template for every structured angle', async () => {
    const image = await fixtureBuffer('split-busy-calm');

    for (const angle of PINTEREST_ANGLES) {
      const selection = await selectHeadlineTemplate(
        input(image, angle, 'A Concise Pinterest Headline')
      );
      expect(ANGLE_TEMPLATE_MAP[angle]).toContain(selection.template);
      expect(selection.fallbackReason).toBeNull();
    }
  });

  test('falls back safely when the mapped template cannot fit the text', async () => {
    const image = await fixtureBuffer('light');
    let longText: string | null = null;
    for (let wordCount = 10; wordCount <= 30; wordCount++) {
      const candidate = Array.from(
        { length: wordCount },
        (_, index) => `storage${index}`
      ).join(' ');
      try {
        const editorial = await layoutBannerText(
          candidate,
          'editorial',
          'headline',
          1000
        );
        const cleanBand = await layoutBannerText(
          candidate,
          'clean-band',
          'headline',
          1000
        );
        if (editorial.fallbackReason && !cleanBand.fallbackReason) {
          longText = candidate;
          break;
        }
      } catch {
        // Continue until the measured renderer finds the fallback boundary.
      }
    }
    expect(longText).not.toBeNull();
    const selection = await selectHeadlineTemplate(
      input(image, 'article-promise', longText!, ['editorial', 'clean-band'])
    );

    expect(selection.template).toBe('clean-band');
    expect(selection.fallbackReason).toBe('text-fit');
    expect(
      selection.candidates.some(
        (candidate) =>
          candidate.template === 'editorial' && candidate.invalidReason === 'text-fit'
      )
    ).toBe(true);
  });

  test('uses a neutral compatibility fallback when a niche excludes the mapped family', async () => {
    const image = await fixtureBuffer('dark');
    const selection = await selectHeadlineTemplate(
      input(image, 'listicle', 'Storage Ideas Worth Saving', ['clean-band'])
    );

    expect(selection.template).toBe('clean-band');
    expect(selection.fallbackReason).toBe('compatibility');
  });

  test('produces reasonable visual diversity for a five-pin batch', async () => {
    const images = await Promise.all([
      fixtureBuffer('busy-top'),
      fixtureBuffer('busy-bottom'),
    ]);
    const selections = await selectHeadlineTemplateBatch(
      batchInputs(images, PINTEREST_ANGLES)
    );

    expect(new Set(selections.map((selection) => selection.template)).size).toBeGreaterThanOrEqual(3);
    expect(
      new Set(selections.map((selection) => `${selection.template}:${selection.position}`)).size
    ).toBeGreaterThanOrEqual(4);
  });

  test('avoids angle/template/position quasi-clones in a ten-pin batch', async () => {
    const images = await Promise.all([
      fixtureBuffer('busy-top'),
      fixtureBuffer('busy-bottom'),
    ]);
    const angles = [...PINTEREST_ANGLES, ...PINTEREST_ANGLES];
    const selections = await selectHeadlineTemplateBatch(batchInputs(images, angles));

    for (const angle of PINTEREST_ANGLES) {
      const combinations = selections
        .filter((_, index) => angles[index] === angle)
        .map((selection) => `${selection.template}:${selection.position}`);
      expect(new Set(combinations).size).toBe(2);
    }
    expect(
      new Set(selections.map((selection) => `${selection.template}:${selection.position}`)).size
    ).toBeGreaterThanOrEqual(6);
  });

  test('is deterministic for identical ordered inputs', async () => {
    const images = await Promise.all([
      fixtureBuffer('busy-top'),
      fixtureBuffer('busy-bottom'),
    ]);
    const inputs = batchInputs(images, [...PINTEREST_ANGLES, ...PINTEREST_ANGLES]);
    const first = await selectHeadlineTemplateBatch(inputs);
    const second = await selectHeadlineTemplateBatch(inputs);

    expect(second.map(({ template, position }) => ({ template, position }))).toEqual(
      first.map(({ template, position }) => ({ template, position }))
    );
  });

  test('keeps the selected position readable when handed to the renderer', async () => {
    const image = await fixtureBuffer('busy-top');
    const text = 'The Storage Detail Most Small Rooms Miss';
    const selection = await selectHeadlineTemplate(
      input(image, 'curiosity', text)
    );
    const rendered = await compositeBannerWithDiagnostics(
      image,
      text,
      'top',
      TEST_ACCENT,
      '#ffffff',
      selection.template,
      selection.position
    );

    expect(rendered.diagnostics.chosenZone).toBe(selection.position);
    expect(rendered.diagnostics.contrastRatio).toBeGreaterThanOrEqual(
      LOCAL_CONTRAST_TARGET
    );
  });
});
