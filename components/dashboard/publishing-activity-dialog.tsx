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
import { formatActivityDate, markTargetMetCount } from '@/lib/dashboard/publishing-activity';
import { MAX_PUBLISHING_ACTIVITY_NOTE } from '@/lib/validations/content-streams';
import { cn } from '@/lib/utils';
import type { PublishingActivitySource } from '@/types/content-streams';

const SOURCE_LABELS: Record<PublishingActivitySource, string> = {
  external: 'Another publishing tool',
  manual: 'Published by hand',
};

interface PublishingActivityCellProps {
  streamId: string;
  streamName: string;
  /** Local YYYY-MM-DD — today or earlier only. */
  date: string;
  targetPinsPerDay: number | null;
  external: number;
  note: string | null;
  source: PublishingActivitySource | null;
  /** Cell description, also used as the button's accessible name. */
  description: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A coverage cell that opens the "Publishing activity" modal: records Pins
 * published outside OmniFlow for this stream and day. Saving never touches
 * `pins` — only content_stream_publishing_activity (migration 035).
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
        aria-label={`${props.description}. Record publishing activity`}
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
  targetPinsPerDay,
  external,
  note: savedNote,
  source: savedSource,
  open,
  onOpenChange,
}: PublishingActivityCellProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [count, setCount] = useState(() => (external > 0 ? String(external) : ''));
  const [note, setNote] = useState(() => savedNote ?? '');
  const [source, setSource] = useState<PublishingActivitySource>(() => savedSource ?? 'external');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const targetCount = markTargetMetCount(targetPinsPerDay);

  function handleOpenChange(next: boolean) {
    if (!loading) onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = parseOptionalNonNegativeInt(count);
    if (!parsed.valid) {
      setError('Pins published must be a whole number, zero or greater');
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/content-streams/${streamId}/publishing-activity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityDate: date, publishedCount: parsed.value ?? 0, note: note.trim() || null, source }),
    });
    const json = await res.json().catch(() => ({ error: { message: 'Something went wrong' } }));
    setLoading(false);

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Something went wrong';
      setError(message);
      toast.error(message);
      return;
    }

    toast.success('Publishing activity saved');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" initialFocus={countRef}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Publishing activity</DialogTitle>
            <DialogDescription>
              Pins published outside OmniFlow. Counted toward today&apos;s target only — your planned Pins and publish dates are not
              changed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Stream</dt>
              <dd className="min-w-0 truncate font-medium">{streamName}</dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatActivityDate(date)}</dd>
            </dl>

            <div className="space-y-1.5">
              <Label htmlFor="pa-count">Pins published today</Label>
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
              <Label htmlFor="pa-source">Published with</Label>
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
                placeholder="Created and published with another tool"
                disabled={loading}
                className="min-h-20"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
