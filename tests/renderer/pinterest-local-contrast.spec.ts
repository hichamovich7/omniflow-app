import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import {
  compositeBannerWithDiagnostics,
  type CompositedBanner,
} from '@/lib/pinterest/compositing';
import { getTemplateSource } from '@/lib/pinterest/banner-templates';
import { LOCAL_CONTRAST_TARGET } from '@/lib/pinterest/local-contrast';
import { prepareBannerText } from '@/lib/pinterest/text-layout';

const FIXTURE_DIR = path.resolve('tests/fixtures/pinterest');
const ARTIFACT_DIR = path.resolve('test-results/pinterest-phase2');
const TEST_ACCENT = { r: 128, g: 128, b: 128 };
const HEADLINE = 'A Calm and Beautiful Home';

async function fixtureBuffer(name: string, width = 1000, height = 1500): Promise<Buffer> {
  return sharp(path.join(FIXTURE_DIR, `${name}.svg`))
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();
}

async function renderHeadline(
  fixture: string,
  width = 1000,
  height = 1500
): Promise<CompositedBanner> {
  return compositeBannerWithDiagnostics(
    await fixtureBuffer(fixture, width, height),
    HEADLINE,
    'top',
    TEST_ACCENT,
    '#ffffff',
    'clean-band'
  );
}

function candidate(result: CompositedBanner, position: 'top' | 'bottom') {
  const match = result.diagnostics.candidates.find((item) => item.position === position);
  expect(match).toBeDefined();
  return match!;
}

function expectTextInsideSafeArea(result: CompositedBanner, width: number, height: number) {
  const { safeArea, textBounds, bannerBounds } = result.diagnostics;
  expect(textBounds.x).toBeGreaterThanOrEqual(safeArea.left);
  expect(textBounds.y).toBeGreaterThanOrEqual(safeArea.top);
  expect(textBounds.x + textBounds.width).toBeLessThanOrEqual(width - safeArea.right);
  expect(textBounds.y + textBounds.height).toBeLessThanOrEqual(height - safeArea.bottom);
  expect(bannerBounds.y).toBeGreaterThanOrEqual(0);
  expect(bannerBounds.y + bannerBounds.height).toBeLessThanOrEqual(height);
}

async function renderPhase1FixedTop(imageBuffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 1000;
  const height = metadata.height ?? 1500;
  const { layout, renderedLines } = await prepareBannerText(
    HEADLINE,
    'clean-band',
    'headline',
    width,
    '#ffffff'
  );
  const filledSvg = getTemplateSource(layout.template)
    .replace(/\{\{ACCENT_COLOR\}\}/g, 'rgba(128,128,128,0.62)')
    .replace('<svg ', `<svg width="${layout.bannerWidth}" height="${layout.bannerHeight}" `);
  const bannerY = Math.round(height * 0.008);

  return sharp(imageBuffer)
    .composite([
      { input: Buffer.from(filledSvg), top: bannerY, left: 0 },
      ...renderedLines.map((line) => ({
        input: line.input,
        top: bannerY + line.top,
        left: line.left,
      })),
    ])
    .png()
    .toBuffer();
}

