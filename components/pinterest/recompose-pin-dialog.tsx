'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LayoutTemplate, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ManualPositionChoice,
  ManualTemplateChoice,
} from '@/lib/pinterest/manual-recomposition';
import type { Pin } from '@/types/database';

const TEMPLATE_OPTIONS: Array<{ value: ManualTemplateChoice; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'split', label: 'Split' },
  { value: 'magazine', label: 'Magazine' },
];

const POSITION_OPTIONS: Array<{ value: ManualPositionChoice; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

interface RecomposePinDialogProps {
  pin: Pin;
  onClose: () => void;
}

export function RecomposePinDialog({ pin, onClose }: RecomposePinDialogProps) {
  const router = useRouter();
  const [template, setTemplate] = useState<ManualTemplateChoice>('auto');
  const [position, setPosition] = useState<ManualPositionChoice>('auto');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    setIsApplying(true);
    setError(null);

    try {
      const response = await fetch('/api/pinterest/pin-images/recompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinId: pin.id, template, position }),
      });
      const json = await response.json();

      if (!response.ok || json.error) {
        setError(json.error?.message ?? 'Recomposition failed');
        return;
      }

      toast.success(
        `Layout updated · ${json.data.template} · ${json.data.qualityStatus}`
      );
      router.refresh();
      onClose();
    } catch {
      setError('Recomposition failed. Please try again.');
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isApplying) onClose(); }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            Recompose Pin
          </DialogTitle>
          <DialogDescription>
            Change the layout while keeping the original AI photo and image history.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
          <div className="overflow-hidden rounded-xl border bg-muted/40">
            {pin.media_url ? (
              <div className="relative mx-auto aspect-2/3 max-h-[58vh] w-full">
                <Image
                  src={pin.media_url}
                  alt={`Current preview for ${pin.title}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain"
                  priority
                />
              </div>
            ) : (
              <div className="flex aspect-2/3 items-center justify-center text-sm text-muted-foreground">
                Preview unavailable
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="recompose-template">
                Template
              </label>
              <Select
                value={template}
                onValueChange={(value) => setTemplate(value as ManualTemplateChoice)}
                disabled={isApplying}
              >
                <SelectTrigger id="recompose-template" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Auto balances angle compatibility, text fit and local contrast.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="recompose-position">
                Position
              </label>
              <Select
                value={position}
                onValueChange={(value) => setPosition(value as ManualPositionChoice)}
                disabled={isApplying}
              >
                <SelectTrigger id="recompose-position" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your preference can be adjusted only when the selected zone is unsafe.
              </p>
            </div>

            <div className="flex gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Only PASS or WARN results are saved as a new version.</span>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={onClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button type="button" className="h-11" onClick={handleApply} disabled={isApplying || !pin.media_url}>
            {isApplying ? <Loader2 className="animate-spin" /> : <LayoutTemplate />}
            {isApplying ? 'Applying…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
