'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { generateFacebookImageVariants, selectFacebookImage } from '@/components/social/facebook-requests';
import {
  FACEBOOK_IMAGE_VARIANT_MAX,
  FACEBOOK_VARIANT_ANGLES,
  IMAGE_LOCKED_MESSAGE,
  wordpressImageOf,
  type FacebookImageVariant,
  type GenerateVariantsResult,
} from '@/lib/social/facebook-image-variants';
import type { SocialContentGeneration } from '@/lib/social/social-content';
import { cn } from '@/lib/utils';

interface FacebookImageVariantsProps {
  item: SocialContentGeneration;
  variants: FacebookImageVariant[];
  /** Migration 050 not applied: the feature is hidden behind a notice. */
  unavailable: boolean;
  /** The post is scheduled, being published or on Facebook: the image cannot change. */
  locked: boolean;
}

/**
 * Image of a Facebook draft (TASK-101): the WordPress article image (default)
 * or one of the variants the person explicitly generated. Generating never
 * changes the selected image and never publishes anything.
 */
export function FacebookImageVariants({ item, variants: initialVariants, unavailable, locked }: FacebookImageVariantsProps) {
  const router = useRouter();
  const [variants, setVariants] = useState(initialVariants);
  const [selectedId, setSelectedId] = useState<string | null>(item.selected_image_variant_id ?? null);
  const [count, setCount] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState<'generate' | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
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
    const { variants: created, failures, unitsUsed } = response.data;
    setVariants((current) => [...created, ...current]);
    const summary = `${created.length} of ${unitsUsed} image${unitsUsed > 1 ? 's' : ''} generated (${unitsUsed} image call${unitsUsed > 1 ? 's' : ''} counted). The post image did not change.`;
    setResult(failures.length ? `${summary} Failed: ${failures.map((f) => `#${f.position} ${f.angle}`).join(', ')}.` : summary);
    if (created.length) toast.success('Image variants ready — choose one to use it.');
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

  const option = (key: string, url: string | null, label: string, active: boolean, onUse: () => void, testId: string) => (
    <div key={key} className={cn('space-y-2 rounded-lg border p-2', active ? 'border-primary ring-1 ring-primary' : 'border-border/60')} data-testid={testId}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="aspect-[4/5] w-full rounded-md object-cover" loading="lazy" />
      ) : (
        <div className="flex aspect-[4/5] w-full items-center justify-center rounded-md bg-muted text-center text-xs text-muted-foreground">Text only (no image)</div>
      )}
      <p className="text-xs font-medium">{label}</p>
      {active ? (
        <p className="flex items-center gap-1 text-xs text-primary">
          <Check className="h-3.5 w-3.5" /> Used for the post
        </p>
      ) : (
        <Button type="button" size="sm" variant="outline" className="w-full" disabled={locked || busy !== null} onClick={onUse}>
          {busy === key ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Use this image
        </Button>
      )}
    </div>
  );

  return (
    <section aria-labelledby="facebook-image-title" className="space-y-3" data-testid="facebook-image-variants">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="facebook-image-title" className="text-sm font-semibold">
          Post image
        </h3>
        <Button type="button" size="sm" variant="outline" disabled={locked || busy !== null} onClick={() => setConfirmOpen(true)}>
          {busy === 'generate' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}
          Generate image variants
        </Button>
      </div>
      {locked && <p className="text-xs text-muted-foreground">{IMAGE_LOCKED_MESSAGE}</p>}
      {error && <Alert variant="danger">{error}</Alert>}
      {result && (
        <Alert variant="info" role="status" data-testid="facebook-image-variants-result">
          {result}
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {option('wordpress', wordpress.url, 'WordPress image (default)', selectedId === null, () => choose(null), 'facebook-image-option-wordpress')}
        {variants.map((variant) =>
          option(
            variant.id,
            variant.image_url,
            FACEBOOK_VARIANT_ANGLES.find((angle) => angle.id === variant.angle)?.label ?? 'Variant',
            selectedId === variant.id,
            () => choose(variant.id),
            'facebook-image-option-variant'
          )
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate image variants</DialogTitle>
            <DialogDescription>
              New vertical (4:5) images for this post, from its title and text. Generating does not change the post image and publishes
              nothing — you choose afterwards.
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
    </section>
  );
}
