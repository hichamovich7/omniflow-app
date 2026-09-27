'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Copy, ExternalLink, ImageIcon, Images, LinkIcon, Pencil, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { readPinterestStrategyAngle } from '@/lib/pinterest/strategy';
import { ANGLE_LABELS, NO_LINK_NOTICE, pinAsText } from '@/lib/social/pin-display';
import type { Pin } from '@/types/database';

interface ArticlePinResultsProps {
  pins: Pin[];
  generationId: string;
  articleId: string;
  /** Real board name per Pin id (null = AI-suggested name only, no board). */
  boardNames: Record<string, string | null>;
  imagesProcessing: boolean;
}

async function readJson(res: Response): Promise<{ data: unknown; error: { message: string } | null }> {
  try {
    return (await res.json()) as { data: unknown; error: { message: string } | null };
  } catch {
    return { data: null, error: null };
  }
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  } catch {
    toast.error(`Failed to copy ${label.toLowerCase()}`);
  }
}

/**
 * Pins generated from a WordPress article (TASK-044 phase 2), shown as cards.
 * They are regular saved Pins: every action goes through the Pinterest API
 * (edit, single-Pin regeneration, existing image generation). No action adds
 * a link; images are never generated without a click.
 */
export function ArticlePinResults({ pins, generationId, articleId, boardNames, imagesProcessing }: ArticlePinResultsProps) {
  const router = useRouter();
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [allImagesLoading, setAllImagesLoading] = useState(false);
  const pinsWithoutImages = pins.filter((pin) => !pin.media_url).length;

  async function generateAllImages() {
    setAllImagesLoading(true);
    try {
      const res = await fetch('/api/pinterest/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) {
        toast.error(json.error?.message ?? 'Image generation failed');
        return;
      }
      toast.success('Images generated');
      setConfirmAllOpen(false);
      router.refresh();
    } catch {
      toast.error('Image generation failed');
    } finally {
      setAllImagesLoading(false);
    }
  }

  return (
    <section aria-labelledby="article-pins-heading" className="mt-8 space-y-4" data-testid="article-pin-results">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="article-pins-heading" className="text-base font-semibold">
            {pins.length} {pins.length === 1 ? 'Pin' : 'Pins'} saved
          </h2>
          <p className="text-xs text-muted-foreground">
            Saved in your Pinterest generations. {NO_LINK_NOTICE}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAllOpen(true)}
            disabled={pinsWithoutImages === 0 || imagesProcessing}
          >
            <Images data-icon="inline-start" />
            Generate all images ({pinsWithoutImages})
          </Button>
          <Link
            href={`/pinterest/${generationId}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open in Pinterest workspace (CSV)
          </Link>
        </div>
      </div>

      <ol className="grid gap-4 lg:grid-cols-2">
        {pins.map((pin, index) => (
          <ArticlePinCard
            key={pin.id}
            pin={pin}
            index={index}
            generationId={generationId}
            articleId={articleId}
            boardName={boardNames[pin.id] ?? null}
            imagesProcessing={imagesProcessing}
          />
        ))}
      </ol>

      <Dialog open={confirmAllOpen} onOpenChange={(open) => !allImagesLoading && setConfirmAllOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate {pinsWithoutImages} images?</DialogTitle>
            <DialogDescription>
              This consumes AI image credits and Storage space: one image is generated and stored for each Pin
              without an image. The article&apos;s featured image is never changed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAllOpen(false)} disabled={allImagesLoading}>
              Cancel
            </Button>
            <Button onClick={generateAllImages} loading={allImagesLoading} disabled={allImagesLoading}>
              Generate {pinsWithoutImages} images
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ArticlePinCard({
  pin,
  index,
  generationId,
  articleId,
  boardName,
  imagesProcessing,
}: {
  pin: Pin;
  index: number;
  generationId: string;
  articleId: string;
  boardName: string | null;
  imagesProcessing: boolean;
}) {
  const router = useRouter();
  const angle = readPinterestStrategyAngle(pin.image_analysis);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(pin.title);
  const [description, setDescription] = useState(pin.description);
  const [keywords, setKeywords] = useState(pin.keywords);
  const [busy, setBusy] = useState<'save' | 'regenerate' | 'image' | null>(null);
  const board = boardName ?? pin.board;
  const boardLabel = `${board}${pin.board_section ? ` / ${pin.board_section}` : ''}`;
  const keywordList = pin.keywords.split(',').map((k) => k.trim()).filter(Boolean);

  function startEditing() {
    setTitle(pin.title);
    setDescription(pin.description);
    setKeywords(pin.keywords);
    setEditing(true);
  }

  async function save() {
    setBusy('save');
    try {
      const res = await fetch(`/api/pinterest/pins/${pin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, keywords }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) {
        toast.error(json.error?.message ?? 'Failed to save the Pin');
        return;
      }
      toast.success('Pin saved');
      setEditing(false);
      router.refresh();
    } catch {
      toast.error('Failed to save the Pin');
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy('regenerate');
    try {
      const res = await fetch(`/api/pinterest/pins/${pin.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordpressArticleId: articleId }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) {
        toast.error(json.error?.message ?? 'Pin regeneration failed');
        return;
      }
      toast.success(pin.media_url ? 'Pin regenerated — its image was kept, regenerate it if needed' : 'Pin regenerated');
      router.refresh();
    } catch {
      toast.error('Pin regeneration failed');
    } finally {
      setBusy(null);
    }
  }

  async function generateImage() {
    setBusy('image');
    try {
      const res = await fetch('/api/pinterest/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, pinIds: [pin.id] }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) {
        toast.error(json.error?.message ?? 'Image generation failed');
        return;
      }
      toast.success('Image generated');
      router.refresh();
    } catch {
      toast.error('Image generation failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" data-testid="article-pin-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {index + 1}
          </span>
          <Badge variant="outline">{angle ? ANGLE_LABELS[angle] : 'Angle unavailable'}</Badge>
        </div>
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Saved
        </Badge>
      </div>

      {pin.media_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin.media_url} alt={pin.title} className="h-48 w-32 rounded-lg border border-border/60 object-cover" />
      )}

      {editing ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`pin-${pin.id}-title`} className="text-xs text-muted-foreground">Title</Label>
            <Input id={`pin-${pin.id}-title`} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`pin-${pin.id}-description`} className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              id={`pin-${pin.id}-description`}
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`pin-${pin.id}-keywords`} className="text-xs text-muted-foreground">Keywords (comma separated)</Label>
            <Input id={`pin-${pin.id}-keywords`} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={busy === 'save'} disabled={busy !== null}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="font-medium leading-snug">{pin.title}</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{pin.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {keywordList.map((keyword) => (
              <Badge key={keyword} variant="secondary">
                {keyword}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Board:</span> {boardLabel}
            {!boardName && ' (suggested — no board created)'}
          </p>
          {pin.image_prompt && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">Image prompt</summary>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted p-2 font-mono">{pin.image_prompt}</p>
            </details>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LinkIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {NO_LINK_NOTICE}
          </p>
        </div>
      )}

      {!editing && (
        <div className="mt-auto flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
          <Button size="xs" variant="outline" onClick={() => copy(pin.title, 'Title')}>
            <Copy data-icon="inline-start" />
            Copy title
          </Button>
          <Button size="xs" variant="outline" onClick={() => copy(pin.description, 'Description')}>
            <Copy data-icon="inline-start" />
            Copy description
          </Button>
          <Button size="xs" variant="outline" onClick={() => copy(pin.keywords, 'Keywords')}>
            <Copy data-icon="inline-start" />
            Copy keywords
          </Button>
          <Button size="xs" variant="outline" onClick={() => copy(pinAsText({ ...pin, board: boardLabel }), 'Pin')}>
            <Copy data-icon="inline-start" />
            Copy full Pin
          </Button>
          <Button size="xs" variant="outline" onClick={startEditing} disabled={busy !== null}>
            <Pencil data-icon="inline-start" />
            Edit
          </Button>
          <Button size="xs" variant="outline" onClick={regenerate} loading={busy === 'regenerate'} disabled={busy !== null}>
            <RefreshCw data-icon="inline-start" />
            Regenerate this Pin
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={generateImage}
            loading={busy === 'image'}
            disabled={busy !== null || imagesProcessing}
          >
            <ImageIcon data-icon="inline-start" />
            {pin.media_url ? 'New image version' : 'Generate image'}
          </Button>
        </div>
      )}
    </li>
  );
}
