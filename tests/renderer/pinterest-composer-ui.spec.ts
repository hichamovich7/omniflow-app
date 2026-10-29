import Module from 'node:module';
import { dirname, join } from 'node:path';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'playwright/test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Pin } from '@/types/database';

// Same runtime redirect as pinterest-visual-archetypes-ui.spec.ts: .tsx is
// rendered with React's JSX runtime for this spec only.
type CachedModule = { exports: unknown; loaded: boolean; id: string; filename: string };
const requireCache = (Module as unknown as { _cache: Record<string, CachedModule | undefined> })._cache;
const playwrightRuntime = join(dirname(require.resolve('playwright/package.json')), 'jsx-runtime.js');
const previousRuntime = requireCache[playwrightRuntime];
requireCache[playwrightRuntime] = {
  id: playwrightRuntime,
  filename: playwrightRuntime,
  loaded: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  exports: require('react/jsx-runtime'),
};
for (const file of Object.keys(requireCache)) {
  if (file.endsWith('.tsx') && !file.includes('node_modules')) delete requireCache[file];
}

/* eslint-disable @typescript-eslint/no-require-imports -- loaded after the runtime redirect above */
const { EditorialSelectionProvider } = require('@/components/editorial/selection-provider') as {
  EditorialSelectionProvider: ComponentType<{ children: ReactNode }>;
};
const { PinTable } = require('@/components/pinterest/pin-table') as typeof import('@/components/pinterest/pin-table');
const { PinVisualFormatDetails } = require('@/components/pinterest/pin-visual-format') as typeof import('@/components/pinterest/pin-visual-format');
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * TASK-079: composed Pins show their visual format (badge in the grid,
 * format, sources, status and warnings in the details); older and Classic
 * Pins show "Classic" in the details and no badge. Offline render in Chromium.
 */

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };

const STEPS_CONTRACT = {
  templateType: 'step_by_step',
  templateVersion: 'v1',
  sourceSections: ['s2', 's3', 's4'],
  sourceHeadings: ['Step 1: Make a magic ring', 'Step 2: Crochet the petals', 'Step 3: Sew the flower'],
  renderedBy: 'omniflow-composer',
  language: 'en',
  status: 'rendered',
  warnings: ['STEPS_TRUNCATED:3/6'],
  text: {
    title: 'Crochet Flower Hair Tie',
    steps: [
      { label: 'Step 1', title: 'Make a magic ring' },
      { label: 'Step 2', title: 'Crochet the petals' },
      { label: 'Step 3', title: 'Sew the flower' },
    ],
  },
};

const STEPS_V2_CONTRACT = {
  templateType: 'step_by_step',
  templateVersion: 'v2',
  sourceSections: ['s6', 's7', 's9'],
  sourceHeadings: ['Head', 'Body', 'Assembly'],
  renderedBy: 'omniflow-composer',
  language: 'en',
  status: 'rendered',
  warnings: ['STEPS_SELECTED:3/4'],
  layout: 'editorial-grid',
  panelCount: 3,
  niche: 'crochet',
  panels: ['s6', 's7', 's9'].map((sectionId, index) => ({
    sectionId,
    sectionTitle: ['Head', 'Body', 'Assembly'][index],
    sectionLanguage: 'en',
    sourceText: 'Rnd 1: 6 sc in a magic ring.',
    imagePrompt: `STEP PHOTO ${index + 1} of 3`,
  })),
  text: { title: 'Crochet Bunny Amigurumi Pattern', steps: [{ label: null, title: 'Head' }, { label: null, title: 'Body' }, { label: null, title: 'Assembly' }] },
};

function pin(id: string, title: string, composer?: unknown): Pin {
  return {
    id,
    generation_id: '44444444-4444-4444-8444-444444444444',
    language: 'en',
    title,
    description: 'A description.',
    keywords: 'crochet',
    board: 'Crochet',
    board_id: null,
    board_section: null,
    image_prompt: 'A crochet flower hair tie',
    image_analysis: JSON.stringify({ _pinterestStrategy: { angle: 'curiosity' }, ...(composer ? { _pinterestComposer: composer } : {}) }),
    media_url: '/test/pin.jpg',
    link_url: null,
    publish_date: null,
    visual_format: 'photo-only',
    overlay_text: null,
    title_banner_template: null,
    cta_banner_template: null,
    created_at: '2026-10-28T00:00:00Z',
    updated_at: '2026-10-28T00:00:00Z',
  };
}

