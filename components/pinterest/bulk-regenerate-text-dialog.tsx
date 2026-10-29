'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  requestPinTextRegeneration,
  runBulkPinTextRegeneration,
  type BulkPinTextSummary,
} from '@/lib/pinterest/regenerate-text-client';
import type { Pin } from '@/types/database';

/**
 * "Regenerate text" for the selected Pins (TASK-082): after a confirmation,
 * the existing one-Pin route is called for each Pin in sequence. A success is
 * saved at once, a failure leaves its Pin unchanged and the batch goes on;
 * the summary can retry only the Pins that were not regenerated. Images,
 * links, boards, sections and dates are never touched.
 */

export const BULK_REGENERATE_TEXT_CONFIRMATION =
  'This will use one text AI generation per Pin. Images and links will not change. Continue?';

export function bulkRegenerateTextLabel(count: number): string {
  return count > 0 ? `Regenerate text for ${count} ${count === 1 ? 'Pin' : 'Pins'}` : 'Regenerate text';
}

type Phase =
  | { kind: 'confirm'; pinIds: string[] }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; summary: BulkPinTextSummary };

interface BulkRegenerateTextDialogProps {
  selectedPinIds: Set<string>;
  pins: Pick<Pin, 'id' | 'title'>[];
}

export function BulkRegenerateTextDialog({ selectedPinIds, pins }: BulkRegenerateTextDialogProps) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  // Grid order, not click order.
  const selected = pins.filter((pin) => selectedPinIds.has(pin.id)).map((pin) => pin.id);
  const count = selected.length;
  const running = phase?.kind === 'running';

  async function run(pinIds: string[], previous: BulkPinTextSummary | null) {
    if (inFlight.current || pinIds.length === 0) return;
    inFlight.current = true;
    setPhase({ kind: 'running', done: 0, total: pinIds.length });
    try {
      const summary = await runBulkPinTextRegeneration(
        pinIds,
        (pinId) => requestPinTextRegeneration(pinId),
        (done, total) => setPhase({ kind: 'running', done, total })
      );
      // A retry keeps the Pins regenerated before it.
      setPhase({
        kind: 'done',
        summary: previous ? { ...summary, succeeded: [...previous.succeeded, ...summary.succeeded] } : summary,
      });
      if (summary.succeeded.length > 0) router.refresh();
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPhase({ kind: 'confirm', pinIds: selected })}
        disabled={count === 0 || running}
        data-testid="bulk-regenerate-text-button"
      >
        <Type className="mr-1.5 h-3.5 w-3.5" />
        {bulkRegenerateTextLabel(count)}
      </Button>
      <Dialog open={phase !== null} onOpenChange={(open) => !open && !running && setPhase(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{phase?.kind === 'done' ? 'Text regeneration finished' : bulkRegenerateTextLabel(phase?.kind === 'confirm' ? phase.pinIds.length : count)}</DialogTitle>
            {phase?.kind === 'confirm' && <DialogDescription>{BULK_REGENERATE_TEXT_CONFIRMATION}</DialogDescription>}
          </DialogHeader>

          {phase?.kind === 'running' && (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm">
                Regenerating text… {Math.min(phase.done + 1, phase.total)} of {phase.total}
              </p>
              <Progress value={phase.done} max={phase.total} aria-label="Text regeneration progress" />
              <p className="text-xs text-muted-foreground">Pins are processed one at a time. Keep this window open.</p>
            </div>
          )}

          {phase?.kind === 'done' && <BulkRegenerateTextSummaryView summary={phase.summary} pins={pins} />}

          <DialogFooter className="flex-row gap-2">
            {phase?.kind === 'confirm' && (
              <>
                <Button variant="outline" onClick={() => setPhase(null)}>
                  Cancel
                </Button>
                <Button onClick={() => void run(phase.pinIds, null)} data-testid="bulk-regenerate-text-confirm">
                  Continue
                </Button>
              </>
            )}
            {phase?.kind === 'done' && (
              <>
                {phase.summary.failed.length + phase.summary.notProcessed.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => void run([...phase.summary.failed, ...phase.summary.notProcessed], phase.summary)}
                    data-testid="bulk-regenerate-text-retry"
                  >
                    Try again for {phase.summary.failed.length + phase.summary.notProcessed.length} not regenerated
                  </Button>
                )}
                <Button onClick={() => setPhase(null)}>Close</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Final summary: regenerated, failed (unchanged), not processed (unchanged). */
export function BulkRegenerateTextSummaryView({
  summary,
  pins,
}: {
  summary: BulkPinTextSummary;
  pins: Pick<Pin, 'id' | 'title'>[];
}) {
  const titleOf = (id: string) => pins.find((pin) => pin.id === id)?.title ?? 'Pin';
  const failures = summary.outcomes.filter((outcome) => outcome.status === 'failed');

  return (
    <div className="space-y-3 text-sm" data-testid="bulk-regenerate-text-summary">
      <ul className="space-y-1">
        <li>
          <span className="font-medium">Regenerated:</span> {summary.succeeded.length}
        </li>
        <li>
          <span className="font-medium">Failed:</span> {summary.failed.length}
        </li>
        <li>
          <span className="font-medium">Not modified:</span> {summary.failed.length + summary.notProcessed.length}
        </li>
      </ul>
      {failures.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
          {failures.map((outcome) => (
            <li key={outcome.pinId}>
              <span className="font-medium text-foreground">{titleOf(outcome.pinId)}</span> — {outcome.error?.message}
            </li>
          ))}
        </ul>
      )}
      {summary.stoppedBy && (
        <p className="text-xs text-destructive">
          Stopped: {summary.stoppedBy.message} {summary.notProcessed.length} remaining{' '}
          {summary.notProcessed.length === 1 ? 'Pin was' : 'Pins were'} not processed.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Images, links, boards, sections and dates were not changed. Pins that failed keep their previous text.
      </p>
    </div>
  );
}
