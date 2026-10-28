import Module from 'node:module';
import { dirname, join } from 'node:path';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'playwright/test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Pin } from '@/types/database';

// Same runtime redirect as pinterest-regenerate-text-ui.spec.ts: .tsx is
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
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * TASK-078: the Pin grid of /pinterest/[id] shows the visual archetype of an
 * Auto variety Pin, and nothing for a classic Pin. Offline render in Chromium.
 */

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };

function pin(id: string, title: string, archetype?: { id: string; label: string }): Pin {
  const brief = {
    sectionId: 's2',
    articleSubject: 'Autumn Crochet Cardigan',
    sourceSection: '2. Make a gauge swatch',
    represented: 'cardigan',
    materials: [],
    colors: [],
    techniques: [],
    patterns: [],
    shape: [],
    texture: [],
    visualDetails: [],
    allowedElements: [],
    forbiddenElements: [],
    ...(archetype ? { archetype: { ...archetype, composition: 'panels', elements: [] } } : {}),
  };
  return {
    id,
    generation_id: '44444444-4444-4444-8444-444444444444',
    language: 'en',
    title,
    description: 'A description.',
    keywords: 'crochet cardigan',
    board: 'Crochet',
    board_id: null,
    board_section: null,
    image_prompt: 'A cardigan',
    image_analysis: JSON.stringify({
      _pinterestStrategy: { angle: 'curiosity' },
      _articleSource: { sourceType: 'external_wordpress_post', sectionId: 's2', brief },
    }),
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

const PINS: Pin[] = [
  pin('66666666-6666-4666-8666-666666666666', 'Auto variety Pin', { id: 'tutorial_steps', label: 'Step-by-step tutorial' }),
  pin('77777777-7777-4777-8777-777777777777', 'Classic Pin'),
];

function gridMarkup(): string {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router as never },
      createElement(
        EditorialSelectionProvider,
        null,
        createElement(PinTable, {
          pins: PINS,
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

test.describe('Visual archetype badge — Pin grid', () => {
  test.afterAll(() => {
    if (previousRuntime) requireCache[playwrightRuntime] = previousRuntime;
    else delete requireCache[playwrightRuntime];
  });

  test('an Auto variety Pin shows its archetype; a classic Pin shows none', async ({ page }) => {
    await page.setContent(`<!doctype html><html><body>${gridMarkup()}</body></html>`);
    const cards = page.getByTestId('pin-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).getByTestId('pin-visual-archetype')).toHaveText('Step-by-step tutorial');
    await expect(cards.nth(1).getByTestId('pin-visual-archetype')).toHaveCount(0);
  });
});
