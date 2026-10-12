import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { ResourceHeader } from '@/components/shared/resource-header';
import { ArticleContent } from '@/components/wordpress/article-content';
import { SocialContentMeta } from '@/components/social/social-content-meta';
import { SocialContentActions } from '@/components/social/social-content-actions';
import { getSocialContentGeneration } from '@/lib/queries/social-content';
import { regenerateRequestFor } from '@/lib/social/social-content';
import { isValidUuid } from '@/lib/utils/uuid';

/** One saved Medium summary (TASK-063): meta, full preview and actions. Only the caller's own rows. */
export default async function MediumSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const item = await getSocialContentGeneration(supabase, user.id, id);
  if (!item || item.platform !== 'medium') notFound();

  return (
    <PageContainer>
      <ResourceHeader title={item.title} backHref="/medium" backLabel="Back to Medium" />
      <div className="space-y-6">
        <SocialContentMeta item={item} />
        <SocialContentActions
          id={item.id}
          title={item.title}
          markdown={item.content_markdown}
          html={item.content_html}
          regenerateSource={regenerateRequestFor(item)}
          afterDeleteHref="/medium"
        />
        <div
          className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8 [&_em]:italic [&_hr]:my-4 [&_hr]:border-border"
          data-testid="medium-summary-preview"
        >
          <ArticleContent html={item.content_html} />
        </div>
      </div>
    </PageContainer>
  );
}
