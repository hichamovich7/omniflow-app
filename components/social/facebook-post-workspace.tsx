'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, ExternalLink, Loader2, RefreshCw, Save, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  deleteSocialContent,
  publishToFacebook,
  retryFacebookStep,
  saveFacebookEdits,
} from '@/components/social/facebook-requests';
import {
  allowedLinkPlacements,
  composeFacebookFirstComment,
  composeFacebookPostMessage,
  FACEBOOK_LINK_PLACEMENT_HELP,
  FACEBOOK_LINK_PLACEMENT_LABELS,
  FACEBOOK_LINK_PLACEMENTS,
  facebookPartsFromRow,
  type FacebookLinkPlacement,
  type SocialContentGeneration,
} from '@/lib/social/social-content';
import {
  FACEBOOK_DISPLAY_STATUS_LABELS,
  facebookDisplayStatus,
  publicationActions,
  SOCIAL_CONNECTION_STATUS_LABELS,
  type SocialConnection,
  type SocialPublication,
} from '@/lib/social/facebook-publication';
import { cn } from '@/lib/utils';

const EDIT_LIMITS = { post: 3000, callToAction: 160, firstCommentText: 160 } as const;

interface FacebookPostWorkspaceProps {
  item: SocialContentGeneration;
  projectName: string;
  publication: SocialPublication | null;
  /** The Facebook Page connected to the content's project — null when none. */
  connection: SocialConnection | null;
  configured: boolean;
}

type PublishResult = { publication: SocialPublication; warning: string | null };

/**
 * Review, edit and publish one Facebook post (TASK-068). Publication is
 * manual: "Publish to Facebook" opens a confirmation showing the Page and
 * exactly what will be posted. After a partial publication only "Retry
 * comment" is offered — the post itself is never sent twice.
 */
