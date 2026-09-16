import { expect, test } from 'playwright/test';
import {
  findSiteForProject,
  findContentStreamsForCategory,
  type ProjectSiteInfo,
  type ProjectContentStreamInfo,
} from '@/lib/wordpress/project-context';

/**
 * Pure-logic tests for the WordPress blog-post generator's Project Context
 * block (TASK-FIX-040 — /wordpress/blog-post reorg). Both functions
 * are simple array lookups with no Supabase call, no auth, and no effect on
 * article generation — see docs/UI_UX.md and
 * docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md for what they're informational
 * substitutes for (a client fetch), and why they're safe to run offline.
 */
test.describe('findSiteForProject (TASK-FIX-040)', () => {
  const SITES: ProjectSiteInfo[] = [
    { project_id: 'project-a', site_url: 'https://a.example.com' },
    { project_id: 'project-b', site_url: 'https://b.example.com' },
  ];

  test('returns the site connected to the given project', () => {
    expect(findSiteForProject(SITES, 'project-a')).toEqual(SITES[0]);
  });

  test('returns null when the project has no connected site', () => {
    expect(findSiteForProject(SITES, 'project-c')).toBeNull();
  });

  test('returns null for an empty sites list', () => {
    expect(findSiteForProject([], 'project-a')).toBeNull();
  });
});

test.describe('findContentStreamsForCategory (TASK-FIX-040)', () => {
  const STREAMS: ProjectContentStreamInfo[] = [
    { id: 'stream-1', project_id: 'project-a', name: 'Crochet Cats', wordpress_category_id: 'cat-1', status: 'active' },
    { id: 'stream-2', project_id: 'project-a', name: 'Crochet Sweaters', wordpress_category_id: 'cat-1', status: 'warming' },
    { id: 'stream-3', project_id: 'project-a', name: 'Home Decor', wordpress_category_id: 'cat-2', status: 'active' },
    { id: 'stream-4', project_id: 'project-b', name: 'Other Project Stream', wordpress_category_id: 'cat-1', status: 'active' },
  ];

  test('returns every stream matching the category, not just the first', () => {
    const result = findContentStreamsForCategory(STREAMS, 'project-a', 'cat-1');
    expect(result.map((s) => s.id)).toEqual(['stream-1', 'stream-2']);
  });

  test('never picks one arbitrarily when several streams match', () => {
    const result = findContentStreamsForCategory(STREAMS, 'project-a', 'cat-1');
    expect(result).toHaveLength(2);
  });

  test('returns an empty array when no stream matches the category', () => {
    expect(findContentStreamsForCategory(STREAMS, 'project-a', 'cat-999')).toEqual([]);
  });

  test('returns an empty array for an empty ("Uncategorized") categoryId', () => {
    expect(findContentStreamsForCategory(STREAMS, 'project-a', '')).toEqual([]);
  });

  test('never returns a match belonging to a different project', () => {
    const result = findContentStreamsForCategory(STREAMS, 'project-a', 'cat-1');
    expect(result.some((s) => s.project_id !== 'project-a')).toBe(false);
  });

  test('includes matches regardless of stream status (informational, not filtered)', () => {
    const result = findContentStreamsForCategory(STREAMS, 'project-a', 'cat-1');
    expect(result.map((s) => s.status)).toEqual(['active', 'warming']);
  });
});
