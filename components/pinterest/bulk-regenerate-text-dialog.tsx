'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
  planCompleteRegeneration,
  requestPinTextRegeneration,
  runBulkPinTextRegeneration,
  type BulkPinTextSummary,
  type PinRegenerationMode,
} from '@/lib/pinterest/regenerate-text-client';
import type { Pin } from '@/types/database';

/**
 * Regeneration of the selected Pins (TASK-082, TASK-099). The dialog offers
 * two explicit modes before any call:
 * - "Regenerate text + image prompts": one text AI generation per Pin (title,
 *   description, keywords and a new image prompt); no image is generated, the
 *   current images are kept.
 * - "Regenerate complete Pins": the same, then one new image per Pin; the
 *   exact number of paid images is shown first. Step-by-step Pins (one image
 *   per panel) are excluded.
 * Each Pin goes through the one-Pin route in sequence; a success is saved at
 * once, a failure leaves its Pin unchanged and the batch goes on. Links, UTM,
 * boards, sections, dates and status are never touched.
 */

export const REGENERATION_MODE_LABELS: Record<PinRegenerationMode, string> = {
  'text-and-image-prompt': 'Regenerate text + image prompts',
  complete: 'Regenerate complete Pins',
};

export function textAndPromptsConfirmation(count: number): string {
  return `One text AI generation per Pin (${count}): new titles, descriptions, keywords and image prompts. No image is generated — the current images are kept.`;
}

export function completeRegenerationConfirmation(paidImages: number, pinCount: number): string {
  return `This will generate exactly ${paidImages} paid image${paidImages === 1 ? '' : 's'} for ${pinCount} ${pinCount === 1 ? 'Pin' : 'Pins'}, after one text AI generation per Pin. A Pin whose image fails keeps its previous text and image.`;
}

export function bulkRegenerateTextLabel(count: number): string {
  return count > 0 ? `Regenerate ${count} ${count === 1 ? 'Pin' : 'Pins'}` : 'Regenerate Pins';
}

type Phase =
  | { kind: 'confirm'; pinIds: string[]; mode: PinRegenerationMode }
  | { kind: 'running'; done: number; total: number; mode: PinRegenerationMode }
  | { kind: 'done'; summary: BulkPinTextSummary; mode: PinRegenerationMode };

type DialogPin = Pick<Pin, 'id' | 'title' | 'image_analysis'>;

interface BulkRegenerateTextDialogProps {
  selectedPinIds: Set<string>;
  pins: DialogPin[];
}

