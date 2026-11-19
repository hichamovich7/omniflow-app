'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, FilePlus2, ImageIcon, ImagePlus, Info, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createFacebookPostFromImage, generateFacebookImageVariants, selectFacebookImage } from '@/components/social/facebook-requests';
import {
  FACEBOOK_IMAGE_VARIANT_MAX,
  FACEBOOK_VARIANT_ANGLES,
  IMAGE_LOCKED_MESSAGE,
  wordpressImageOf,
  type FacebookImageVariant,
  type GenerateVariantsResult,
} from '@/lib/social/facebook-image-variants';
import { DERIVED_POST_COST_TEXT } from '@/lib/social/facebook-article-posts';
import type { PublicationStatus } from '@/lib/social/facebook-publication';
import type { SocialContentGeneration } from '@/lib/social/social-content';
import { cn } from '@/lib/utils';

interface FacebookImageVariantsProps {
  item: SocialContentGeneration;
  variants: FacebookImageVariant[];
  /** Migration 050 not applied: the feature is hidden behind a notice. */
  unavailable: boolean;
  /** The post is scheduled, being published or on Facebook: its own image cannot change. */
  locked: boolean;
  /** Display only: picks the locked message (scheduled / being published / published). */
  publicationStatus?: PublicationStatus | null;
}

type DerivedResult = { draft: SocialContentGeneration; reused: boolean };

/** Short, status-specific lock line. Only a scheduled post suggests cancelling (a published one cannot be undone here). */
function lockedMessage(status: PublicationStatus | null | undefined): string {
  switch (status) {
    case 'scheduled':
      return 'This post is scheduled, so its image is locked. To change it, cancel the schedule first.';
    case 'publishing':
      return 'This post is being published, so its image can no longer change.';
    case 'published':
    case 'partial':
      return 'This post is already on Facebook, so its image can no longer change.';
    default:
      return IMAGE_LOCKED_MESSAGE;
  }
}

/** Status words for the "new post" dialog ("This post stays exactly as it is (…)"). */
function lockedState(status: PublicationStatus | null | undefined): string {
  if (status === 'scheduled') return 'it is scheduled';
  if (status === 'publishing') return 'it is being published';
  if (status === 'published' || status === 'partial') return 'it is already published';
  return 'it is already published or scheduled';
}

// Card actions may wrap on a narrow card instead of overflowing it; 44 px tall below `md`, 36 px above.
const CARD_ACTION = 'h-auto min-h-11 w-full whitespace-normal py-2 text-center leading-tight md:min-h-9';

/** One id per confirmation: a double click or a network retry sends the same id (no duplicate post). */
function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Image of a Facebook draft (TASK-101): the WordPress article image (default)
 * or one of the variants the person explicitly generated. Generating never
 * changes the selected image and never publishes anything — it stays
 * possible on a published or scheduled post. Every image can start a new,
 * independent post of the same article ("Create new post with this image").
 */
