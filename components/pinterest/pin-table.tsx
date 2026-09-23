'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Sparkles, RefreshCw, Layers, Loader2, FileText, LayoutTemplate, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useSelection } from '@/components/editorial/selection-provider';
import { ImageVersionsDialog } from './image-versions-dialog';
import { RecomposePinDialog } from './recompose-pin-dialog';
import { PinDetailDialog } from './pin-detail-dialog';
import { PinBatchReviewDialog } from './pin-batch-review-dialog';
import { PinDiagnosticBadges, formatCreativeLabel } from './pin-diagnostic-badges';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  filterPinsByCreativeDiagnostics,
  type CreativeDiagnosticFilters,
} from '@/lib/pinterest/creative-diagnostics';
import { BANNER_TEMPLATES, type BannerTemplate } from '@/lib/validations/pinterest';
import { PINTEREST_ANGLES, type PinterestAngle } from '@/types/pinterest';
import type { Pin } from '@/types/database';
import type { WordPressUsageArticle } from '@/lib/queries/wordpress-usage';

interface PinTableProps {
  pins: Pin[];
  generationId: string;
  imageVersionCounts: Record<string, number>;
  pinsWordPressUsage: Record<string, WordPressUsageArticle[]>;
  activeImageModels: Record<string, string | null>;
  boardNames: Record<string, string | null>;
}