export function BulkRegenerateTextDialog({ selectedPinIds, pins }: BulkRegenerateTextDialogProps) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  // Grid order, not click order.
  const selected = pins.filter((pin) => selectedPinIds.has(pin.id)).map((pin) => pin.id);
  const count = selected.length;
  const running = phase?.kind === 'running';

  async function run(pinIds: string[], mode: PinRegenerationMode, previous: BulkPinTextSummary | null) {
    if (inFlight.current || pinIds.length === 0) return;
    inFlight.current = true;
    setPhase({ kind: 'running', done: 0, total: pinIds.length, mode });
    try {
      const summary = await runBulkPinTextRegeneration(
        pinIds,
        (pinId) => requestPinTextRegeneration(pinId, fetch, mode),
        (done, total) => setPhase({ kind: 'running', done, total, mode })
      );
      // A retry keeps the Pins regenerated before it.
      setPhase({
        kind: 'done',
        mode,
        summary: previous ? { ...summary, succeeded: [...previous.succeeded, ...summary.succeeded] } : summary,
      });
      if (summary.succeeded.length > 0) router.refresh();
    } finally {
      inFlight.current = false;
    }
  }

  const confirmPins = phase?.kind === 'confirm' ? pins.filter((pin) => phase.pinIds.includes(pin.id)) : [];
  const completePlan = planCompleteRegeneration(confirmPins);
  const runIds =
    phase?.kind === 'confirm'
      ? phase.mode === 'complete'
        ? completePlan.eligible.map((pin) => pin.id)
        : phase.pinIds
      : [];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPhase({ kind: 'confirm', pinIds: selected, mode: 'text-and-image-prompt' })}
        disabled={count === 0 || running}
        data-testid="bulk-regenerate-text-button"
      >
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        {bulkRegenerateTextLabel(count)}
      </Button>
      <Dialog open={phase !== null} onOpenChange={(open) => !open && !running && setPhase(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {phase?.kind === 'done'
                ? 'Regeneration finished'
                : bulkRegenerateTextLabel(phase?.kind === 'confirm' ? phase.pinIds.length : count)}
            </DialogTitle>
            {phase?.kind === 'confirm' && (
              <DialogDescription>Choose what to regenerate. Links, UTM, boards, sections and dates never change.</DialogDescription>
            )}
          </DialogHeader>

          {phase?.kind === 'confirm' && (
            <div className="space-y-2" role="radiogroup" aria-label="Regeneration mode">
              {(['text-and-image-prompt', 'complete'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={phase.mode === mode}
                  onClick={() => setPhase({ ...phase, mode })}
                  data-testid={`regeneration-mode-${mode}`}
                  className={cn(
                    'w-full rounded-md border p-3 text-left text-sm transition-colors',
                    phase.mode === mode ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  )}
                >
                  <span className="font-medium">{REGENERATION_MODE_LABELS[mode]}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {mode === 'complete'
                      ? 'New texts and image prompts, then one new image per Pin (paid).'
                      : 'New titles, descriptions, keywords and image prompts. No image is generated.'}
                  </span>
                </button>
              ))}
              <p className="text-xs text-muted-foreground" data-testid="bulk-regenerate-confirmation" aria-live="polite">
                {phase.mode === 'complete'
                  ? completeRegenerationConfirmation(completePlan.paidImages, completePlan.eligible.length)
                  : textAndPromptsConfirmation(phase.pinIds.length)}
              </p>
              {phase.mode === 'complete' && completePlan.excluded.length > 0 && (
                <p className="text-xs text-destructive" data-testid="bulk-regenerate-excluded">
                  {completePlan.excluded.length} Step-by-step {completePlan.excluded.length === 1 ? 'Pin is' : 'Pins are'} excluded
                  (several images each): {completePlan.excluded.map((pin) => pin.title).join(', ')}. Use “Regenerate text + image prompts” for{' '}
                  {completePlan.excluded.length === 1 ? 'it' : 'them'}.
                </p>
              )}
            </div>
          )}

          {phase?.kind === 'running' && (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm">
                {phase.mode === 'complete' ? 'Regenerating Pins…' : 'Regenerating text and image prompts…'}{' '}
                {Math.min(phase.done + 1, phase.total)} of {phase.total}
              </p>
              <Progress value={phase.done} max={phase.total} aria-label="Regeneration progress" />
              <p className="text-xs text-muted-foreground">Pins are processed one at a time. Keep this window open.</p>
            </div>
          )}

          {phase?.kind === 'done' && <BulkRegenerateTextSummaryView summary={phase.summary} pins={pins} mode={phase.mode} />}

          <DialogFooter className="flex-row gap-2">
            {phase?.kind === 'confirm' && (
              <>
                <Button variant="outline" onClick={() => setPhase(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void run(runIds, phase.mode, null)}
                  disabled={runIds.length === 0}
                  data-testid="bulk-regenerate-text-confirm"
                >
                  {phase.mode === 'complete'
                    ? `Generate ${completePlan.paidImages} paid image${completePlan.paidImages === 1 ? '' : 's'}`
                    : 'Continue'}
                </Button>
              </>
            )}
            {phase?.kind === 'done' && (
              <>
                {phase.summary.failed.length + phase.summary.notProcessed.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      phase.mode === 'complete'
                        ? // A paid retry is confirmed again with its own count.
                          setPhase({ kind: 'confirm', pinIds: [...phase.summary.failed, ...phase.summary.notProcessed], mode: 'complete' })
                        : void run([...phase.summary.failed, ...phase.summary.notProcessed], phase.mode, phase.summary)
                    }
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
  mode = 'text-and-image-prompt',
}: {
  summary: BulkPinTextSummary;
  pins: Pick<Pin, 'id' | 'title'>[];
  mode?: PinRegenerationMode;
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
        {mode === 'complete'
          ? 'Links, UTM, boards, sections and dates were not changed. Pins that failed keep their previous text, image prompt and image.'
          : 'Images, links, boards, sections and dates were not changed. Pins that failed keep their previous text and image prompt.'}
      </p>
    </div>
  );
}
