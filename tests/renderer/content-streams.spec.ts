import { expect, test } from 'playwright/test';
import { createContentStreamSchema, updateContentStreamSchema, contentStreamStatusSchema } from '@/lib/validations/content-streams';
import { isOwnedProject, isCategoryInProject, isBoardInProject } from '@/lib/queries/content-streams';

/**
 * Data-contract tests for Command Center Phase 2a (content_streams +
 * content_stream_boards). These run offline (no browser, no Supabase, no
 * auth) and cover exactly the two things that don't require a live Postgres
 * instance: the Zod validation layer, and the pure ownership-check
 * functions that gate every write in lib/queries/content-streams.ts. See
 * docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md for what remains untestable
 * here (RLS isolation, unique/CHECK constraint enforcement, cascade
 * deletes) and why.
 */
test.describe('content_streams validation (TASK-FIX-039 Phase 2a)', () => {
  const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
  const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';

  test('accepts a minimal valid input', () => {
    const parsed = createContentStreamSchema.safeParse({
      projectId: PROJECT_ID,
      name: 'Crochet Cats',
    });
    expect(parsed.success).toBe(true);
  });

  test('accepts a full valid input with all targets set', () => {
    const parsed = createContentStreamSchema.safeParse({
      projectId: PROJECT_ID,
      name: 'Crochet Sweaters',
      wordpressCategoryId: CATEGORY_ID,
      targetPinsPerDay: 3,
      targetArticlesPerWeek: 4,
      targetBufferDays: 7,
      status: 'warming',
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects a negative targetPinsPerDay', () => {
    const parsed = createContentStreamSchema.safeParse({
      projectId: PROJECT_ID,
      name: 'Bathroom',
      targetPinsPerDay: -1,
    });
    expect(parsed.success).toBe(false);
  });

  test('rejects a negative targetArticlesPerWeek and targetBufferDays', () => {
    expect(
      createContentStreamSchema.safeParse({
        projectId: PROJECT_ID,
        name: 'Kitchen',
        targetArticlesPerWeek: -3,
      }).success
    ).toBe(false);

    expect(
      updateContentStreamSchema.safeParse({
        targetBufferDays: -7,
      }).success
    ).toBe(false);
  });

  test('rejects a non-integer target value', () => {
    const parsed = createContentStreamSchema.safeParse({
      projectId: PROJECT_ID,
      name: 'Bathroom',
      targetPinsPerDay: 1.5,
    });
    expect(parsed.success).toBe(false);
  });

  test('rejects an invalid status', () => {
    expect(contentStreamStatusSchema.safeParse('deleted').success).toBe(false);
    expect(
      createContentStreamSchema.safeParse({
        projectId: PROJECT_ID,
        name: 'Kitchen',
        status: 'deleted',
      }).success
    ).toBe(false);
  });

  test('accepts every one of the four allowed statuses', () => {
    for (const status of ['active', 'warming', 'paused', 'archived']) {
      expect(contentStreamStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  test('rejects an empty name', () => {
    const parsed = createContentStreamSchema.safeParse({
      projectId: PROJECT_ID,
      name: '   ',
    });
    expect(parsed.success).toBe(false);
  });

  test('rejects a malformed projectId', () => {
    const parsed = createContentStreamSchema.safeParse({
      projectId: 'not-a-uuid',
      name: 'Kitchen',
    });
    expect(parsed.success).toBe(false);
  });
});

test.describe('content-stream ownership checks (TASK-FIX-039 Phase 2a)', () => {
  const userId = 'user-a';
  const otherUserId = 'user-b';
  const projectId = 'project-1';
  const otherProjectId = 'project-2';

  test('isOwnedProject accepts a project owned by the caller', () => {
    expect(isOwnedProject({ user_id: userId }, userId)).toBe(true);
  });

  test('isOwnedProject rejects a project owned by another user', () => {
    expect(isOwnedProject({ user_id: otherUserId }, userId)).toBe(false);
  });

  test('isOwnedProject rejects a missing project', () => {
    expect(isOwnedProject(null, userId)).toBe(false);
    expect(isOwnedProject(undefined, userId)).toBe(false);
  });

  test('isCategoryInProject accepts a category owned by the caller under the requested project', () => {
    expect(isCategoryInProject({ user_id: userId, project_id: projectId }, projectId, userId)).toBe(true);
  });

  test('isCategoryInProject rejects a category from a different project (even same user)', () => {
    expect(isCategoryInProject({ user_id: userId, project_id: otherProjectId }, projectId, userId)).toBe(false);
  });

  test('isCategoryInProject rejects a category owned by another user', () => {
    expect(isCategoryInProject({ user_id: otherUserId, project_id: projectId }, projectId, userId)).toBe(false);
  });

  test('isBoardInProject accepts a board owned by the caller under the requested project', () => {
    expect(isBoardInProject({ user_id: userId, project_id: projectId }, projectId, userId)).toBe(true);
  });

  test('isBoardInProject rejects a board belonging to a different project than the content stream', () => {
    expect(isBoardInProject({ user_id: userId, project_id: otherProjectId }, projectId, userId)).toBe(false);
  });

  test('isBoardInProject rejects a board owned by another user', () => {
    expect(isBoardInProject({ user_id: otherUserId, project_id: projectId }, projectId, userId)).toBe(false);
  });

  test('isBoardInProject rejects a missing board', () => {
    expect(isBoardInProject(null, projectId, userId)).toBe(false);
  });
});

/**
 * These map 1:1 onto the seven scenarios required by the security-hardening
 * brief (TASK-COMMAND-CENTER-PHASE-2.md §14a) and onto the exact predicates
 * written into migration 030's WITH CHECK clauses. They exercise the
 * TypeScript defense-in-depth layer only — see the "RLS-mirrored scenarios
 * that need a real PostgreSQL" note below for which of these seven also
 * require the SQL checklist in §14a to be run against a live Supabase
 * project before this migration is trusted in production.
 */
test.describe('RLS-mirrored scenarios (TASK-FIX-039 security hardening)', () => {
  const userA = 'user-a';
  const userB = 'user-b';
  const projectOfA = 'project-a1';
  const otherProjectOfA = 'project-a2';

  test('scenario 1 — user A + project owned by user B → rejected', () => {
    expect(isOwnedProject({ user_id: userB }, userA)).toBe(false);
  });

  test('scenario 2 — user A + category owned by user B → rejected', () => {
    expect(isCategoryInProject({ user_id: userB, project_id: projectOfA }, projectOfA, userA)).toBe(false);
  });

  test('scenario 3 — category owned by user A but under a different project of A → rejected', () => {
    expect(isCategoryInProject({ user_id: userA, project_id: otherProjectOfA }, projectOfA, userA)).toBe(false);
  });

  test('scenario 4 — user A + board owned by user B → rejected', () => {
    expect(isBoardInProject({ user_id: userB, project_id: projectOfA }, projectOfA, userA)).toBe(false);
  });

  test('scenario 5 — board owned by user A but under a different project of A → rejected', () => {
    expect(isBoardInProject({ user_id: userA, project_id: otherProjectOfA }, projectOfA, userA)).toBe(false);
  });

  test('scenario 7 — a fully valid combination (own project, own category in that project, own board in that project) is accepted', () => {
    expect(isOwnedProject({ user_id: userA }, userA)).toBe(true);
    expect(isCategoryInProject({ user_id: userA, project_id: projectOfA }, projectOfA, userA)).toBe(true);
    expect(isBoardInProject({ user_id: userA, project_id: projectOfA }, projectOfA, userA)).toBe(true);
  });

  /**
   * Scenario 6 — a content_stream_boards row whose user_id is inconsistent
   * with the stream's or the board's owner → rejected.
   *
   * This one has NO TypeScript unit test here on purpose: nothing in
   * lib/queries/content-streams.ts accepts a client-supplied `user_id` for
   * a link — `linkBoardToContentStream()` always writes the *caller's own*
   * userId, never a parameter, so the application layer cannot even
   * construct the inconsistent input this scenario describes. The only
   * place this can genuinely be exercised is a direct Supabase client call
   * that bypasses lib/queries entirely — which is exactly the migration
   * 030 WITH CHECK clause's job (its three EXISTS/equality checks
   * transitively force content_stream_boards.user_id, the stream's
   * user_id, and the board's user_id to the same auth.uid() value). See
   * §14a's SQL checklist, step 6, for the concrete statement to run against
   * a real Supabase project.
   */
});
