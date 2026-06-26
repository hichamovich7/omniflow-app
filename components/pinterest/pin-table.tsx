'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Sparkles, RefreshCw, Layers, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSelection } from '@/components/editorial/selection-provider';
import { ImageVersionsDialog } from './image-versions-dialog';
import type { Pin } from '@/types/database';

interface PinTableProps {
  pins: Pin[];
  generationId: string;
  imageVersionCounts: Record<string, number>;
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

export function PinTable({ pins, generationId, imageVersionCounts }: PinTableProps) {
  const { isSelected, toggle } = useSelection();
  const router = useRouter();
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [versionsPin, setVersionsPin] = useState<{ id: string; title: string } | null>(null);

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pins.map((pin, i) => {
          const selected = isSelected(pin.id);
          const versionCount = imageVersionCounts[pin.id] ?? 0;
          const isRegenerating = regeneratingId === pin.id;

          return (
            <div
              key={pin.id}
              className={`group relative rounded-xl border bg-card overflow-hidden transition-all hover:shadow-sm ${
                selected
                  ? 'border-primary/40 ring-1 ring-primary/20'
                  : 'border-border/60 hover:border-border'
              }`}
            >
              {/* Selection checkbox */}
              <label
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
              {pin.media_url ? (
                <div className="relative">
                  <a href={pin.media_url} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="relative aspect-2/3 max-h-56 w-full overflow-hidden bg-muted">
                      <Image
                        src={pin.media_url}
                        alt={pin.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    </div>
                  </a>

                  {/* Image action overlay */}
                  <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRegenerate(pin.id)}
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
                        onClick={() => setVersionsPin({ id: pin.id, title: pin.title })}
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
                <div className="flex aspect-2/3 max-h-36 w-full items-center justify-center bg-muted/50">
                  <div className="text-center">
                    <Sparkles className="mx-auto h-5 w-5 text-muted-foreground/30" />
                    <p className="mt-1.5 text-[10px] text-muted-foreground/40">AI Generated</p>
                  </div>
                </div>
              )}

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

                <div className="flex items-center justify-between pt-0.5">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {pin.board}
                  </span>
                  {pin.publish_date && (
                    <span className="text-[11px] text-muted-foreground/70">
                      {formatDate(pin.publish_date)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {versionsPin && (
        <ImageVersionsDialog
          pinId={versionsPin.id}
          pinTitle={versionsPin.title}
          onClose={() => setVersionsPin(null)}
        />
      )}
    </>
  );
}
