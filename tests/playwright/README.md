# Playwright UI foundations

Run these browser checks against an authenticated local test user:

```bash
set PLAYWRIGHT_STORAGE_STATE=path\\to\\authenticated-state.json
set PLAYWRIGHT_PIN_GENERATION_URL=/pinterest/{generation-id}
npx playwright test
```

The shared-primitive cases remain intentionally skipped until a consuming page is refactored in a later UI task. This avoids adding a test-only route or changing product routes during UI-001.

No AI generation, publishing, scheduling, or Supabase mutation is covered by this suite.

Renderer tests do not require authentication, a running application, external calls, or Supabase:

```bash
npx playwright test --project=renderer
```

They use the static SVG fixtures in `tests/fixtures/pinterest/` and write visual comparison artifacts under the ignored `test-results/pinterest-renderer/` directory.
