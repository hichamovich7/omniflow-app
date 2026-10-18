import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { ResourceHeader } from '@/components/shared/resource-header';
import { SocialContentMeta } from '@/components/social/social-content-meta';
import { FacebookPostWorkspace } from '@/components/social/facebook-post-workspace';
import { getSocialContentGeneration } from '@/lib/queries/social-content';
import { getProjectFacebookConnection } from '@/lib/queries/social-connections';
import { listPublicationsForGenerations } from '@/lib/queries/social-publications';
import { getMetaConfig, hasSocialTokenKey } from '@/lib/social/meta/config';
import { isValidUuid } from '@/lib/utils/uuid';

/**
 * One saved Facebook post (TASK-068): source, edit, preview, publication to
 * the project's connected Facebook Page and its status. Only the caller's
 * own rows; the access token is never read here.
 */
export default async function FacebookPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const item = await getSocialContentGeneration(supabase, user.id, id);
  if (!item || item.platform !== 'facebook') notFound();

  const [connection, publications] = await Promise.all([
    getProjectFacebookConnection(supabase, user.id, item.project_id),
    listPublicationsForGenerations(supabase, user.id, [item.id]),
  ]);

  return (
    <PageContainer>
      <ResourceHeader title={item.title} backHref="/facebook" backLabel="Back to Facebook" />
      <div className="space-y-6">
        <SocialContentMeta item={item} />
        <FacebookPostWorkspace
          item={item}
          projectName={item.projects?.name ?? 'this project'}
          publication={publications[item.id] ?? null}
          connection={connection}
          configured={Boolean(getMetaConfig()) && hasSocialTokenKey()}
        />
      </div>
    </PageContainer>
  );
}