test.describe('Pinterest local contrast and safe areas', () => {
  test('selects dark text on a very light image and light text on a very dark image', async () => {
    const light = await renderHeadline('light');
    const dark = await renderHeadline('dark');

    expect(light.diagnostics.textColor).toBe('#141414');
    expect(dark.diagnostics.textColor).toBe('#FFFFFF');
    expect(light.diagnostics.brightness).toBeGreaterThan(dark.diagnostics.brightness);
    expect(light.diagnostics.contrastRatio).toBeGreaterThanOrEqual(LOCAL_CONTRAST_TARGET);
    expect(dark.diagnostics.contrastRatio).toBeGreaterThanOrEqual(LOCAL_CONTRAST_TARGET);
  });

  test('measures top and bottom brightness independently', async () => {
    const cases = [
      ['light-top', true],
      ['dark-top', false],
      ['light-bottom', false],
      ['dark-bottom', true],
      ['split-light-dark', true],
    ] as const;

    for (const [fixture, topIsLighter] of cases) {
      const result = await renderHeadline(fixture);
      const top = candidate(result, 'top');
      const bottom = candidate(result, 'bottom');
      expect(top.brightness > bottom.brightness).toBe(topIsLighter);
      expect(top.textColor).not.toBe(bottom.textColor);
    }
  });

  test('chooses the calm bottom when the top is busy', async () => {
    for (const fixture of ['busy-top', 'split-busy-calm']) {
      const result = await renderHeadline(fixture);
      const top = candidate(result, 'top');
      const bottom = candidate(result, 'bottom');
      expect(top.visualComplexity).toBeGreaterThan(bottom.visualComplexity);
      expect(result.diagnostics.chosenZone).toBe('bottom');
    }
  });

  test('chooses the calm top when the bottom is busy', async () => {
    const result = await renderHeadline('busy-bottom');
    const top = candidate(result, 'top');
    const bottom = candidate(result, 'bottom');
    expect(bottom.visualComplexity).toBeGreaterThan(top.visualComplexity);
    expect(result.diagnostics.chosenZone).toBe('top');
  });

  test('adds a limited local overlay only when both zones need reinforcement', async () => {
    const source = await fixtureBuffer('busy-top');
    const busyEverywhere = await sharp(source)
      .extract({ left: 0, top: 0, width: 1000, height: 480 })
      .resize(1000, 1500, { fit: 'fill' })
      .png()
      .toBuffer();
    const result = await compositeBannerWithDiagnostics(
      busyEverywhere,
      HEADLINE,
      'top',
      TEST_ACCENT,
      '#ffffff',
      'clean-band'
    );

    expect(result.diagnostics.overlayApplied).toBe(true);
    expect(
      result.diagnostics.candidates.find(
        (item) => item.position === result.diagnostics.chosenZone
      )!.contrastRatio
    ).toBeLessThan(LOCAL_CONTRAST_TARGET);
    expect(result.diagnostics.overlay?.opacity).toBeLessThanOrEqual(0.36);
    expect(result.diagnostics.contrastRatio).toBeGreaterThanOrEqual(LOCAL_CONTRAST_TARGET);
  });

  test('does not add a reinforcement overlay when local contrast is already sufficient', async () => {
    for (const fixture of ['light', 'dark']) {
      const result = await renderHeadline(fixture);
      expect(result.diagnostics.overlayApplied).toBe(false);
      expect(result.diagnostics.overlay).toBeNull();
    }
  });

  for (const [width, height] of [[1024, 1536], [1000, 1500]] as const) {
    test(`respects safe margins and preserves ${width}x${height}`, async () => {
      const result = await renderHeadline('busy-top', width, height);
      expectTextInsideSafeArea(result, width, height);
      await expect(sharp(result.buffer).metadata()).resolves.toMatchObject({
        width,
        height,
        format: 'png',
      });
    });
  }

  test('keeps the CTA fixed at the safe bottom position', async () => {
    const result = await compositeBannerWithDiagnostics(
      await fixtureBuffer('busy-bottom'),
      'Save this Pin',
      'bottom',
      TEST_ACCENT,
      '#ffffff',
      'pill'
    );
    expect(result.diagnostics.chosenZone).toBe('bottom');
    expect(result.diagnostics.requestedPosition).toBe('bottom');
    expectTextInsideSafeArea(result, 1000, 1500);
  });

  test('keeps an auto-positioned bottom headline above the fixed CTA', async () => {
    const source = await fixtureBuffer('busy-top');
    const cta = await compositeBannerWithDiagnostics(
      source,
      'Save this Pin',
      'bottom',
      TEST_ACCENT,
      '#ffffff',
      'clean-band'
    );
    const headline = await compositeBannerWithDiagnostics(
      cta.buffer,
      HEADLINE,
      'top',
      TEST_ACCENT,
      '#ffffff',
      'clean-band'
    );

    expect(headline.diagnostics.chosenZone).toBe('bottom');
    expect(
      headline.diagnostics.bannerBounds.y + headline.diagnostics.bannerBounds.height
    ).toBeLessThan(cta.diagnostics.bannerBounds.y);
  });

  test('writes Phase 1 versus Phase 2 visual comparisons on controlled backgrounds', async () => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    for (const fixture of ['busy-top', 'busy-bottom', 'split-light-dark', 'split-busy-calm']) {
      const source = await fixtureBuffer(fixture);
      const before = await renderPhase1FixedTop(source);
      const after = (await renderHeadline(fixture)).buffer;
      const comparison = await sharp({
        create: { width: 2000, height: 1500, channels: 4, background: '#ffffff' },
      })
        .composite([
          { input: before, left: 0, top: 0 },
          { input: after, left: 1000, top: 0 },
        ])
        .png()
        .toBuffer();
      await writeFile(path.join(ARTIFACT_DIR, `${fixture}-phase1-vs-phase2.png`), comparison);
      await expect(sharp(comparison).metadata()).resolves.toMatchObject({
        width: 2000,
        height: 1500,
      });
    }
  });

  test('records the local-analysis rendering overhead', async () => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const source = await fixtureBuffer('split-busy-calm');
    await renderPhase1FixedTop(source);
    await renderHeadline('split-busy-calm');

    const iterations = 3;
    const beforeStart = performance.now();
    for (let index = 0; index < iterations; index++) await renderPhase1FixedTop(source);
    const phase1AverageMs = (performance.now() - beforeStart) / iterations;
    const afterStart = performance.now();
    for (let index = 0; index < iterations; index++) await renderHeadline('split-busy-calm');
    const phase2AverageMs = (performance.now() - afterStart) / iterations;
    const overheadMs = phase2AverageMs - phase1AverageMs;
    const overheadRatio = phase2AverageMs / phase1AverageMs;

    await writeFile(
      path.join(ARTIFACT_DIR, 'performance.json'),
      JSON.stringify({ phase1AverageMs, phase2AverageMs, overheadMs, overheadRatio }, null, 2)
    );
    console.log(
      `Pinterest renderer performance: phase1=${phase1AverageMs.toFixed(1)}ms ` +
        `phase2=${phase2AverageMs.toFixed(1)}ms overhead=${overheadMs.toFixed(1)}ms ` +
        `ratio=${overheadRatio.toFixed(2)}x`
    );

    expect(phase2AverageMs).toBeLessThan(1500);
    expect(overheadMs).toBeLessThan(250);
    expect(overheadRatio).toBeLessThan(4);
  });
});
