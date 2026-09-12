import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import { compositeBanner } from '@/lib/pinterest/compositing';
import {
  BannerCompositionError,
  layoutBannerText,
  type BannerTextLayout,
} from '@/lib/pinterest/text-layout';
import type { BannerTemplate } from '@/lib/validations/pinterest';

const TEMPLATES: BannerTemplate[] = [
  'clean-band',
  'ribbon',
  'pill',
  'torn-paper',
  'corner-tag',
];
const FIXTURE_DIR = path.resolve('tests/fixtures/pinterest');
const ARTIFACT_DIR = path.resolve('test-results/pinterest-renderer');

function expectLayoutInsideBounds(layout: BannerTextLayout) {
  expect(layout.lines.length).toBeLessThanOrEqual(layout.maxLines);
  expect(layout.fontSize).toBeGreaterThanOrEqual(layout.minFontSize);
  expect(layout.textBounds.x).toBeGreaterThanOrEqual(layout.innerTextArea.x);
  expect(layout.textBounds.y).toBeGreaterThanOrEqual(layout.innerTextArea.y);
  expect(layout.textBounds.x + layout.textBounds.width).toBeLessThanOrEqual(
    layout.innerTextArea.x + layout.innerTextArea.width
  );
  expect(layout.textBounds.y + layout.textBounds.height).toBeLessThanOrEqual(
    layout.innerTextArea.y + layout.innerTextArea.height
  );
  expect(layout.textBounds.x + layout.textBounds.width).toBeLessThanOrEqual(layout.bannerWidth);
  expect(layout.textBounds.y + layout.textBounds.height).toBeLessThanOrEqual(layout.bannerHeight);
}

async function fixtureBuffer(name: string, width: number, height: number): Promise<Buffer> {
  return sharp(path.join(FIXTURE_DIR, `${name}.svg`))
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();
}

async function renderLegacyComparison(image: Buffer, text: string): Promise<Buffer> {
  const metadata = await sharp(image).metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1536;
  const maxTextWidth = width * 0.88;
  let fontSize = Math.round(height * 0.038);
  const estimatedTextWidth = text.length * fontSize * 0.56;
  if (estimatedTextWidth > maxTextWidth) {
    fontSize = Math.max(18, Math.round(fontSize * (maxTextWidth / estimatedTextWidth)));
  }
  const bannerHeight = Math.round(width * (140 / 1024));
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${bannerHeight}">` +
      `<rect width="${width}" height="${bannerHeight}" fill="rgba(17,17,17,0.62)"/>` +
      `<text x="${width / 2}" y="${bannerHeight / 2}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${fontSize}" fill="#fff">${escaped}</text>` +
      `</svg>`
  );
  return sharp(image)
    .composite([{ input: svg, top: Math.round(height * 0.008), left: 0 }])
    .png()
    .toBuffer();
}

