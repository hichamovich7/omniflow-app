import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FACEBOOK_DISPLAY_STATUS_LABELS, facebookDisplayStatus, type FacebookDisplayStatus, type SocialPublication } from '@/lib/social/facebook-publication';
import { VISUAL_ANGLE_LABELS } from '@/lib/social/facebook-article-posts';
import { contentPreview, type SocialContentGeneration } from '@/lib/social/social-content';
import { formatScheduledTime } from '@/lib/social/schedule-time';

export function facebookStatusBadgeVariant(status: FacebookDisplayStatus): 'success' | 'danger' | 'warning' | 'outline' {
  if (status === 'published' || status === 'comment_published') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'partial' || status === 'unknown') return 'warning';
  return 'outline';
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Page, date and Facebook link of a publication — shared by the history and "Posts from this article". */
export function PublicationFacts({ publication }: { publication: SocialPublication | null }) {
  if (!publication) return <span>Not published</span>;
  const when =
    publication.status === 'scheduled' && publication.scheduled_at
      ? `Scheduled for ${formatScheduledTime(publication.scheduled_at, publication.scheduled_timezone)}`
      : formatDate(publication.published_at)
        ? `Published ${formatDate(publication.published_at)}`
        : null;
  return (
    <>
      <span>Page &quot;{publication.external_account_name}&quot;</span>
      {when && <span>{when}</span>}
      {publication.external_post_url && (
        <a href={publication.external_post_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
          View on Facebook <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </>
  );
}

interface FacebookArticlePostsProps {
  currentId: string;
  posts: SocialContentGeneration[];
  publications: Record<string, SocialPublication>;
}

/**
 * Every Facebook post of the same article (TASK-101 extension / TASK-103):
 * image, text, Page, date, status and Facebook link. Each one is edited,
 * published or scheduled on its own page.
 */
export function FacebookArticlePosts({ currentId, posts, publications }: FacebookArticlePostsProps) {
  if (posts.length < 2) return null;
  return (
    <section aria-labelledby="facebook-article-posts-title" className="space-y-3 rounded-2xl border border-border/60 bg-card p-5 shadow-sm" data-testid="facebook-article-posts">
      <h2 id="facebook-article-posts-title" className="text-base font-semibold">
        Posts from this article ({posts.length})
      </h2>
      <p className="text-sm text-muted-foreground">Each post has its own text, image and publication. Publishing or scheduling one never changes the others.</p>
      <ul className="space-y-3">
        {posts.map((post) => {
          const publication = publications[post.id] ?? null;
          const status = facebookDisplayStatus(publication);
          return (
            <li key={post.id} className="flex gap-3 rounded-xl border border-border/60 p-3" data-testid="facebook-article-post">
              {post.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.image_url} alt={post.image_alt ?? ''} className="h-20 w-16 shrink-0 rounded-md border border-border/60 object-cover" loading="lazy" />
              ) : (
                <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">Text only</div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {post.id === currentId ? (
                    <span className="text-sm font-medium">This post</span>
                  ) : (
                    <Link href={`/facebook/${post.id}`} className="text-sm font-medium hover:underline">
                      Open post
                    </Link>
                  )}
                  {post.visual_angle && <Badge variant="outline">{VISUAL_ANGLE_LABELS[post.visual_angle]}</Badge>}
                  <Badge variant={facebookStatusBadgeVariant(status)}>{FACEBOOK_DISPLAY_STATUS_LABELS[status]}</Badge>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{contentPreview(post.content_markdown)}</p>
                <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span>Created {formatDate(post.created_at)}</span>
                  <PublicationFacts publication={publication} />
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
