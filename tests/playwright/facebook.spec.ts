import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
// A completed WordPress article (generation id) owned by the test account.
const articleId = process.env.PLAYWRIGHT_WP_ARTICLE_ID;
// A project of the test account (Page picker).
const projectId = process.env.PLAYWRIGHT_PROJECT_ID;
// A saved, unpublished Facebook post whose project has a connected Facebook Page.
const facebookContentId = process.env.PLAYWRIGHT_FACEBOOK_CONTENT_ID;

/**
 * Facebook Content Studio + publication (TASK-068). Needs a real session; every
 * Facebook / generation API call is mocked with page.route — no AI call, no
 * Meta call, nothing published, no row written by the mocked actions.
 */
test.describe('Facebook (TASK-068)', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE.');
  test.use({ storageState });

  test('Facebook is enabled in the sidebar and its page shows Pages, new post and history', async ({ page }) => {
    await page.goto('/facebook');
    await expect(page.getByRole('link', { name: 'Facebook' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Facebook', exact: true })).toBeVisible();
    await expect(page.getByTestId('facebook-connections')).toBeVisible();
    await expect(page.getByTestId('new-facebook-post')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  });

  test('Page picker: lists the Pages from the API and saves the chosen one', async ({ page }) => {
    test.skip(!projectId, 'Set PLAYWRIGHT_PROJECT_ID.');
    const selected: unknown[] = [];
    await page.route('**/api/social/connections/facebook/pages**', (route) =>
      route.fulfill({
        json: {
          data: {
            pages: [
              { id: '1122334455', name: 'Crochet Corner', canPublish: true },
              { id: '5566778899', name: 'Read-only Page', canPublish: false },
            ],
            canComment: true,
          },
          error: null,
        },
      })
    );
    await page.route('**/api/social/connections/facebook/select', async (route) => {
      selected.push(route.request().postDataJSON());
      await route.fulfill({ json: { data: { id: 'c1', external_account_id: '1122334455', external_account_name: 'Crochet Corner' }, error: null } });
    });
    await page.goto(`/facebook?connect=select&projectId=${projectId}`);
    const picker = page.getByTestId('facebook-page-picker');
    await expect(picker.getByText('Crochet Corner')).toBeVisible();
    await expect(picker.getByText('You cannot create content on this Page')).toBeVisible();
    const buttons = picker.getByRole('button', { name: 'Select' });
    await expect(buttons.nth(1)).toBeDisabled();
    await buttons.first().click();
    await expect.poll(() => selected).toEqual([{ projectId, pageId: '1122334455' }]);
  });

  test('Studio: Facebook generates one post (API mocked) and links to its review page', async ({ page }) => {
    test.skip(!articleId, 'Set PLAYWRIGHT_WP_ARTICLE_ID.');
    const bodies: unknown[] = [];
    await page.route('**/api/social/facebook-post', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          data: {
            id: '00000000-0000-4000-8000-0000000000fb',
            post: 'Mocked Facebook post about three scarves.',
            callToAction: 'Discover the full article.',
            firstCommentText: 'Here is the article:',
            linkPlacement: 'first_comment',
            wordCount: 7,
            warnings: [],
          },
          error: null,
        },
      });
    });
    await page.goto(`/wordpress/${articleId}`);
    const card = page.locator('[data-platform="facebook"]');
    await card.getByRole('button', { name: 'Generate Facebook post' }).click();
    await expect(card.getByText('Mocked Facebook post about three scarves.')).toBeVisible();
    await expect(card.getByText(/Link: First comment/)).toBeVisible();
    await expect(card.getByRole('link', { name: /Review, edit and publish/ })).toHaveAttribute('href', '/facebook/00000000-0000-4000-8000-0000000000fb');
    expect(bodies).toEqual([{ wordpressArticleId: articleId }]);
  });

  test.describe('Saved post', () => {
    test.skip(!facebookContentId, 'Set PLAYWRIGHT_FACEBOOK_CONTENT_ID (unpublished post, project with a connected Page).');

    test('first comment on / off changes the preview: the link is never in the post with "First comment"', async ({ page }) => {
      await page.goto(`/facebook/${facebookContentId}`);
      const preview = page.getByTestId('facebook-post-preview');
      await page.getByRole('radio', { name: /First comment/ }).check();
      await expect(page.getByTestId('facebook-comment-preview')).toBeVisible();
      await expect(preview).not.toContainText('https://');
      await page.getByRole('radio', { name: /No link/ }).check();
      await expect(page.getByTestId('facebook-comment-preview')).toHaveCount(0);
      await expect(preview).not.toContainText('https://');
    });

    test('publish success (mocked): confirmation dialog, then "Published + comment"', async ({ page }) => {
      const bodies: unknown[] = [];
      await page.route(`**/api/social/generations/${facebookContentId}/publish`, async (route) => {
        bodies.push(route.request().postDataJSON());
        await route.fulfill({
          json: {
            data: {
              publication: {
                id: 'pub-1',
                status: 'published',
                comment_requested: true,
                comment_status: 'published',
                external_post_id: '1_2',
                external_post_url: 'https://www.facebook.com/1_2',
              },
              warning: null,
            },
            error: null,
          },
        });
      });
      await page.goto(`/facebook/${facebookContentId}`);
      await page.getByRole('button', { name: 'Publish to Facebook' }).click();
      await expect(page.getByRole('dialog')).toContainText('Publish to Facebook?');
      await page.getByRole('button', { name: 'Publish now' }).click();
      await expect(page.getByTestId('facebook-publication-status')).toContainText('Published + comment');
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({ confirm: true });
    });

    test('partial publication (mocked) offers only "Retry comment", which never republishes the post', async ({ page }) => {
      const partial = {
        id: 'pub-2',
        status: 'partial',
        comment_requested: true,
        comment_status: 'failed',
        external_post_id: '1_2',
        external_post_url: 'https://www.facebook.com/1_2',
        locked_at: null,
      };
      await page.route(`**/api/social/generations/${facebookContentId}/publish`, (route) =>
        route.fulfill({ json: { data: { publication: partial, warning: 'Facebook refused the request.' }, error: null } })
      );
      const retried: string[] = [];
      await page.route('**/api/social/publications/pub-2/**', async (route) => {
        retried.push(new URL(route.request().url()).pathname);
        await route.fulfill({ json: { data: { publication: { ...partial, status: 'published', comment_status: 'published' }, warning: null }, error: null } });
      });
      await page.goto(`/facebook/${facebookContentId}`);
      await page.getByRole('button', { name: 'Publish to Facebook' }).click();
      await page.getByRole('button', { name: 'Publish now' }).click();
      await expect(page.getByTestId('facebook-publication-status')).toContainText('Partially published');
      await expect(page.getByRole('button', { name: 'Publish to Facebook' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Retry comment' }).click();
      await expect(page.getByTestId('facebook-publication-status')).toContainText('Published + comment');
      expect(retried).toEqual(['/api/social/publications/pub-2/retry-comment']);
    });
  });
});