test.describe('Pinterest renderer reliability', () => {
  test('short, medium and long headlines use one to three measured lines', async () => {
    const short = await layoutBannerText('Small Bathroom Ideas', 'clean-band', 'headline', 1024);
    const medium = await layoutBannerText(
      'Beautiful Small Bathroom Storage Ideas',
      'clean-band',
      'headline',
      1024
    );
    const long = await layoutBannerText(
      'Seven Beautiful Small Bathroom Storage Ideas That Make Every Corner Work Harder',
      'clean-band',
      'headline',
      1024
    );

    expect(short.lines).toHaveLength(1);
    expect(medium.lines.length).toBeGreaterThanOrEqual(2);
    expect(long.lines.length).toBeGreaterThanOrEqual(2);
    for (const layout of [short, medium, long]) expectLayoutInsideBounds(layout);
  });

  test('two-line and three-line headlines remain inside the clean-band box', async () => {
    const twoLines = await layoutBannerText(
      'Modern Living Room Ideas for a Calm Home',
      'clean-band',
      'headline',
      1024
    );
    const threeLines = await layoutBannerText(
      'Clever and Beautiful Storage Ideas for Every Small Bathroom Corner Without Losing Style or Everyday Comfort',
      'clean-band',
      'headline',
      1024
    );

    expect(twoLines.lines.length).toBeGreaterThanOrEqual(2);
    expect(threeLines.lines).toHaveLength(3);
    expectLayoutInsideBounds(twoLines);
    expectLayoutInsideBounds(threeLines);
  });

  test('compact templates keep short text and explicitly fall back for long text', async () => {
    for (const template of ['pill', 'corner-tag'] as const) {
      const short = await layoutBannerText('Save this Pin', template, 'cta', 1024);
      expect(short.template).toBe(template);
      expect(short.fallbackReason).toBeNull();
      expectLayoutInsideBounds(short);

      const long = await layoutBannerText(
        'Enregistre cette inspiration très détaillée pour la retrouver plus tard',
        template,
        'cta',
        1024
      );
      expect(long.requestedTemplate).toBe(template);
      expect(long.template).toBe('clean-band');
      expect(long.fallbackReason).toBeTruthy();
      expectLayoutInsideBounds(long);
    }
  });

  test('all five templates fit supported roles without crossing their text boxes', async () => {
    for (const template of TEMPLATES) {
      const headline = await layoutBannerText('Warm Crochet Ideas', template, 'headline', 1024);
      const cta = await layoutBannerText('Save for later', template, 'cta', 1024);
      expectLayoutInsideBounds(headline);
      expectLayoutInsideBounds(cta);
    }
  });

  test('supported languages and special XML characters render safely', async () => {
    const samples = [
      'Easy home ideas & storage',
      'Schöne Lösungen für kleine Räume',
      'Ideas rápidas para baños pequeños',
      'Élégantes idées d’aménagement <faciles>',
    ];

    for (const sample of samples) {
      expectLayoutInsideBounds(await layoutBannerText(sample, 'clean-band', 'headline', 1000));
    }

    const image = await fixtureBuffer('light', 1000, 1500);
    const output = await compositeBanner(
      image,
      'Élégant & pratique <édition>',
      'top',
      null,
      '#ffffff',
      'clean-band'
    );
    await expect(sharp(output).metadata()).resolves.toMatchObject({
      width: 1000,
      height: 1500,
      format: 'png',
    });
  });

  test('an unbreakable overlong word fails explicitly instead of clipping', async () => {
    await expect(
      layoutBannerText('W'.repeat(300), 'clean-band', 'headline', 1024)
    ).rejects.toBeInstanceOf(BannerCompositionError);
  });

  for (const [width, height] of [[1024, 1536], [1000, 1500]] as const) {
    test(`preserves final PNG dimensions at ${width}x${height}`, async () => {
      const image = await fixtureBuffer('minimal', width, height);
      const withCta = await compositeBanner(
        image,
        'Save for later',
        'bottom',
        null,
        '#ffffff',
        'pill'
      );
      const output = await compositeBanner(
        withCta,
        'Modern Living Room Ideas for a Calm Home',
        'top',
        null,
        '#ffffff',
        'ribbon'
      );
      await expect(sharp(output).metadata()).resolves.toMatchObject({ width, height, format: 'png' });
    });
  }

  test('writes reproducible before/after artifacts for four static fixtures', async () => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const headline = 'Seven Small Bathroom Storage Ideas That Make Every Corner Work';

    for (const fixture of ['light', 'dark', 'busy', 'minimal']) {
      const image = await fixtureBuffer(fixture, 1000, 1500);
      const before = await renderLegacyComparison(image, headline);
      await writeFile(path.join(ARTIFACT_DIR, `${fixture}-before.png`), before);
      const after = await compositeBanner(
        image,
        headline,
        'top',
        null,
        '#ffffff',
        'clean-band'
      );
      await writeFile(path.join(ARTIFACT_DIR, `${fixture}-after.png`), after);
      const comparison = await sharp({
        create: { width: 2000, height: 1500, channels: 4, background: '#ffffff' },
      })
        .composite([
          { input: before, left: 0, top: 0 },
          { input: after, left: 1000, top: 0 },
        ])
        .png()
        .toBuffer();
      await writeFile(path.join(ARTIFACT_DIR, `${fixture}-comparison.png`), comparison);
      await expect(sharp(after).metadata()).resolves.toMatchObject({ width: 1000, height: 1500 });
    }
  });

  test('writes a visual matrix for all five existing templates', async () => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const image = await fixtureBuffer('minimal', 1000, 1500);
    const thumbnails: Buffer[] = [];

    for (const template of TEMPLATES) {
      const withCta = await compositeBanner(
        image,
        'Save this Pin',
        'bottom',
        null,
        '#ffffff',
        template
      );
      const output = await compositeBanner(
        withCta,
        'Warm Crochet Ideas',
        'top',
        null,
        '#ffffff',
        template
      );
      await writeFile(path.join(ARTIFACT_DIR, `template-${template}.png`), output);
      thumbnails.push(await sharp(output).resize(400, 600).png().toBuffer());
    }

    const matrix = await sharp({
      create: { width: 2000, height: 600, channels: 4, background: '#ffffff' },
    })
      .composite(thumbnails.map((input, index) => ({ input, left: index * 400, top: 0 })))
      .png()
      .toBuffer();
    await writeFile(path.join(ARTIFACT_DIR, 'templates-matrix.png'), matrix);
    await expect(sharp(matrix).metadata()).resolves.toMatchObject({ width: 2000, height: 600 });
  });
});
