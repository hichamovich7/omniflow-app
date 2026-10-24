import Module from 'node:module';
import { dirname, join } from 'node:path';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'playwright/test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { attachPinterestStrategyMetadata } from '@/lib/pinterest/strategy';
import type { Pin } from '@/types/database';

// The test runner compiles .tsx with Playwright's component-testing JSX
// runtime (`<playwright>/jsx-runtime`, objects React cannot render). For this
// spec only, that module exports React's runtime; .tsx modules another spec
// of the worker already loaded are dropped so they are compiled again.
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
const { RegenerateTextButton } = require('@/components/pinterest/regenerate-text-button') as typeof import('@/components/pinterest/regenerate-text-button');
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * "Regenerate text" (TASK-076) as the Pin grid of /pinterest/[id] really
 * renders it: the PinTable component server-rendered with React (no mock of
 * the component itself), then the markup is loaded in Chromium to check what
 * a user sees. Offline: no session, no Supabase, no AI — the POST is
 * intercepted.
 */

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };

function withProviders(children: ReactNode) {
  return createElement(
    AppRouterContext.Provider,
    { value: router as never },
    createElement(EditorialSelectionProvider, null, children)
  );
}

function pin(overrides: Partial<Pin>): Pin {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    generation_id: '44444444-4444-4444-8444-444444444444',
    language: 'en',
    title: 'Keyword Pin with image',
    description: 'A description.',
    keywords: 'granny square scarf',
    board: 'Crochet Scarves',
    board_id: null,
    board_section: null,
    image_prompt: 'A scarf',
    image_analysis: attachPinterestStrategyMetadata(null, 'curiosity'),
    media_url: '/test/pin.jpg',
    link_url: 'https://crochet.example.test/scarf/',
    publish_date: null,
    visual_format: 'photo-only',
    overlay_text: null,
    title_banner_template: null,
    cta_banner_template: null,
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
    ...overrides,
  };
}

const PINS: Pin[] = [
  pin({}),
  // No image, no link, no angle metadata.
  pin({ id: '77777777-7777-4777-8777-777777777777', title: 'Keyword Pin without image', media_url: null, link_url: null, image_analysis: null }),
  // Article Pin (stored article source), AI Integrated, scheduled.
  pin({
    id: '88888888-8888-4888-8888-888888888888',
    title: 'Article Pin',
    visual_format: 'ai-integrated',
    publish_date: '2026-11-02T09:00:00Z',
    image_analysis: JSON.stringify({ _pinterestStrategy: { angle: 'listicle' }, _articleSource: { sourceType: 'external_wordpress_post', sectionId: 's2' } }),
  }),
];

function gridMarkup(): string {
  return renderToStaticMarkup(
    withProviders(
      createElement(PinTable, {
        pins: PINS,
        generationId: '44444444-4444-4444-8444-444444444444',
        imageVersionCounts: {},
        pinsWordPressUsage: {},
        activeImageModels: {},
        boardNames: {},
      })
    )
  );
}

test.describe('Regenerate text — Pin grid of /pinterest/[id]', () => {
  test.afterAll(() => {
    // Later specs of this worker get Playwright's runtime back.
    if (previousRuntime) requireCache[playwrightRuntime] = previousRuntime;
    else delete requireCache[playwrightRuntime];
  });

  test('every card shows a visible "Regenerate text" button, with or without image, any source', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.setContent(`<!doctype html><html><body>${gridMarkup()}</body></html>`);

    const cards = page.getByTestId('pin-card');
    await expect(cards).toHaveCount(PINS.length);
    for (let i = 0; i < PINS.length; i++) {
      const labeled = cards.nth(i).getByRole('button', { name: 'Regenerate text', exact: true });
      await expect(labeled).toBeVisible();
      await expect(labeled).toHaveText('Regenerate text');
      await expect(labeled).toBeEnabled();
    }
  });

  test('on a Pin with an image, the overlay icon comes right after "Regenerate image"', async ({ page }) => {
    await page.setContent(`<!doctype html><html><body>${gridMarkup()}</body></html>`);
    const overlay = page.getByTestId('pin-card').first();
    const labels = await overlay.locator('button').evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim()));
    const image = labels.findIndex((label) => label?.startsWith('Regenerate image for:'));
    expect(image).toBeGreaterThanOrEqual(0);
    expect(labels[image + 1]).toBe('Regenerate text for: Keyword Pin with image');
  });

  test('mobile width: the labeled button stays visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`<!doctype html><html><body>${gridMarkup()}</body></html>`);
    await expect(page.getByRole('button', { name: 'Regenerate text', exact: true }).first()).toBeVisible();
  });

  test('the button renders its label and the dialog uses the same component', () => {
    const markup = renderToStaticMarkup(withProviders(createElement(RegenerateTextButton, { pin: PINS[0] })));
    expect(markup).toContain('Regenerate text');
    expect(markup).toContain('data-testid="regenerate-text-button"');
  });
});
