import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, PenSquare, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Pagination } from '@/components/shared/pagination';
import { MediumHistoryFilters } from '@/components/social/medium-history-filters';
import { SocialContentMeta } from '@/components/social/social-content-meta';
import { SocialContentActions } from '@/components/social/social-content-actions';
import { listSocialContentGenerations } from '@/lib/queries/social-content';
import {
  contentPreview,
  parseSocialContentFilters,
  regenerateRequestFor,
  SOCIAL_CONTENT_PAGE_SIZE,
} from '@/lib/social/social-content';
import { cn } from '@/lib/utils';

/**
 * Medium history (TASK-063): every saved Medium summary of the user, newest
 * first, filtered by project / source / date / status. The page only reads;
 * copy, download, regenerate and delete are client actions.
 */
export default async function MediumHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseSocialContentFilters(params);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: projects }, { items, total, unavailable }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('user_id', user.id).order('name'),
    listSocialContentGenerations(supabase, user.id, 'medium', filters),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / SOCIAL_CONTENT_PAGE_SIZE));
  const hasFilters = Boolean(filters.project || filters.source || filters.period || filters.status);

  return (
    <PageContainer>
      <PageHeader
        title="Medium"
        icon={PenSquare}
        description="Your saved Medium summaries. Copy or download them and paste them into Medium yourself — nothing is published automatically."
      />

      {unavailable && (
        <Alert variant="warning" role="status">
          Medium history is not available yet (database migration 045 not applied). Summaries can still be generated from an
          article, but they are not saved.
        </Alert>
      )}

      <MediumHistoryFilters projects={projects ?? []} />

      {items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No matching results' : 'No Medium summaries yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters to find what you are looking for.'
              : 'Open a completed WordPress article and use "Generate Medium summary" in its Social Content Studio, or select an existing WordPress post.'
          }
          icon={hasFilters ? Search : Clock}
        >
          {hasFilters ? (
            <Link href="/medium" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Clear filters
            </Link>
          ) : (
            <Link href="/wordpress/history" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Go to WordPress articles
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-4" data-testid="medium-history-list">
            {items.map((item) => (
              <li key={item.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
                <div className="flex gap-4">
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.image_alt ?? ''}
                      className="hidden h-20 w-28 shrink-0 rounded-lg border border-border/60 object-cover sm:block"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <h2 className="text-base font-semibold">
                      <Link href={`/medium/${item.id}`} className="hover:underline">
                        {item.title}
                      </Link>
                    </h2>
                    <p className="text-sm text-muted-foreground">{contentPreview(item.content_markdown)}</p>
                    <SocialContentMeta item={item} />
                  </div>
                </div>
                <div className="mt-3">
                  <SocialContentActions
                    id={item.id}
                    title={item.title}
                    markdown={item.content_markdown}
                    html={item.content_html}
                    regenerateSource={regenerateRequestFor(item)}
                    showOpen
                  />
                </div>
              </li>
            ))}
          </ul>
          <Pagination basePath="/medium" currentPage={filters.page} totalPages={totalPages} searchParams={params} />
        </>
      )}
    </PageContainer>
  );
}
