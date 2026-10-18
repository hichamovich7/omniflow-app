import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, Search, ThumbsUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Pagination } from '@/components/shared/pagination';
import { MediumHistoryFilters } from '@/components/social/medium-history-filters';
import { SocialContentMeta } from '@/components/social/social-content-meta';
import { NewFacebookPost } from '@/components/social/new-facebook-post';
import { FacebookConnections } from '@/components/social/facebook-connections';
import {
  listMediumArticleOptions,
  listMediumPinterestOptions,
  listMediumSiteOptions,
  listSocialContentGenerations,
} from '@/lib/queries/social-content';
import { listSocialConnections } from '@/lib/queries/social-connections';
import { listPublicationsForGenerations } from '@/lib/queries/social-publications';
import { contentPreview, parseSocialContentFilters, SOCIAL_CONTENT_PAGE_SIZE } from '@/lib/social/social-content';
import { FACEBOOK_DISPLAY_STATUS_LABELS, facebookDisplayStatus } from '@/lib/social/facebook-publication';
import { getMetaConfig, hasSocialTokenKey } from '@/lib/social/meta/config';
import { isValidUuid } from '@/lib/utils/uuid';
import { cn } from '@/lib/utils';

/**
 * Facebook (TASK-068): Facebook Page connection per project, "New Facebook
 * post" (same sources as Medium), and the history of saved posts with their
 * publication status. Facebook Pages only — no personal profile, no group,
 * no scheduling. The page only reads; generation, editing, connection and
 * publication are client actions through OmniFlow's API.
 */
export default async function FacebookPage({
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

  const [{ data: projects }, { items, total, unavailable }, connections, articleOptions, siteOptions, pinterestOptions] = await Promise.all([
    supabase.from('projects').select('id, name').eq('user_id', user.id).order('name'),
    listSocialContentGenerations(supabase, user.id, 'facebook', filters),
    listSocialConnections(supabase, user.id),
    listMediumArticleOptions(supabase, user.id),
    listMediumSiteOptions(supabase, user.id),
    listMediumPinterestOptions(supabase, user.id),
  ]);
  const publications = await listPublicationsForGenerations(
    supabase,
    user.id,
    items.map((item) => item.id)
  );
  const totalPages = Math.max(1, Math.ceil(total / SOCIAL_CONTENT_PAGE_SIZE));
  const hasFilters = Boolean(filters.project || filters.source || filters.period || filters.status);
  const connectStatus = params.connect === 'select' || params.connect === 'error' ? params.connect : null;

  return (
    <PageContainer>
      <PageHeader
        title="Facebook"
        icon={ThumbsUp}
        description="Facebook Page posts written from your WordPress articles. Review and edit them, then publish to your connected Page — only when you confirm."
      />

      {unavailable && (
        <Alert variant="warning" role="status">
          Facebook history is not available yet (database migration 046 not applied).
        </Alert>
      )}

      <FacebookConnections
        projects={projects ?? []}
        connections={connections.connections}
        unavailable={connections.unavailable}
        configured={Boolean(getMetaConfig()) && hasSocialTokenKey()}
        connect={{
          status: connectStatus,
          reason: params.reason ?? null,
          projectId: params.projectId && isValidUuid(params.projectId) ? params.projectId : null,
        }}
      />

      <NewFacebookPost articles={articleOptions} sites={siteOptions} pinterest={pinterestOptions} />

      <h2 className="text-base font-semibold">History</h2>
      <MediumHistoryFilters projects={projects ?? []} basePath="/facebook" />

      {items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No matching results' : 'No Facebook posts yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters to find what you are looking for.'
              : 'Use "New Facebook post" above, or "Generate Facebook post" in the Social Content Studio of an article.'
          }
          icon={hasFilters ? Search : Clock}
          headingLevel={3}
        >
          {hasFilters && (
            <Link href="/facebook" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Clear filters
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-4" data-testid="facebook-history-list">
            {items.map((item) => {
              const status = facebookDisplayStatus(publications[item.id] ?? null);
              return (
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
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">
                          <Link href={`/facebook/${item.id}`} className="hover:underline">
                            {item.title}
                          </Link>
                        </h3>
                        <Badge
                          variant={
                            status === 'published' || status === 'comment_published'
                              ? 'success'
                              : status === 'failed'
                                ? 'danger'
                                : status === 'partial' || status === 'unknown'
                                  ? 'warning'
                                  : 'outline'
                          }
                          data-testid="facebook-history-status"
                        >
                          {FACEBOOK_DISPLAY_STATUS_LABELS[status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{contentPreview(item.content_markdown)}</p>
                      <SocialContentMeta item={item} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <Link href={`/facebook/${item.id}`} className={cn(buttonVariants({ size: 'sm' }))}>
                      Open
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination basePath="/facebook" currentPage={filters.page} totalPages={totalPages} searchParams={params} />
        </>
      )}
    </PageContainer>
  );
}
