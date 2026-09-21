'use client';

import Image from 'next/image';
import { LayoutDashboard, LayoutTemplate, Repeat2, Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PinDiagnosticBadges } from './pin-diagnostic-badges';
import { diagnoseCreativeBatch } from '@/lib/pinterest/creative-diagnostics';
import type { Pin } from '@/types/database';

interface PinBatchReviewDialogProps {
  pins: Pin[];
  onClose: () => void;
  onChangeLayout: (pin: Pin) => void;
}

export function PinBatchReviewDialog({ pins, onClose, onChangeLayout }: PinBatchReviewDialogProps) {
  const legacyPins = pins.filter((pin) =>
    pin.visual_format === 'photo' || pin.visual_format === 'text-overlay'
  );
  const diagnostics = diagnoseCreativeBatch(legacyPins);
  const summaries = [
    { label: 'Templates', value: diagnostics.templateCount, icon: Shapes },
    { label: 'Layout combinations', value: diagnostics.combinationCount, icon: LayoutDashboard },
    { label: 'Angle coverage', value: `${diagnostics.coveredAngles.length}/5`, icon: LayoutTemplate },
    { label: 'Repetitions', value: diagnostics.repetitionsDetected, icon: Repeat2 },
  ];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12">
          <DialogTitle>Batch Review</DialogTitle>
          <DialogDescription>
            Review Pins and, for Legacy Composite layouts, open weak Pins without regenerating their source image.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-5 pb-5">
          {legacyPins.length > 0 && <div className="grid grid-cols-2 gap-2 py-4 lg:grid-cols-4" aria-label="Legacy Composite layout diagnostics">
            {summaries.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-[11px] font-medium">{label}</span>
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>}

          {legacyPins.length !== pins.length && (
            <p className="mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              AI Integrated and Photo Only Pins do not use legacy templates or the SVG/Sharp Quality Gate. Review their images visually.
            </p>
          )}

          {legacyPins.length > 0 && diagnostics.missingAngles.length > 0 && (
            <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Missing angles: {diagnostics.missingAngles.join(', ')}
            </p>
          )}

          <div className="space-y-2" data-testid="batch-review-list">
            {pins.map((pin) => {
              const canChangeLayout = pin.visual_format === 'text-overlay' && Boolean(pin.overlay_text);
              return (
                <article
                  key={pin.id}
                  className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-xl border p-3 sm:grid-cols-[64px_minmax(0,1fr)_auto]"
                  data-testid="batch-review-pin"
                >
                  <div className="relative aspect-2/3 w-14 overflow-hidden rounded-md bg-muted sm:w-16">
                    {pin.media_url ? (
                      <Image src={pin.media_url} alt="" fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="h-full w-full bg-muted" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium" title={pin.title}>{pin.title}</h3>
                    <div className="mt-2">
                      <PinDiagnosticBadges pin={pin} showWarnings />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="col-span-2 min-h-11 sm:col-span-1"
                    disabled={!canChangeLayout}
                    onClick={() => onChangeLayout(pin)}
                    aria-label={`Change layout for: ${pin.title}`}
                  >
                    <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
                    Change layout
                  </Button>
                </article>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