function usageTooltip(articles: WordPressUsageArticle[]): string {
  if (articles.length === 1) return `Used in: ${articles[0].title}`;
  return `Used in ${articles.length} articles`;
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

export function PinTable({ pins, generationId, imageVersionCounts, pinsWordPressUsage, activeImageModels, boardNames }: PinTableProps) {
  const { isSelected, toggle } = useSelection();
  const router = useRouter();
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [versionsPin, setVersionsPin] = useState<{ id: string; title: string } | null>(null);
  const [recomposePin, setRecomposePin] = useState<Pin | null>(null);
  const [detailPin, setDetailPin] = useState<Pin | null>(null);
  const [batchReviewOpen, setBatchReviewOpen] = useState(false);
  const [filters, setFilters] = useState<CreativeDiagnosticFilters>({
    quality: 'ALL',
    angle: 'ALL',
    template: 'ALL',
  });
  const filteredPins = useMemo(
    () => filterPinsByCreativeDiagnostics(pins, filters),
    [pins, filters]
  );

  async function handleRegenerate(pinId: string) {
    setRegeneratingId(pinId);
    try {
      const res = await fetch('/api/pinterest/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, pinIds: [pinId] }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error?.message ?? 'Regeneration failed');
      } else {
        toast.success('New image version generated');
        router.refresh();
      }
    } catch {
      toast.error('Regeneration failed');
    } finally {
      setRegeneratingId(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2" aria-label="Creative diagnostic filters">
          <div className="space-y-1">
            <label htmlFor="quality-filter" className="block text-[11px] font-medium text-muted-foreground">Quality</label>
            <Select
              value={filters.quality}
              onValueChange={(value) => value && setFilters((current) => ({
                ...current,
                quality: value as CreativeDiagnosticFilters['quality'],
              }))}
            >
              <SelectTrigger id="quality-filter" className="h-9 min-w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="PASS">PASS</SelectItem>
                <SelectItem value="WARN">WARN</SelectItem>
                <SelectItem value="NEEDS_REVIEW">RECOMPOSE / FAIL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="angle-filter" className="block text-[11px] font-medium text-muted-foreground">Angle</label>
            <Select
              value={filters.angle}
              onValueChange={(value) => value && setFilters((current) => ({
                ...current,
                angle: value as PinterestAngle | 'ALL',
              }))}
            >
              <SelectTrigger id="angle-filter" className="h-9 min-w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All angles</SelectItem>
                {PINTEREST_ANGLES.map((angle) => (
                  <SelectItem key={angle} value={angle}>{formatCreativeLabel(angle)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="template-filter" className="block text-[11px] font-medium text-muted-foreground">Template</label>
            <Select
              value={filters.template}
              onValueChange={(value) => value && setFilters((current) => ({
                ...current,
                template: value as BannerTemplate | 'ALL',
              }))}
            >
              <SelectTrigger id="template-filter" className="h-9 min-w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All templates</SelectItem>
                {BANNER_TEMPLATES.map((template) => (
                  <SelectItem key={template} value={template}>{formatCreativeLabel(template)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="pb-2 text-xs text-muted-foreground" aria-live="polite">
            {filteredPins.length} of {pins.length}
          </span>
        </div>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setBatchReviewOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Batch Review
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPins.map((pin, i) => {
          const selected = isSelected(pin.id);
          const versionCount = imageVersionCounts[pin.id] ?? 0;
          const isRegenerating = regeneratingId === pin.id;
          const usage = pinsWordPressUsage[pin.id] ?? [];

          return (
            <div
              key={pin.id}
              data-testid="pin-card"
              role="button"
              tabIndex={0}
              onClick={() => setDetailPin(pin)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDetailPin(pin);
                }
              }}
              className={`group relative rounded-xl border bg-card overflow-hidden transition-all cursor-pointer hover:shadow-sm ${
                selected
                  ? 'border-primary/40 ring-1 ring-primary/20'
                  : 'border-border/60 hover:border-border'
              }`}
            >
              {/* Selection checkbox */}
              <label
                onClick={(e) => e.stopPropagation()}
                className={`absolute left-3 top-3 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-all ${
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/80 bg-card/90 opacity-0 group-hover:opacity-100'
                }`}
                aria-label={`Select pin: ${pin.title}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(pin.id)}
                  className="sr-only"
                />
                {selected && (
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </label>

              {/* Image area */}
              <div className="relative">
                {pin.media_url ? (
                  <div className="relative">
                    <a
                      href={pin.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="relative aspect-2/3 w-full overflow-hidden bg-muted" data-testid="pin-grid-preview">
                        <Image
                          src={pin.media_url}
                          alt={pin.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                          data-testid="pin-grid-preview-image"
                        />
                      </div>
                    </a>

                    {/* Image action overlay */}
                    <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      {pin.visual_format === 'text-overlay' && pin.overlay_text && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecomposePin(pin);
                          }}
                          className="flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/95 px-2 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-card"
                          aria-label={`Change layout for: ${pin.title}`}
                        >
                          <LayoutTemplate className="h-3.5 w-3.5" />
                          <span>Change layout</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRegenerate(pin.id);
                        }}
                        disabled={isRegenerating}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-card/90 border border-border/80 text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                        aria-label={`Regenerate image for: ${pin.title}`}
                      >
                        {isRegenerating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {versionCount > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setVersionsPin({ id: pin.id, title: pin.title });
                          }}
                          className="flex h-7 items-center gap-1 rounded-md bg-card/90 border border-border/80 px-1.5 text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                          aria-label={`View ${versionCount} image versions`}
                        >
                          <Layers className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-medium">{versionCount}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-2/3 w-full items-center justify-center bg-muted/50">
                    <div className="text-center">
                      <Sparkles className="mx-auto h-5 w-5 text-muted-foreground/30" />
                      <p className="mt-1.5 text-[10px] text-muted-foreground/40">AI Generated</p>
                    </div>
                  </div>
                )}

                {/* WordPress usage indicator */}
                {usage.length > 0 && (
                  <div
                    className="absolute bottom-2 left-2 z-10 flex h-6 items-center gap-1 rounded-md bg-card/90 border border-border/80 px-1.5 text-muted-foreground"
                    title={usageTooltip(usage)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {usage.length > 1 && (
                      <span className="text-[10px] font-medium">{usage.length}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[13px] font-medium leading-snug line-clamp-2">{pin.title}</h3>
                  <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                    {i + 1}
                  </span>
                </div>

                <p className="text-[12px] leading-relaxed text-muted-foreground line-clamp-3">
                  {pin.description}
                </p>

                <PinDiagnosticBadges pin={pin} />

                <div className="flex items-center justify-between pt-0.5">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {boardNames[pin.id] ?? 'No board assigned'}
                    {pin.board_section && ` / ${pin.board_section}`}
                  </span>
                  {pin.publish_date && (
                    <span className="text-[11px] text-muted-foreground/70">
                      {formatDate(pin.publish_date)}
                    </span>
                  )}
                </div>

                {activeImageModels[pin.id] && (
                  <p
                    className="truncate font-mono text-[10px] text-muted-foreground/50"
                    title={`Generated with: ${activeImageModels[pin.id]}`}
                  >
                    {activeImageModels[pin.id]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredPins.length === 0 && (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm font-medium">No Pins match these filters</p>
          <button
            type="button"
            className="mt-2 min-h-11 px-3 text-sm text-primary hover:underline"
            onClick={() => setFilters({ quality: 'ALL', angle: 'ALL', template: 'ALL' })}
          >
            Clear filters
          </button>
        </div>
      )}

      {versionsPin && (
        <ImageVersionsDialog
          pinId={versionsPin.id}
          pinTitle={versionsPin.title}
          onClose={() => setVersionsPin(null)}
        />
      )}

      {recomposePin && (
        <RecomposePinDialog
          pin={recomposePin}
          onClose={() => setRecomposePin(null)}
        />
      )}

      {batchReviewOpen && (
        <PinBatchReviewDialog
          pins={pins}
          onClose={() => setBatchReviewOpen(false)}
          onChangeLayout={(pin) => {
            setBatchReviewOpen(false);
            setRecomposePin(pin);
          }}
        />
      )}

      {detailPin && (
        <PinDetailDialog
          pin={detailPin}
          onClose={() => setDetailPin(null)}
          usage={pinsWordPressUsage[detailPin.id] ?? []}
          imageModel={activeImageModels[detailPin.id]}
        />
      )}
    </>
  );
}
