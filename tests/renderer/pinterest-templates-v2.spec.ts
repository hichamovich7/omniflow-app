import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import {
  getTemplateAspectRatio,
  getTemplateSource,
  getTemplateSpec,
  type TypographyRole,
} from '@/lib/pinterest/banner-templates';
import { compositeBannerWithDiagnostics, type CompositedBanner } from '@/lib/pinterest/compositing';
import { layoutBannerText, type BannerTextLayout } from '@/lib/pinterest/text-layout';
import { V2_BANNER_TEMPLATES, type BannerTemplate } from '@/lib/validations/pinterest';

const V2_TEMPLATES = V2_BANNER_TEMPLATES satisfies readonly BannerTemplate[];
const FIXTURE_DIR = path.resolve('tests/fixtures/pinterest');
const ARTIFACT_DIR = path.resolve('test-results/pinterest-templates-v2');
const HEADLINE = 'Seven Beautiful Small Bathroom Storage Ideas That Make Every Corner Work Harder';
const CTA = 'Guarda este Pin para después';
const TEST_ACCENT = { r: 232, g: 214, b: 196 };

function expectLayoutInsideBounds(layout: BannerTextLayout) {
  expect(layout.fallbackReason).toBeNull();
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
}

function expectTextInsideSafeArea(result: CompositedBanner, width: number, height: number) {
  const { safeArea, textBounds } = result.diagnostics;
  expect(textBounds.x).toBeGreaterThanOrEqual(safeArea.left);
  expect(textBounds.y).toBeGreaterThanOrEqual(safeArea.top);
  expect(textBounds.x + textBounds.width).toBeLessThanOrEqual(width - safeArea.right);
  expect(textBounds.y + textBounds.height).toBeLessThanOrEqual(height - safeArea.bottom);
}

async function fixtureBuffer(width: number, height: number): Promise<Buffer> {
  return sharp(path.join(FIXTURE_DIR, 'split-busy-calm.svg'))
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();
}

async function renderTemplate(
  template: (typeof V2_TEMPLATES)[number],
  width = 1000,
  height = 1500
) {
  const source = await fixtureBuffer(width, height);
  const cta = await compositeBannerWithDiagnostics(
    source,
    CTA,
    'bottom',
    TEST_ACCENT,
    '#141414',
    template
  );
  const headline = await compositeBannerWithDiagnostics(
    cta.buffer,
    HEADLINE,
    'top',
    TEST_ACCENT,
    '#141414',
    template
  );
  return { cta, headline };
}

test.describe('Pinterest Templates v2', () => {
  test('registers distinct headline and CTA variants for every v2 family', () => {
    for (const template of V2_TEMPLATES) {
      const headlineSpec = getTemplateSpec(template, 'headline');
      const ctaSpec = getTemplateSpec(template, 'cta');
      expect(headlineSpec.height).toBeGreaterThan(ctaSpec.height);
      expect(getTemplateSource(template, 'headline')).not.toBe(getTemplateSource(template, 'cta'));
      expect(getTemplateAspectRatio(template, 'headline')).toBe(headlineSpec.height / 1024);
      expect(getTemplateAspectRatio(template, 'cta')).toBe(ctaSpec.height / 1024);
    }
  });

  for (const [width, height] of [[1024, 1536], [1000, 1500]] as const) {
    test(`fits measured multilingual text in every v2 role at ${width}x${height}`, async () => {
      for (const template of V2_TEMPLATES) {
        const layouts: Array<[TypographyRole, BannerTextLayout]> = [
          ['headline', await layoutBannerText(HEADLINE, template, 'headline', width)],
          ['cta', await layoutBannerText(CTA, template, 'cta', width)],
        ];
        for (const [role, layout] of layouts) {
          expect(layout.template).toBe(template);
          expect(layout.role).toBe(role);
          expectLayoutInsideBounds(layout);
        }
      }
    });
  }

  test('composes every v2 family without overlap or output-size changes', async () => {
    for (const template of V2_TEMPLATES) {
      const { cta, headline } = await renderTemplate(template);
      expectTextInsideSafeArea(cta, 1000, 1500);
      expectTextInsideSafeArea(headline, 1000, 1500);
      expect(headline.diagnostics.bannerBounds.y + headline.diagnostics.bannerBounds.height)
        .toBeLessThan(cta.diagnostics.bannerBounds.y);
      await expect(sharp(headline.buffer).metadata()).resolves.toMatchObject({
        width: 1000,
        height: 1500,
        format: 'png',
      });
    }
  });

  test('writes a deterministic visual contact sheet for manual review', async () => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const renders = await Promise.all(V2_TEMPLATES.map(async (template) => (await renderTemplate(template)).headline.buffer));
    const contactSheet = await sharp({
      create: { width: 2000, height: 3000, channels: 4, background: '#ffffff' },
    })
      .composite(
        renders.map((input, index) => ({
          input,
          left: (index % 2) * 1000,
          top: Math.floor(index / 2) * 1500,
        }))
      )
      .png()
      .toBuffer();
    const outputPath = path.join(ARTIFACT_DIR, 'templates-v2-contact-sheet.png');
    await writeFile(outputPath, contactSheet);
    await expect(sharp(contactSheet).metadata()).resolves.toMatchObject({
      width: 2000,
      height: 3000,
      format: 'png',
    });
  });
});
