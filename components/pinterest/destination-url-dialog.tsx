'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DESTINATION_URL_MAX_LENGTH, validateDestinationUrl } from '@/lib/pinterest/destination-url';
import type { Pin } from '@/types/database';

/**
 * Destination URL of saved Pins (TASK-071). Both editors call the existing
 * PATCH /api/pinterest/pins/[id] with `{ linkUrl }`: only pins.link_url is
 * written — no AI call, no regeneration, text and image untouched.
 */

const UTM_HELP =
  'Enter the clean page URL. UTM tracking is added only to the CSV export, never saved on the Pin.';

async function savePinLinkUrl(pinId: string, linkUrl: string | null): Promise<Pin> {
  const res = await fetch(`/api/pinterest/pins/${pinId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkUrl }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) {
    throw new Error(json?.error?.message ?? 'Failed to save the destination URL.');
  }
  return json.data as Pin;
}

/** Selection bar: one URL applied to every selected Pin. */
export function DestinationUrlDialog({ selectedPinIds }: { selectedPinIds: Set<string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const count = selectedPinIds.size;

  async function handleApply() {
    const check = validateDestinationUrl(value);
    if (!check.ok || !check.value) {
      setError(check.ok ? 'Enter a destination URL.' : check.message);
      return;
    }
    setError(null);
    setSaving(true);
    const ids = Array.from(selectedPinIds);
    const results = await Promise.allSettled(ids.map((id) => savePinLinkUrl(id, check.value)));
    setSaving(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed === 0) {
      toast.success(`Destination URL added to ${ids.length} ${ids.length === 1 ? 'Pin' : 'Pins'}`);
      setOpen(false);
      setValue('');
    } else {
      toast.error(`${failed} of ${ids.length} Pins could not be updated. Try again.`);
    }
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={count === 0}>
        <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
        Add destination URL
      </Button>
      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add destination URL</DialogTitle>
            <DialogDescription>
              Applied to {count} selected {count === 1 ? 'Pin' : 'Pins'}. Any existing URL is replaced; titles,
              descriptions, keywords and images are not changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-destination-url">Destination URL</Label>
            <Input
              id="bulk-destination-url"
              type="url"
              inputMode="url"
              placeholder="https://example.com/article/"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              maxLength={DESTINATION_URL_MAX_LENGTH}
              disabled={saving}
              aria-invalid={!!error}
              aria-describedby="bulk-destination-url-help"
            />
            <p id="bulk-destination-url-help" className="text-xs text-muted-foreground">{UTM_HELP}</p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={saving}>
              {saving ? 'Saving...' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Pin detail: add, change or remove one Pin's destination URL, saved immediately. */
export function PinDestinationUrlEditor({ pin }: { pin: Pin }) {
  const router = useRouter();
  const [linkUrl, setLinkUrl] = useState<string | null>(pin.link_url);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(pin.link_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(next: string | null) {
    setSaving(true);
    try {
      const saved = await savePinLinkUrl(pin.id, next);
      setLinkUrl(saved.link_url);
      setValue(saved.link_url ?? '');
      setEditing(false);
      toast.success(saved.link_url ? 'Destination URL saved' : 'Destination URL removed');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save the destination URL.');
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    const check = validateDestinationUrl(value);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    void save(check.value);
  }

  return (
    <div className="space-y-1.5" data-testid="pin-destination-url">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Destination URL</span>
        {!editing && (
          <Button variant="outline" size="xs" onClick={() => setEditing(true)} disabled={saving}>
            <LinkIcon className="mr-1 h-3 w-3" />
            Edit destination URL
          </Button>
        )}
      </div>
      {!editing ? (
        linkUrl ? (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm text-primary hover:underline"
          >
            {linkUrl}
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">No destination URL — this Pin is exported without a link.</p>
        )
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`destination-url-${pin.id}`} className="sr-only">
            Destination URL
          </Label>
          <Input
            id={`destination-url-${pin.id}`}
            type="url"
            inputMode="url"
            placeholder="https://example.com/article/"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            maxLength={DESTINATION_URL_MAX_LENGTH}
            disabled={saving}
            aria-invalid={!!error}
          />
          <p className="text-xs text-muted-foreground">{UTM_HELP}</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="xs" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            {linkUrl && (
              <Button variant="outline" size="xs" onClick={() => void save(null)} disabled={saving}>
                Remove URL
              </Button>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setEditing(false);
                setValue(linkUrl ?? '');
                setError(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
