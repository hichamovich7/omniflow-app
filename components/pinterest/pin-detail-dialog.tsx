'use client';

import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Pin } from '@/types/database';

interface PinDetailDialogProps {
  pin: Pin;
  onClose: () => void;
}

export function PinDetailDialog({ pin, onClose }: PinDetailDialogProps) {
  const keywords = pin.keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  return (
    <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pin Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {pin.media_url ? (
            <div className="relative aspect-2/3 max-h-80 w-full overflow-hidden rounded-lg bg-muted">
              <Image
                src={pin.media_url}
                alt={pin.title}
                fill
                sizes="(max-width: 640px) 100vw, 512px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="flex aspect-2/3 max-h-80 w-full items-center justify-center rounded-lg bg-muted/50">
              <Sparkles className="h-6 w-6 text-muted-foreground/30" />
            </div>
          )}

          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold leading-snug">{pin.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {pin.description}
            </p>
          </div>

          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary">
                  {keyword}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
