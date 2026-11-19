import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { ResourceHeader } from '@/components/shared/resource-header';
import { SocialContentMeta } from '@/components/social/social-content-meta';
import { FacebookPostWorkspace } from '@/components/social/facebook-post-workspace';
import { getSocialContentGeneration } from '@/lib/queries/social-content';
import { listProjectFacebookConnections } from '@/lib/queries/social-connections';
import { facebookDraftCategoryIds, listFacebookPageCategoryMappings } from '@/lib/queries/facebook-page-mappings';
import { suggestFacebookPage } from '@/lib/social/facebook-pages';
import { listPublicationsForGenerations } from '@/lib/queries/social-publications';
import { listImageVariants } from '@/lib/queries/facebook-image-variants';
import { listArticleFacebookPosts } from '@/lib/queries/facebook-article-posts';
import { FacebookArticlePosts } from '@/components/social/facebook-article-posts';
import { getMetaConfig, hasSocialTokenKey } from '@/lib/social/meta/config';
import { isValidUuid } from '@/lib/utils/uuid';

/**
 * One saved Facebook post (TASK-068): source, edit, preview, publication to
 * the Facebook Page chosen among the project's connected Pages (TASK-102:
 * pre-selected when the project has one Page or the article's category is
 * mapped to one Page) and its status. Only the caller's
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

  const [connections, mappings, categoryIds, imageVariants, articlePosts] = await Promise.all([
    listProjectFacebookConnections(supabase, user.id, item.project_id),
    listFacebookPageCategoryMappings(supabase, user.id, item.project_id),
    facebookDraftCategoryIds(supabase, user.id, item),
    listImageVariants(supabase, user.id, item.id, item.origin_image_variant_id ?? null),
    // TASK-101 extension / TASK-103: every Facebook post of the same article.
    listArticleFacebookPosts(supabase, user.id, item),
  ]);
  const posts = articlePosts.some((post) => post.id === item.id) ? articlePosts : [item, ...articlePosts];
  // A suggestion only pre-selects the Page; the person confirms it, and an existing publication keeps its own Page.
  const suggestion = suggestFacebookPage({ connections, mappings: mappings.mappings, categoryIds });
  const publications = await listPublicationsForGenerations(
    supabase,
    user.id,
    posts.map((post) => post.id)
  );

  return (
    <PageContainer>
      <ResourceHeader title={item.title} backHref="/facebook" backLabel="Back to Facebook" />
      <div className="space-y-6">
        <SocialContentMeta item={item} />
        <FacebookPostWorkspace
          item={item}
          projectName={item.projects?.name ?? 'this project'}
          publication={publications[item.id] ?? null}
          connections={connections}
          suggestion={suggestion}
          configured={Boolean(getMetaConfig()) && hasSocialTokenKey()}
          imageVariants={imageVariants.variants}
          imageVariantsUnavailable={imageVariants.unavailable}
        />
        <FacebookArticlePosts currentId={item.id} posts={posts} publications={publications} />
      </div>
    </PageContainer>
  );
}
