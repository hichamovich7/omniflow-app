'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { parseOptionalNonNegativeInt } from '@/components/projects/content-stream-form-dialog';
import {
  activityCellLabel,
  activityDialogMode,
  formatActivityDate,
  markTargetMetCount,
  type ActivityDialogMode,
} from '@/lib/dashboard/publishing-activity';
import { MAX_PUBLISHING_ACTIVITY_NOTE } from '@/lib/validations/content-streams';
import { cn } from '@/lib/utils';
import type { PublishingActivitySource, PublishingActivityStatus } from '@/types/content-streams';

const SOURCE_LABELS: Record<PublishingActivitySource, string> = {
  external: 'Another publishing tool',
  manual: 'Published by hand',
};

const MODE_COPY: Record<ActivityDialogMode, { title: string; description: string; countLabel: string }> = {
  published: {
    title: 'Publishing activity',
    description:
      "Pins published outside OmniFlow. Counted toward today's target only — your planned Pins and publish dates are not changed.",
    countLabel: 'Pins published today',
  },
  expected: {
    title: 'Expected publishing',
    description:
      'Pins scheduled in another tool for this day. Shown as expected, never as published — it only improves the coverage forecast. Confirm it once the day has come.',
    countLabel: 'Pins expected',
  },
  confirm: {
    title: 'Confirm external publishing',
    description:
      'Pins were expected from another tool on this day. Confirm them once they went live, or keep them as expected. Your planned Pins and publish dates are not changed.',
    countLabel: 'Pins published today',
  },
};

export interface PublishingActivityCellProps {
  streamId: string;
  streamName: string;
  /** Local YYYY-MM-DD. */
  date: string;
  /** After today (server-local calendar): only an `expected` entry can be saved. */
  isFuture: boolean;
  targetPinsPerDay: number | null;
  /** Confirmed count saved for the day. */
  external: number;
  /** Expected (unconfirmed) count saved for the day. */
  expected: number;
  /** Status of the saved entry; null when the day has none. */
  status: PublishingActivityStatus | null;
  note: string | null;
  source: PublishingActivitySource | null;
  /** Cell description, also used as the button's accessible name. */
  description: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A coverage cell that opens the "Publishing activity" modal: records Pins
 * published outside OmniFlow for this stream and day, or — on a future day —
 * Pins expected from another tool. Saving never touches `pins` — only
 * content_stream_publishing_activity (migrations 035 and 038).
 */
export function PublishingActivityCell(props: PublishingActivityCellProps) {
  const [open, setOpen] = useState(false);
  // Remount on every open so the form always starts from the saved values.
  const [openCount, setOpenCount] = useState(0);

  return (
    <>
      <button
        type="button"
        title={props.description}
        aria-label={activityCellLabel(props.description, props.isFuture, props.status)}
        onClick={() => {
          setOpenCount((n) => n + 1);
          setOpen(true);
        }}
        className={cn(
          'relative block h-full w-full cursor-pointer rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          props.className
        )}
      >
        {props.children}
      </button>
      {open && <PublishingActivityDialog key={openCount} {...props} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function PublishingActivityDialog({
  streamId,
  streamName,
  date,
  isFuture,
  targetPinsPerDay,
  external,
  expected,
  status: savedStatus,
  note: savedNote,
  source: savedSource,
  open,
  onOpenChange,
}: PublishingActivityCellProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const mode = activityDialogMode(isFuture, savedStatus);
  const copy = MODE_COPY[mode];
  const savedCount = savedStatus === 'expected' ? expected : external;
  const [count, setCount] = useState(() => (savedCount > 0 ? String(savedCount) : ''));
  const [note, setNote] = useState(() => savedNote ?? '');
  const [source, setSource] = useState<PublishingActivitySource>(() => savedSource ?? 'external');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const targetCount = markTargetMetCount(targetPinsPerDay);

  function handleOpenChange(next: boolean) {
    if (!loading) onOpenChange(next);
  }

  async function send(url: string, init: RequestInit, success: string) {
    setLoading(true);
    const res = await fetch(url, init);
    const json = await res.json().catch(() => ({ error: { message: 'Something went wrong' } }));
    setLoading(false);

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Something went wrong';
      setError(message);
      toast.error(message);
      return;
    }

    toast.success(success);
    onOpenChange(false);
    router.refresh();
  }

  async function save(status: PublishingActivityStatus) {
    setError(null);

    const parsed = parseOptionalNonNegativeInt(count);
    if (!parsed.valid) {
      setError(`${copy.countLabel} must be a whole number, zero or greater`);
      return;
    }

    await send(
      `/api/content-streams/${streamId}/publishing-activity`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityDate: date, publishedCount: parsed.value ?? 0, note: note.trim() || null, source, status }),
      },
      status === 'expected' ? 'Expected publishing saved' : 'Publishing activity saved'
    );
  }

  async function handleDelete() {
    setError(null);
    await send(
      `/api/content-streams/${streamId}/publishing-activity?activityDate=${encodeURIComponent(date)}`,
      { method: 'DELETE' },
      'Publishing activity deleted'
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Enter submits the primary action of the mode.
    void save(mode === 'expected' ? 'expected' : 'published');
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" initialFocus={countRef}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Stream</dt>
              <dd className="min-w-0 truncate font-medium">{streamName}</dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatActivityDate(date)}</dd>
              {savedStatus && (
                <>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{savedStatus === 'expected' ? 'Expected externally — not confirmed' : 'Published externally'}</dd>
                </>
              )}
            </dl>

            <div className="space-y-1.5">
              <Label htmlFor="pa-count">{copy.countLabel}</Label>
              <div className="flex gap-2">
                <Input
                  ref={countRef}
                  id="pa-count"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000}
                  step={1}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={loading}
                  placeholder="0"
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => targetCount != null && setCount(String(targetCount))}
                  disabled={loading || targetCount == null}
                  title={targetCount == null ? 'Set a Pins/day target on this stream first' : `Fill in the stream target (${targetCount})`}
                >
                  Mark target met
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {targetCount != null ? `Stream target: ${targetCount} Pins/day.` : 'This stream has no Pins/day target.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-source">{mode === 'expected' ? 'Scheduled with' : 'Published with'}</Label>
              <Select value={source} onValueChange={(v) => v && setSource(v as PublishingActivitySource)}>
                <SelectTrigger id="pa-source" className="w-full" disabled={loading}>
                  <span className="text-sm">{SOURCE_LABELS[source]}</span>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOURCE_LABELS) as PublishingActivitySource[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {SOURCE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-note">Note</Label>
              <Textarea
                id="pa-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={MAX_PUBLISHING_ACTIVITY_NOTE}
                placeholder={mode === 'expected' ? 'Scheduled in another tool' : 'Created and published with another tool'}
                disabled={loading}
                className="min-h-20"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            {savedStatus && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading} className="sm:mr-auto">
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            {mode === 'confirm' && (
              <Button type="button" variant="outline" onClick={() => save('expected')} disabled={loading}>
                Keep as expected
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : mode === 'expected' ? 'Save as expected' : mode === 'confirm' ? 'Confirm as published' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
