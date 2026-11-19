'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { saveFacebookPageCategory } from '@/components/social/facebook-requests';
import type { FacebookPageCategoryMapping } from '@/lib/social/facebook-pages';
import { cn } from '@/lib/utils';

interface FacebookPageCategoriesSectionProps {
  projectId: string;
  /** Facebook Pages connected to this project (names and ids only — never a token). */
  pages: Array<{ pageId: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  mappings: FacebookPageCategoryMapping[];
  /** Migration 053 not applied. */
  unavailable: boolean;
}

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-60 sm:w-64';

/**
 * TASK-102 — the Facebook Pages of a project and the "WordPress category →
 * suggested Page" list. A suggestion only pre-selects the Page on a post; the
 * person can always choose another one, and an existing publication or
 * schedule keeps the Page it was confirmed with.
 */
export function FacebookPageCategoriesSection({ projectId, pages, categories, mappings, unavailable }: FacebookPageCategoriesSectionProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(mappings.map((mapping) => [mapping.wordpress_category_id, mapping.external_account_id]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const connected = new Set(pages.map((page) => page.pageId));

  async function change(categoryId: string, pageId: string) {
    const previous = values[categoryId] ?? '';
    setValues((current) => ({ ...current, [categoryId]: pageId }));
    setSaving(categoryId);
    const response = await saveFacebookPageCategory<{ mapping: FacebookPageCategoryMapping | null }>(projectId, categoryId, pageId || null);
    setSaving(null);
    if (response.error) {
      setValues((current) => ({ ...current, [categoryId]: previous }));
      toast.error(response.error.message);
      return;
    }
    toast.success(pageId ? 'Suggested Page saved.' : 'Suggestion removed.');
    router.refresh();
  }

  return (
    <div className="space-y-4" data-testid="facebook-page-categories">
      {pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Facebook Page connected to this project.{' '}
          <Link href="/facebook" className="font-medium text-primary hover:underline">
            Connect a Facebook Page
          </Link>
        </p>
      ) : (
        <p className="text-sm">
          Connected Pages: <span className="font-medium">{pages.map((page) => page.name).join(', ')}</span>
        </p>
      )}

      {unavailable && (
        <Alert variant="warning" role="status">
          Category suggestions are not available yet (database migration 053 not applied).
        </Alert>
      )}

      {pages.length > 1 && !unavailable && (
        <>
          <p className="text-xs text-muted-foreground">
            Suggested Page per WordPress category. On a post, the suggested Page is pre-selected — you can always choose another one.
            Changing a suggestion never moves a post that is already published or scheduled.
          </p>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No WordPress category in this project yet.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {categories.map((category) => {
                const value = values[category.id] ?? '';
                const missing = value !== '' && !connected.has(value);
                return (
                  <li key={category.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <label htmlFor={`facebook-category-${category.id}`} className="text-sm font-medium">
                      {category.name}
                      {missing && <span className="block text-xs font-normal text-warning">The suggested Page is not connected any more: nothing is suggested.</span>}
                    </label>
                    <span className="flex items-center gap-2">
                      {saving === category.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" />}
                      <select
                        id={`facebook-category-${category.id}`}
                        value={value}
                        onChange={(event) => change(category.id, event.target.value)}
                        disabled={saving !== null}
                        className={SELECT_CLASS}
                      >
                        <option value="">No suggestion</option>
                        {missing && <option value={value}>Disconnected Page ({value})</option>}
                        {pages.map((page) => (
                          <option key={page.pageId} value={page.pageId}>
                            {page.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {pages.length === 1 && <p className="text-xs text-muted-foreground">With a single Page, it is always pre-selected on new posts. Connect another Page to suggest one per category.</p>}

      <Link href="/facebook" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
        Manage Facebook Pages
      </Link>
    </div>
  );
}
