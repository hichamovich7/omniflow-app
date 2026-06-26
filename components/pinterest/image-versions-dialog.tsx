'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle, Trash2, Loader2, X, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PinImage } from '@/types/database';

interface ImageVersionsDialogProps {
  pinId: string;
  pinTitle: string;
  onClose: () => void;
}

async function fetchPinImageVersions(pinId: string): Promise<PinImage[]> {
  try {
    const res = await fetch(`/api/pinterest/pin-images?pinId=${pinId}`);
    const json = await res.json();
    return json.data?.versions ?? [];
  } catch {
    return [];
  }
}

export function ImageVersionsDialog({
  pinId,
  pinTitle,
  onClose,
}: ImageVersionsDialogProps) {
  const router = useRouter();
  const [versions, setVersions] = useState<PinImage[] | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (versions === null) {
    fetchPinImageVersions(pinId).then(setVersions);
  }

  async function handleSetActive(imageId: string) {
    setActionId(imageId);
    const res = await fetch(`/api/pinterest/pin-images/${imageId}`, { method: 'PATCH' });
    const json = await res.json();
    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to set active image');
    } else {
      toast.success('Active image updated');
      setVersions(prev =>
        prev?.map(v => ({ ...v, is_active: v.id === imageId })) ?? null
      );
      router.refresh();
    }
    setActionId(null);
  }

  async function handleDelete(imageId: string) {
    setActionId(imageId);
    const res = await fetch(`/api/pinterest/pin-images/${imageId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to delete version');
    } else {
      toast.success('Version deleted');
      setVersions(prev => {
        if (!prev) return prev;
        const remaining = prev.filter(v => v.id !== imageId);
        const wasActive = prev.find(v => v.id === imageId)?.is_active;
        if (wasActive && remaining.length > 0) {
          const newest = remaining.reduce((a, b) => a.version > b.version ? a : b);
          return remaining.map(v => ({ ...v, is_active: v.id === newest.id }));
        }
        return remaining;
      });
      router.refresh();
    }
    setActionId(null);
  }

  return (
    <>
      <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Image Versions</DialogTitle>
            <DialogDescription className="truncate">{pinTitle}</DialogDescription>
          </DialogHeader>

          {versions === null ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {versions.map(v => (
                <div
                  key={v.id}
                  className={`relative rounded-xl border overflow-hidden transition-all ${
                    v.is_active
                      ? 'border-primary ring-2 ring-primary/25 shadow-sm'
                      : 'border-border/60 hover:border-border'
                  }`}
                >
                  {/* Active badge */}
                  {v.is_active && (
                    <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5">
                      <CheckCircle className="h-2.5 w-2.5 text-primary-foreground" />
                      <span className="text-[9px] font-semibold text-primary-foreground uppercase tracking-wider">
                        Active
                      </span>
                    </div>
                  )}

                  {/* Thumbnail with preview trigger */}
                  <button
                    onClick={() => setPreviewUrl(v.url)}
                    className="group/thumb relative block w-full"
                    aria-label={`Preview version ${v.version}`}
                  >
                    <div className="relative aspect-2/3 w-full bg-muted">
                      <Image
                        src={v.url}
                        alt={`Version ${v.version}`}
                        fill
                        sizes="150px"
                        className="object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/thumb:bg-black/20">
                      <ZoomIn className="h-5 w-5 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100" />
                    </div>
                  </button>

                  {/* Footer */}
                  <div className="p-2 space-y-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      v{v.version}
                    </span>

                    {!v.is_active && (
                      <div className="flex gap-1">
                        <Button
                          size="xs"
                          className="flex-1"
                          onClick={() => handleSetActive(v.id)}
                          disabled={actionId !== null}
                          aria-label={`Use version ${v.version} as active image`}
                        >
                          {actionId === v.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Use this
                            </>
                          )}
                        </Button>
                        {versions.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDelete(v.id)}
                            disabled={actionId !== null}
                            aria-label={`Delete version ${v.version}`}
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setPreviewUrl(null)}
          role="dialog"
          aria-label="Image preview"
        >
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative max-h-[85vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={previewUrl}
              alt="Full-size preview"
              width={1024}
              height={1536}
              className="max-h-[85vh] w-auto rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
