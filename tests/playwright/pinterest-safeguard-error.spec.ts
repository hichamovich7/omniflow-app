import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
// A completed WordPress article (generation id) owned by the test account.
const articleId = process.env.PLAYWRIGHT_WP_ARTICLE_ID;

/**
 * Strategy-safeguard errors in the generator form: the structured 422 is
 * explained inline (count, Pin, field, explanation, action) and "Try again"
 * appears only when the error is retryable. The article flow is used because
 * its form is pre-filled; the generation route is always mocked — no AI
 * call, no Pin written. Skips without an authenticated session.
 */
test.describe('Pinterest strategy-safeguard error display', () => {
  test.skip(!storageState || !articleId, 'Set PLAYWRIGHT_STORAGE_STATE and PLAYWRIGHT_WP_ARTICLE_ID.');
  test.use({ storageState });

  const safeguardError = (retryable: boolean) => ({
    data: null,
    error: {
      code: 'strategy_safeguard_failed',
      message: "The AI's Pins were rejected by 2 quality checks. Nothing was saved.",
      retryable,
      issueCount: 2,
      issues: [
        {
          code: 'DUPLICATE_TITLE',
          pinIndex: 2,
          relatedPinIndex: 1,
          field: 'title',
          message: "Pin 2's title is too close to Pin 1's title.",
          action: 'Try again so each Pin gets a distinct title.',
        },
        {
          code: 'UNBALANCED_ANGLES',
          field: 'angle',
          message: 'The Pins do not cover the five Pinterest angles evenly (expected 1 per angle; got curiosity=2, listicle=0).',
          action: 'Try again — a new attempt usually balances the angles.',
        },
      ],
    },
  });

  test('explains each problem and retries only on request, only when retryable', async ({ page }) => {
    const responses = [safeguardError(true), safeguardError(false)];
    let calls = 0;
    await page.route('**/api/pinterest/generate', async (route) => {
      const body = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      await route.fulfill({ status: 422, json: body });
    });

    await page.goto(`/pinterest/create?source=wordpress&articleId=${articleId}`);
    await page.getByRole('button', { name: 'Photo Only' }).click();
    await page.getByRole('button', { name: 'Generate Pins' }).click();

    const alert = page.getByTestId('strategy-safeguard-error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('rejected by 2 quality checks');
    await expect(alert.getByTestId('strategy-safeguard-count')).toHaveText('2 problems found');
    const issues = alert.getByTestId('strategy-safeguard-issue');
    await expect(issues).toHaveCount(2);
    await expect(issues.nth(0)).toContainText('Pin 2 · Title:');
    await expect(issues.nth(0)).toContainText('Try again so each Pin gets a distinct title.');
    // Batch-wide problem: no Pin number.
    await expect(issues.nth(1)).toContainText('Angle:');
    await expect(issues.nth(1)).not.toContainText('Pin ');
    expect(calls).toBe(1);

    // Retryable → the button sends the same form again (one user click = one request).
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => calls).toBe(2);
    // The second answer is not retryable: the problems stay, the button goes.
    await expect(alert.getByTestId('strategy-safeguard-count')).toHaveText('2 problems found');
    await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    expect(calls).toBe(2);
  });

  test('any other error keeps the plain message, without the safeguard panel', async ({ page }) => {
    await page.route('**/api/pinterest/generate', async (route) => {
      await route.fulfill({ status: 422, json: { data: null, error: { message: 'Mock plan failure', code: 'invalid_pin_plan' } } });
    });
    await page.goto(`/pinterest/create?source=wordpress&articleId=${articleId}`);
    await page.getByRole('button', { name: 'Photo Only' }).click();
    await page.getByRole('button', { name: 'Generate Pins' }).click();
    await expect(page.getByText('Mock plan failure').first()).toBeVisible();
    await expect(page.getByTestId('strategy-safeguard-error')).toHaveCount(0);
  });
});
