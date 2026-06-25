import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import type { Pin } from '@/types/database';

interface PinTableProps {
  pins: Pin[];
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

export function PinTable({ pins }: PinTableProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pins.map((pin, i) => (
        <div
          key={pin.id}
          className="group rounded-xl border border-border/60 bg-card overflow-hidden transition-all hover:border-border hover:shadow-sm"
        >
          {/* Image area */}
          {pin.media_url ? (
            <a href={pin.media_url} target="_blank" rel="noopener noreferrer" className="block">
              <div className="relative aspect-2/3 max-h-56 w-full overflow-hidden bg-muted">
                <Image
                  src={pin.media_url}
                  alt={pin.title}
                  fill
                  className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  unoptimized
                />
              </div>
            </a>
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
      ))}
    </div>
  );
}