const COMPOSED = pin('66666666-6666-4666-8666-666666666666', 'Composed Pin', STEPS_CONTRACT);
const STEPS_V2 = pin('88888888-8888-4888-8888-888888888888', 'Step-by-step v2 Pin', STEPS_V2_CONTRACT);
const CLASSIC = pin('77777777-7777-4777-8777-777777777777', 'Classic Pin');

function gridMarkup(): string {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router as never },
      createElement(
        EditorialSelectionProvider,
        null,
        createElement(PinTable, {
          pins: [COMPOSED, CLASSIC],
          generationId: '44444444-4444-4444-8444-444444444444',
          imageVersionCounts: {},
          pinsWordPressUsage: {},
          activeImageModels: {},
          boardNames: {},
        })
      )
    )
  );
}

test.describe('Visual format — Pin grid and details', () => {
  test.afterAll(() => {
    if (previousRuntime) requireCache[playwrightRuntime] = previousRuntime;
    else delete requireCache[playwrightRuntime];
  });

  test('a composed Pin shows its format badge in the grid; a Classic Pin shows none', async ({ page }) => {
    await page.setContent(`<!doctype html><html><body>${gridMarkup()}</body></html>`);
    const cards = page.getByTestId('pin-card');
    await expect(cards).toHaveCount(2);
    const badge = cards.nth(0).getByTestId('pin-visual-format');
    await expect(badge).toHaveText('Step-by-step');
    await expect(badge).toHaveAttribute('title', /Sources: Step 1: Make a magic ring, Step 2: Crochet the petals and Step 3: Sew the flower/);
    await expect(cards.nth(1).getByTestId('pin-visual-format')).toHaveCount(0);
  });

  test('details: format, sources, status and warnings; older Pins read "Classic" (desktop and mobile)', async ({ page }) => {
    const markup = renderToStaticMarkup(
      createElement(
        'div',
        null,
        createElement('section', { id: 'composed' }, createElement(PinVisualFormatDetails, { imageAnalysis: COMPOSED.image_analysis })),
        createElement('section', { id: 'classic' }, createElement(PinVisualFormatDetails, { imageAnalysis: CLASSIC.image_analysis })),
        createElement('section', { id: 'legacy' }, createElement(PinVisualFormatDetails, { imageAnalysis: null }))
      )
    );
    for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 740 }]) {
      await page.setViewportSize(viewport);
      await page.setContent(`<!doctype html><html><body>${markup}</body></html>`);
      const composed = page.locator('#composed').getByTestId('pin-visual-format-details');
      await expect(composed).toContainText('Visual format: Step-by-step');
      await expect(composed).toContainText('Composed by OmniFlow');
      await expect(composed).toContainText('Sources: Step 1: Make a magic ring, Step 2: Crochet the petals and Step 3: Sew the flower');
      await expect(composed).toContainText('Shows the first 3 of 6 steps');
      await expect(page.locator('#classic').getByTestId('pin-visual-format-details')).toHaveText('Visual format: Classic');
      await expect(page.locator('#legacy').getByTestId('pin-visual-format-details')).toHaveText('Visual format: Classic');
      // No horizontal overflow on a phone.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    }
  });

  test('an older Step-by-step v2 Pin still shows its layout, panel count, image generations, sources and warning (desktop and mobile)', async ({ page }) => {
    const markup = renderToStaticMarkup(createElement(PinVisualFormatDetails, { imageAnalysis: STEPS_V2.image_analysis }));
    for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 740 }]) {
      await page.setViewportSize(viewport);
      await page.setContent(`<!doctype html><html><body>${markup}</body></html>`);
      const details = page.getByTestId('pin-visual-format-details');
      await expect(details).toContainText('Visual format: Step-by-step');
      await expect(details.getByTestId('pin-visual-format-layout')).toHaveText('Layout: Editorial grid · 3 step panels · 4 image generations');
      await expect(details).toContainText('Sources: Head, Body and Assembly');
      await expect(details).toContainText("Shows 3 of the article's 4 steps (first, middle and last)");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    }
  });
});
