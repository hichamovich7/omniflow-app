import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const generationUrl = process.env.PLAYWRIGHT_PIN_GENERATION_URL;

test.describe('Pinterest preview fidelity', () => {
  test.skip(
    !storageState || !generationUrl,
    'Set PLAYWRIGHT_STORAGE_STATE and PLAYWRIGHT_PIN_GENERATION_URL to an authenticated generation.'
  );
  test.use({ storageState });

  test('grid and detail show the complete 2:3 Pin', async ({ page }) => {
    await page.goto(generationUrl!);

    const gridPreview = page.getByTestId('pin-grid-preview').first();
    const gridImage = page.getByTestId('pin-grid-preview-image').first();
    await expect(gridPreview).toBeVisible();
    await expect(gridImage).toHaveCSS('object-fit', 'contain');

    const gridBox = await gridPreview.boundingBox();
    expect(gridBox).not.toBeNull();
    expect(gridBox!.width / gridBox!.height).toBeCloseTo(2 / 3, 1);

    await page.getByTestId('pin-card').first().locator('h3').click();
    const detailPreview = page.getByTestId('pin-detail-preview');
    await expect(detailPreview).toBeVisible();
    await expect(page.getByTestId('pin-detail-preview-image')).toHaveCSS('object-fit', 'contain');

    const detailBox = await detailPreview.boundingBox();
    expect(detailBox).not.toBeNull();
    expect(detailBox!.width / detailBox!.height).toBeCloseTo(2 / 3, 1);
  });

  test('versions dialog thumbnails preserve the complete Pin', async ({ page }) => {
    await page.goto(generationUrl!);
    const versionsButton = page.getByRole('button', { name: /View \d+ image versions/ }).first();
    test.skip((await versionsButton.count()) === 0, 'No Pin in this generation has multiple versions.');

    await versionsButton.click();
    const previews = page.getByTestId('pin-version-preview');
    await expect(previews.first()).toBeVisible();
    for (const image of await page.getByTestId('pin-version-preview-image').all()) {
      await expect(image).toHaveCSS('object-fit', 'contain');
    }
  });
});