export function FacebookPostWorkspace({ item, projectName, publication: initialPublication, connection, configured }: FacebookPostWorkspaceProps) {
  const router = useRouter();
  const saved = facebookPartsFromRow(item);
  const [post, setPost] = useState(saved.post);
  const [callToAction, setCallToAction] = useState(saved.callToAction ?? '');
  const [firstCommentText, setFirstCommentText] = useState(saved.firstCommentText ?? '');
  const [linkPlacement, setLinkPlacement] = useState<FacebookLinkPlacement>(saved.linkPlacement);
  const [publication, setPublication] = useState<SocialPublication | null>(initialPublication);
  const [busy, setBusy] = useState<'save' | 'publish' | 'retry' | 'retry-comment' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const placements = allowedLinkPlacements(item.cta_url);
  const actions = publicationActions(publication);
  const status = facebookDisplayStatus(publication);
  const parts = { post, callToAction, firstCommentText, linkPlacement, url: item.cta_url };
  const message = composeFacebookPostMessage(parts);
  const comment = composeFacebookFirstComment(parts);
  const dirty = useMemo(
    () =>
      post !== saved.post ||
      callToAction !== (saved.callToAction ?? '') ||
      firstCommentText !== (saved.firstCommentText ?? '') ||
      linkPlacement !== saved.linkPlacement,
    [post, callToAction, firstCommentText, linkPlacement, saved.post, saved.callToAction, saved.firstCommentText, saved.linkPlacement]
  );
  const connectionUsable = Boolean(connection && connection.status !== 'expired' && connection.status !== 'revoked');
  const canComment = Boolean(connection?.granted_scopes.includes('pages_manage_engagement'));

  async function save() {
    setBusy('save');
    setError(null);
    const response = await saveFacebookEdits<SocialContentGeneration>(item.id, { post, callToAction, firstCommentText, linkPlacement });
    setBusy(null);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    toast.success('Changes saved.');
    router.refresh();
  }

  function applyResult(data: PublishResult | null, fallback: string | undefined) {
    if (!data) {
      setError(fallback ?? 'The request failed.');
      return;
    }
    setPublication(data.publication);
    if (data.warning) {
      setError(data.warning);
      toast.error(data.publication.status === 'partial' ? 'The post is published, but the first comment failed.' : 'Facebook refused the post.');
    } else {
      toast.success(data.publication.comment_status === 'published' ? 'Published on Facebook with the first comment.' : 'Published on Facebook.');
    }
    router.refresh();
  }

  async function publish() {
    if (!connection) return;
    setBusy('publish');
    setError(null);
    const response = await publishToFacebook<PublishResult>(item.id, connection.id);
    setBusy(null);
    setConfirmOpen(false);
    applyResult(response.data, response.error?.message);
  }

  async function retry(step: 'post' | 'comment') {
    if (!publication) return;
    setBusy(step === 'comment' ? 'retry-comment' : 'retry');
    setError(null);
    const response = await retryFacebookStep<PublishResult>(publication.id, step);
    setBusy(null);
    applyResult(response.data, response.error?.message);
  }

  async function remove() {
    setBusy('delete');
    const response = await deleteSocialContent<{ id: string }>(item.id);
    setBusy(null);
    if (response.error) {
      toast.error(response.error.message);
      return;
    }
    toast.success('Facebook post deleted from OmniFlow.');
    router.push('/facebook');
    router.refresh();
  }

  async function copyPost() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Post text copied to clipboard');
    } catch {
      toast.error('Failed to copy the post text');
    }
  }

  return (
    <div className="space-y-6" data-testid="facebook-post-workspace">
      <div className="flex flex-wrap items-center gap-2" data-testid="facebook-publication-status">
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
        >
          {FACEBOOK_DISPLAY_STATUS_LABELS[status]}
        </Badge>
        {publication?.comment_requested && (
          <Badge variant={publication.comment_status === 'published' ? 'success' : 'outline'}>
            {publication.comment_status === 'published' ? 'Comment published' : `Comment: ${publication.comment_status.replace('_', ' ')}`}
          </Badge>
        )}
        {publication?.external_post_url && (
          <a href={publication.external_post_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View on Facebook <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="facebook-edit-title" className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <h2 id="facebook-edit-title" className="text-base font-semibold">
            {actions.canEdit ? 'Edit before publishing' : 'Published content'}
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="facebook-post-text">Post text</Label>
            <Textarea
              id="facebook-post-text"
              value={post}
              onChange={(event) => setPost(event.target.value)}
              maxLength={EDIT_LIMITS.post}
              readOnly={!actions.canEdit}
              rows={8}
            />
            <p className="text-xs text-muted-foreground">No link here — OmniFlow adds the article link where you choose below.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="facebook-cta">Call to action</Label>
            <Textarea
              id="facebook-cta"
              value={callToAction}
              onChange={(event) => setCallToAction(event.target.value)}
              maxLength={EDIT_LIMITS.callToAction}
              readOnly={!actions.canEdit}
              rows={2}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Article link</legend>
            {FACEBOOK_LINK_PLACEMENTS.map((value) => {
              const allowed = placements.includes(value);
              return (
                <label
                  key={value}
                  className={cn('flex gap-2 rounded-lg border p-2.5 text-sm', linkPlacement === value ? 'border-primary bg-selected' : 'border-border', !allowed && 'opacity-60')}
                >
                  <input
                    type="radio"
                    name="facebook-link-placement"
                    value={value}
                    checked={linkPlacement === value}
                    disabled={!allowed || !actions.canEdit}
                    onChange={() => setLinkPlacement(value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{FACEBOOK_LINK_PLACEMENT_LABELS[value]}</span>
                    <span className="block text-xs text-muted-foreground">{FACEBOOK_LINK_PLACEMENT_HELP[value]}</span>
                  </span>
                </label>
              );
            })}
            {!item.cta_url && (
              <p className="text-xs text-muted-foreground">This article has no public WordPress link, so only &quot;No link&quot; is possible.</p>
            )}
          </fieldset>

          {linkPlacement === 'first_comment' && (
            <div className="space-y-1.5">
              <Label htmlFor="facebook-comment">First comment text</Label>
              <Textarea
                id="facebook-comment"
                value={firstCommentText}
                onChange={(event) => setFirstCommentText(event.target.value)}
                maxLength={EDIT_LIMITS.firstCommentText}
                readOnly={!actions.canEdit}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">The exact article link is added after this text.</p>
            </div>
          )}

          {actions.canEdit && (
            <Button type="button" size="sm" variant="outline" onClick={save} disabled={!dirty || busy !== null}>
              {busy === 'save' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save changes
            </Button>
          )}
        </section>

        <section aria-labelledby="facebook-preview-title" className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <h2 id="facebook-preview-title" className="text-base font-semibold">
            Preview
          </h2>
          <div className="space-y-3 rounded-xl border border-border bg-background p-4" data-testid="facebook-post-preview">
            <p className="text-xs font-medium text-muted-foreground">{connection?.external_account_name ?? 'Your Facebook Page'}</p>
            <p className="whitespace-pre-line break-words text-sm">{message}</p>
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt={item.image_alt ?? ''} className="max-h-72 w-full rounded-lg border border-border/60 object-cover" loading="lazy" />
            ) : (
              <p className="text-xs text-muted-foreground">No article image: the post is published as text only.</p>
            )}
          </div>
          {comment && (
            <div className="rounded-xl border border-border bg-background p-3" data-testid="facebook-comment-preview">
              <p className="text-xs font-medium text-muted-foreground">First comment by the Page</p>
              <p className="whitespace-pre-line break-all text-sm">{comment}</p>
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={copyPost}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy post text
          </Button>
        </section>
      </div>

      <section aria-labelledby="facebook-publish-title" className="space-y-3 rounded-2xl border border-border/60 bg-card p-5 shadow-sm" data-testid="facebook-publish-panel">
        <h2 id="facebook-publish-title" className="text-base font-semibold">
          Publish to your Facebook Page
        </h2>
        {!configured ? (
          <Alert variant="warning" role="status">
            Facebook publishing is not configured on this server yet. You can still copy the post text.
          </Alert>
        ) : !connection ? (
          <p className="text-sm text-muted-foreground">
            No Facebook Page is connected to {projectName}.{' '}
            <Link href="/facebook" className="font-medium text-primary hover:underline">
              Connect a Facebook Page
            </Link>
          </p>
        ) : (
          <p className="text-sm">
            Page: <span className="font-medium">{connection.external_account_name}</span>{' '}
            <span className="text-muted-foreground">(ID {connection.external_account_id})</span> ·{' '}
            <span className={connectionUsable ? 'text-muted-foreground' : 'text-warning'}>{SOCIAL_CONNECTION_STATUS_LABELS[connection.status]}</span>
            {!connectionUsable && (
              <>
                {' '}
                ·{' '}
                <Link href="/facebook" className="font-medium text-primary hover:underline">
                  Reconnect
                </Link>
              </>
            )}
          </p>
        )}

        {linkPlacement === 'first_comment' && connection && !canComment && actions.canPublish && (
          <Alert variant="warning" role="status">
            The first-comment permission was not granted for this Page. Reconnect it and keep every permission, or choose another link
            option.
          </Alert>
        )}
        {publication?.status === 'partial' && (
          <Alert variant="warning" role="status">
            The post is published on Facebook, but the first comment was not. Use &quot;Retry comment&quot;: the post will not be published
            again.
          </Alert>
        )}
        {publication?.status === 'unknown' && (
          <Alert variant="warning" role="status">
            Facebook did not confirm the result. &quot;Retry&quot; first checks your Page and never posts the same content twice.
          </Alert>
        )}
        {publication?.status === 'failed' && publication.error_message && <Alert variant="danger">{publication.error_message}</Alert>}

        <div className="flex flex-wrap gap-2">
          {actions.canPublish && (
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={!configured || !connectionUsable || dirty || busy !== null || (linkPlacement === 'first_comment' && !canComment)}
              title={dirty ? 'Save your changes first.' : undefined}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Publish to Facebook
            </Button>
          )}
          {actions.canRetry && (
            <Button type="button" size="sm" onClick={() => retry('post')} disabled={!configured || !connectionUsable || dirty || busy !== null}>
              {busy === 'retry' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Retry
            </Button>
          )}
          {actions.canRetryComment && (
            <Button type="button" size="sm" onClick={() => retry('comment')} disabled={!configured || !connectionUsable || busy !== null}>
              {busy === 'retry-comment' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Retry comment
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)} disabled={busy !== null}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Nothing is published without this confirmation. Scheduling is not available yet. The WordPress article is never modified.
        </p>
      </section>

      <Dialog open={confirmOpen} onOpenChange={(open) => busy === null && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish to Facebook?</DialogTitle>
            <DialogDescription>
              This post will be published now on the Facebook Page &quot;{connection?.external_account_name}&quot;
              {item.image_url ? ' with the article image' : ' as text only'}
              {comment ? ', then the Page will add the article link as the first comment.' : '.'}
            </DialogDescription>
          </DialogHeader>
          <p className="max-h-48 overflow-y-auto whitespace-pre-line break-words rounded-lg border border-border bg-background p-3 text-sm">{message}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button type="button" onClick={publish} disabled={busy !== null}>
              {busy === 'publish' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Publish now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => busy === null && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this Facebook post from OmniFlow?</DialogTitle>
            <DialogDescription>
              It will be removed from your Facebook history in OmniFlow. A post already published stays on your Facebook Page. The
              source article is not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={busy !== null}>
              {busy === 'delete' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        <Link href="/facebook" className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'px-0')}>
          Back to Facebook posts
        </Link>
      </p>
    </div>
  );
}
