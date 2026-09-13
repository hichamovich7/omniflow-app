'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle2, CircleX, LayoutTemplate, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
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
import {
  buildRecompositionPreviewKey,
  canApplyRecomposition,
  getRecompositionIssueLabel,
  getRecompositionQualityLabel,
  type RecompositionPreviewIssueCode,
} from '@/lib/pinterest/recomposition-preview';
import type { PinQualityStatus } from '@/lib/pinterest/quality-gate';
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

interface PreviewState {
  key: string;
  url: string | null;
  status: PinQualityStatus;
  issues: RecompositionPreviewIssueCode[];
  template: string;
  position: string;
}

const QUALITY_STYLES: Record<PinQualityStatus, string> = {
  PASS: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  WARN: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  RECOMPOSE: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  FAIL: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export function RecomposePinDialog({ pin, onClose }: RecomposePinDialogProps) {
  const router = useRouter();
  const [template, setTemplate] = useState<ManualTemplateChoice>('auto');
  const [position, setPosition] = useState<ManualPositionChoice>('auto');
  const [isApplying, setIsApplying] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewKey = buildRecompositionPreviewKey(pin.id, template, position);
  const previewIsCurrent = preview?.key === previewKey;
  const previewPending = !previewError && (!previewIsCurrent || isPreviewing);
  const applyAllowed =
    previewIsCurrent && Boolean(preview?.url) && canApplyRecomposition(preview?.status ?? null);

  useEffect(() => {
    const controller = new AbortController();
    const requestedKey = buildRecompositionPreviewKey(pin.id, template, position);

    const timer = window.setTimeout(async () => {
      setIsPreviewing(true);
      setPreviewError(null);
      setError(null);
      try {
        const response = await fetch('/api/pinterest/pin-images/recompose/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinId: pin.id, template, position }),
          signal: controller.signal,
        });
        const contentType = response.headers.get('content-type') ?? '';

        if (!response.ok) {
          const json = contentType.includes('application/json') ? await response.json() : null;
          throw new Error(json?.error?.message ?? 'Preview could not be rendered');
        }

        if (contentType.startsWith('image/png')) {
          const status = response.headers.get('x-pin-quality-status') as PinQualityStatus | null;
          if (!status) throw new Error('Preview did not return a Quality Gate status');
          const issues = (response.headers.get('x-pin-quality-issues') ?? '')
            .split(',')
            .filter(Boolean) as RecompositionPreviewIssueCode[];
          const blobUrl = URL.createObjectURL(await response.blob());
          if (controller.signal.aborted) {
            URL.revokeObjectURL(blobUrl);
            return;
          }
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = blobUrl;
          setPreview({
            key: requestedKey,
            url: blobUrl,
            status,
            issues,
            template: response.headers.get('x-pin-template') ?? template,
            position: response.headers.get('x-pin-position') ?? position,
          });
        } else {
          const json = await response.json();
          if (controller.signal.aborted) return;
          if (!json.data) throw new Error(json.error?.message ?? 'Preview could not be rendered');
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
          setPreview({
            key: requestedKey,
            url: null,
            status: json.data.qualityStatus,
            issues: json.data.issues,
            template: json.data.template,
            position: json.data.position,
          });
        }
      } catch (previewRequestError) {
        if (controller.signal.aborted) return;
        setPreview(null);
        setPreviewError(
          previewRequestError instanceof Error
            ? previewRequestError.message
            : 'Preview could not be rendered'
        );
      } finally {
        if (!controller.signal.aborted) setIsPreviewing(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pin.id, position, template]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

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
          <div className="relative overflow-hidden rounded-xl border bg-muted/40" data-testid="recomposition-preview">
            {preview?.url || pin.media_url ? (
              <div className="relative mx-auto aspect-2/3 max-h-[58vh] w-full">
                <Image
                  src={preview?.url ?? pin.media_url!}
                  alt={`Recomposition preview for ${pin.title}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className={`object-contain transition-opacity duration-200 ${previewPending ? 'opacity-55' : 'opacity-100'}`}
                  unoptimized={Boolean(preview?.url?.startsWith('blob:'))}
                  priority
                />
              </div>
            ) : (
              <div className="flex aspect-2/3 items-center justify-center text-sm text-muted-foreground">
                Preview unavailable
              </div>
            )}
            {previewPending && (
              <div role="status" className="absolute inset-0 flex items-center justify-center bg-background/25 backdrop-blur-[1px]">
                <span className="flex items-center gap-2 rounded-full border bg-card/95 px-3 py-2 text-xs font-medium shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Updating preview…
                </span>
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
                onValueChange={(value) => {
                  setPreviewError(null);
                  setError(null);
                  setTemplate(value as ManualTemplateChoice);
                }}
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
                onValueChange={(value) => {
                  setPreviewError(null);
                  setError(null);
                  setPosition(value as ManualPositionChoice);
                }}
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

            <div aria-live="polite" className="space-y-2">
              {previewIsCurrent && preview ? (
                <div className={`rounded-lg border p-3 ${QUALITY_STYLES[preview.status]}`} data-testid="recomposition-quality-status">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {preview.status === 'PASS' && <CheckCircle2 className="h-4 w-4" />}
                    {(preview.status === 'WARN' || preview.status === 'RECOMPOSE') && <TriangleAlert className="h-4 w-4" />}
                    {preview.status === 'FAIL' && <CircleX className="h-4 w-4" />}
                    {getRecompositionQualityLabel(preview.status)}
                  </div>
                  <p className="mt-1 text-xs opacity-80">
                    {preview.template} · {preview.position}
                  </p>
                  {preview.issues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed">
                      {preview.issues.slice(0, 3).map((issue) => (
                        <li key={issue}>• {getRecompositionIssueLabel(issue)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="flex gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                  {previewPending ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  <span>{previewPending ? 'Checking layout quality…' : 'Choose a layout to calculate its quality.'}</span>
                </div>
              )}

              {previewError && (
                <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                  {previewError}
                </p>
              )}
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
          <Button type="button" className="h-11" onClick={handleApply} disabled={isApplying || previewPending || !applyAllowed} data-testid="recomposition-apply">
            {isApplying ? <Loader2 className="animate-spin" /> : <LayoutTemplate />}
            {isApplying ? 'Applying…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
