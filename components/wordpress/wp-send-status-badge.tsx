import { Badge } from '@/components/ui/badge';
import type { WordPressArticle } from '@/types/wordpress';

type SendStatusArticle = Pick<WordPressArticle, 'wp_post_id' | 'publish_status' | 'published_at' | 'scheduled_at'>;

function getSendStatus(article: SendStatusArticle): {
  label: string;
  variant: 'secondary' | 'success' | 'destructive';
} {
  if (!article.wp_post_id) {
    if (article.publish_status === 'failed') {
      return { label: 'Failed to send', variant: 'destructive' };
    }
    return { label: 'Not sent to WordPress', variant: 'secondary' };
  }

  switch (article.publish_status) {
    case 'published':
      return { label: 'Published', variant: 'success' };
    case 'scheduled':
      return {
        label: article.scheduled_at
          ? `Scheduled for ${new Date(article.scheduled_at).toLocaleString()}`
          : 'Scheduled',
        variant: 'success',
      };
    case 'failed':
      // wp_post_id already exists — a prior send succeeded, only the most
      // recent update attempt failed. Distinct from "never sent" above.
      return { label: 'Update failed', variant: 'destructive' };
    default:
      return { label: 'Sent as Draft', variant: 'success' };
  }
}

export function WpSendStatusBadge({
  article,
  siteUrl,
  compact = false,
}: {
  article: SendStatusArticle;
  siteUrl?: string;
  compact?: boolean;
}) {
  const { label, variant } = getSendStatus(article);

  if (compact) {
    return <Badge variant={variant}>{label}</Badge>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={variant}>{label}</Badge>
      {article.published_at && siteUrl && article.wp_post_id && (
        <a
          href={`${siteUrl}/?p=${article.wp_post_id}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          View on WordPress
        </a>
      )}
    </div>
  );
}