export function FacebookImageVariants({ item, variants: initialVariants, unavailable, locked, publicationStatus = null }: FacebookImageVariantsProps) {
  const router = useRouter();
  const [variants, setVariants] = useState(initialVariants);
  const [selectedId, setSelectedId] = useState<string | null>(item.selected_image_variant_id ?? null);
  const [count, setCount] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState<'generate' | 'derive' | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // "Create new post with this image" dialog.
  const [derive, setDerive] = useState<{ variantId: string | null; label: string; requestId: string } | null>(null);
  const [created, setCreated] = useState<{ id: string; label: string; reused: boolean } | null>(null);
  const wordpress = wordpressImageOf(item);

  if (unavailable) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="facebook-image-variants-unavailable">
        Image variants are not available yet (database migration 050 not applied).
      </p>
    );
  }

  async function generate() {
    setConfirmOpen(false);
    setBusy('generate');
    setError(null);
    setResult(null);
    const response = await generateFacebookImageVariants<GenerateVariantsResult>(item.id, count);
    setBusy(null);
    if (!response.data) {
      setError(response.error?.message ?? 'The images could not be generated.');
      return;
    }
    const { variants: generated, failures, unitsUsed } = response.data;
    setVariants((current) => [...generated, ...current]);
    const summary = `${generated.length} of ${unitsUsed} image${unitsUsed > 1 ? 's' : ''} generated (${unitsUsed} image call${unitsUsed > 1 ? 's' : ''} counted). The post image did not change.`;
    setResult(failures.length ? `${summary} Failed: ${failures.map((f) => `#${f.position} ${f.angle}`).join(', ')}.` : summary);
    if (generated.length) toast.success('Image variants ready.');
    else toast.error('No image could be generated.');
  }

  async function choose(variantId: string | null) {
    setBusy(variantId ?? 'wordpress');
    setError(null);
    const response = await selectFacebookImage<SocialContentGeneration>(item.id, variantId);
    setBusy(null);
    if (!response.data) {
      setError(response.error?.message ?? 'The image could not be changed.');
      return;
    }
    setSelectedId(variantId);
    toast.success(variantId ? 'This image will be used for the post.' : 'The WordPress image will be used for the post.');
    router.refresh();
  }

  async function createPost() {
    if (!derive || busy) return;
    const { variantId, label, requestId } = derive;
    setBusy('derive');
    setError(null);
    const response = await createFacebookPostFromImage<DerivedResult>(item.id, variantId, requestId);
    setBusy(null);
    setDerive(null);
    if (!response.data) {
      setError(response.error?.message ?? 'The new post could not be written.');
      return;
    }
    setCreated({ id: response.data.draft.id, label, reused: response.data.reused });
    toast.success(response.data.reused ? 'This post was already created.' : 'New draft created — nothing was published.');
    router.refresh();
  }

  const option = (key: string, url: string | null, label: string, active: boolean, onUse: () => void, variantId: string | null, testId: string) => (
    <li
      key={key}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card transition-colors',
        active ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      )}
      data-testid={testId}
      data-selected={active || undefined}
    >
      <div className="relative">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="aspect-[4/5] w-full bg-muted object-cover" loading="lazy" />
        ) : (
          <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 bg-muted px-3 text-center text-xs text-muted-foreground">
            <ImageIcon className="size-5" aria-hidden="true" />
            Text only (no image)
          </div>
        )}
        {active && (
          <Badge variant="primary" className="absolute left-2 top-2 shadow-sm" data-testid="facebook-image-selected">
            <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
            Selected image
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-2.5">
        <p className="line-clamp-2 break-words text-sm font-medium leading-snug" title={label}>
          {label}
        </p>
        <div className="mt-auto flex flex-col gap-2">
          {!active && !locked && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={CARD_ACTION}
              disabled={locked || busy !== null}
              loading={busy === key}
              onClick={onUse}
              aria-label={`Use this image: ${label}`}
            >
              Use this image
            </Button>
          )}
          {url && (
            <Button
              type="button"
              size="sm"
              className={CARD_ACTION}
              disabled={busy !== null}
              onClick={() => setDerive({ variantId, label, requestId: newRequestId() })}
              aria-label={`Create new post with this image: ${label}`}
              data-testid="facebook-create-post-from-image"
            >
              <FilePlus2 data-icon="inline-start" aria-hidden="true" />
              Create new post
            </Button>
          )}
        </div>
      </div>
    </li>
  );

  const imageCount = variants.length + 1;

  return (
    <section aria-labelledby="facebook-image-title" className="space-y-3 border-t border-border/60 pt-4" data-testid="facebook-image-variants">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48 space-y-0.5">
          <h3 id="facebook-image-title" className="text-sm font-semibold">
            Post image
          </h3>
          <p className="text-xs text-muted-foreground">
            {imageCount} image{imageCount > 1 ? 's' : ''} · {locked ? 'Start a new post from any image.' : 'Choose the image for this post, or start a new post from any image.'}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirmOpen(true)} loading={busy === 'generate'} data-testid="facebook-generate-images">
          <ImagePlus data-icon="inline-start" aria-hidden="true" />
          Generate images
        </Button>
      </div>
      {locked && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-secondary-foreground" data-testid="facebook-image-locked">
          <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {lockedMessage(publicationStatus)} You can still generate images and create a new post from any of them.
          </span>
        </p>
      )}
      {error && (
        <Alert variant="danger">
          <AlertCircle aria-hidden="true" />
          <span className="min-w-0">{error}</span>
        </Alert>
      )}
      {result && (
        <Alert variant="info" role="status" data-testid="facebook-image-variants-result">
          <Info aria-hidden="true" />
          <span className="min-w-0">{result}</span>
        </Alert>
      )}
      {created && (
        <Alert variant="success" role="status" data-testid="facebook-derived-post-created">
          <CheckCircle2 aria-hidden="true" />
          <p className="min-w-0 break-words">
            {created.reused ? 'This post had already been created' : 'New draft created'} with the image &quot;{created.label}&quot;. Nothing was published.{' '}
            <Link href={`/facebook/${created.id}`} className="rounded-xs font-medium underline outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Open the new post
            </Link>
          </p>
        </Alert>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-3" aria-label="Images for this post">
        {option('wordpress', wordpress.url, 'WordPress image (default)', selectedId === null, () => choose(null), null, 'facebook-image-option-wordpress')}
        {variants.map((variant) => {
          const angle = FACEBOOK_VARIANT_ANGLES.find((a) => a.id === variant.angle)?.label ?? 'Variant';
          const label = variant.social_content_generation_id === item.id ? angle : `${angle} (from the earlier post)`;
          return option(variant.id, variant.image_url, label, selectedId === variant.id, () => choose(variant.id), variant.id, 'facebook-image-option-variant');
        })}
      </ul>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate image variants</DialogTitle>
            <DialogDescription>
              New vertical (4:5) images for this post, from its title and text. Generating does not change the post image and publishes
              nothing — even when the post is already published or scheduled.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">How many images?</legend>
            <div className="flex gap-2">
              {Array.from({ length: FACEBOOK_IMAGE_VARIANT_MAX }, (_, i) => i + 1).map((n) => (
                <Button key={n} type="button" size="sm" variant={count === n ? 'default' : 'outline'} aria-pressed={count === n} onClick={() => setCount(n)}>
                  {n}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Angles: {FACEBOOK_VARIANT_ANGLES.slice(0, count).map((a) => a.label).join(', ')}.</p>
          </fieldset>
          <p className="text-sm" data-testid="facebook-image-variants-cost">
            This makes <strong>{count}</strong> image generation call{count > 1 ? 's' : ''} ({count} unit{count > 1 ? 's' : ''} of your generation quota), counted
            even if an image fails.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={generate}>
              Generate {count} image{count > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={derive !== null} onOpenChange={(open) => (!open && busy !== 'derive' ? setDerive(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new post with this image?</DialogTitle>
            <DialogDescription>
              A new, separate draft for the same article: its own text, call to action and first comment, written from the article for the image
              &quot;{derive?.label}&quot;. This post stays exactly as it is{locked ? ` (${lockedState(publicationStatus)})` : ''}. Nothing is published or
              scheduled — you review the new draft first.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm" data-testid="facebook-derived-post-cost">
            {DERIVED_POST_COST_TEXT}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy === 'derive'} onClick={() => setDerive(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy === 'derive'} onClick={createPost}>
              {busy === 'derive' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Write the new post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
