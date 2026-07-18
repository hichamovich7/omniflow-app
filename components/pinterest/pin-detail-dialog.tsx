'use client';

import Image from 'next/image';
import { Copy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

  async function copyImagePrompt() {
    try {
      await navigator.clipboard.writeText(pin.image_prompt);
      toast.success('Image prompt copied to clipboard');
    } catch {
      toast.error('Failed to copy image prompt');
    }
  }

  return (
    <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Image Prompt <span className="text-muted-foreground/60">— Internal use, not exported</span>
              </span>
              <Button variant="outline" size="xs" onClick={copyImagePrompt}>
                <Copy className="mr-1 h-3 w-3" />
                Copy
              </Button>
            </div>
            <pre className="max-h-40 overflow-y-auto overscroll-contain whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {pin.image_prompt}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
