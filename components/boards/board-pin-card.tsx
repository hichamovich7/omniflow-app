'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { PinDetailDialog } from '@/components/pinterest/pin-detail-dialog';
import type { Pin } from '@/types/database';

interface BoardPinCardProps {
  pin: Pin;
}

export function BoardPinCard({ pin }: BoardPinCardProps) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowDetail(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowDetail(true);
          }
        }}
        className="rounded-xl border border-border/60 bg-card overflow-hidden cursor-pointer transition-all hover:shadow-sm hover:border-border"
      >
        {pin.media_url ? (
          <div className="relative aspect-2/3 max-h-56 w-full overflow-hidden bg-muted">
            <Image
              src={pin.media_url}
              alt={pin.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-2/3 max-h-56 w-full items-center justify-center bg-muted/50">
            <Sparkles className="h-5 w-5 text-muted-foreground/30" />
          </div>
        )}
        <div className="p-4 space-y-2">
          <h3 className="text-[13px] font-medium leading-snug line-clamp-2">{pin.title}</h3>
          <p className="text-[12px] leading-relaxed text-muted-foreground line-clamp-3">
            {pin.description}
          </p>
        </div>
      </div>

      {showDetail && (
        <PinDetailDialog pin={pin} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}
