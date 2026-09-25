'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { ContentStreamStatus } from '@/types/content-streams';

const NO_CATEGORY_VALUE = 'none';
const NO_BOARD_VALUE = 'none';

const STATUS_OPTIONS: ContentStreamStatus[] = ['active', 'warming', 'paused', 'archived'];

export interface CategoryOption {
  id: string;
  name: string;
}

export interface BoardOption {
  id: string;
  name: string;
  /** Set only when a non-archived stream other than the one being edited already claims this board. */
  occupant: { streamId: string; streamName: string } | null;
}

export interface EditingContentStream {
  id: string;
  name: string;
  wordpressCategoryId: string | null;
  boardId: string | null;
  status: ContentStreamStatus;
  targetPinsPerDay: number | null;
  targetArticlesPerWeek: number | null;
  targetBufferDays: number | null;
}

interface ContentStreamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  categories: CategoryOption[];
  boards: BoardOption[];
  /** undefined = create mode. Provided = edit mode, pre-filled from this stream. */
  editing?: EditingContentStream;
}

/** '' (empty) parses to null (not set); a non-integer or negative value is rejected client-side too, ahead of the server's own Zod check. */
export function parseOptionalNonNegativeInt(raw: string): { value: number | null; valid: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, valid: true };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) return { value: null, valid: false };
  return { value: n, valid: true };
}

export function ContentStreamFormDialog({
  open,
  onOpenChange,
  projectId,
  categories,
  boards,
  editing,
}: ContentStreamFormDialogProps) {
  const router = useRouter();
  const isEditMode = !!editing;

  // Initialized once per mount from `editing` — the parent remounts this
  // component (via a `key` tied to open state + which stream, if any, is
  // being edited) every time it opens, so this lazy init always runs fresh
  // instead of needing an effect + setState to resync on prop changes.
  const [name, setName] = useState(() => editing?.name ?? '');
  const [categoryId, setCategoryId] = useState(() => editing?.wordpressCategoryId ?? NO_CATEGORY_VALUE);
  const [boardId, setBoardId] = useState(() => editing?.boardId ?? NO_BOARD_VALUE);
  const [status, setStatus] = useState<ContentStreamStatus>(() => editing?.status ?? 'active');
  const [pinsPerDay, setPinsPerDay] = useState(() => (editing?.targetPinsPerDay != null ? String(editing.targetPinsPerDay) : ''));
  const [articlesPerWeek, setArticlesPerWeek] = useState(() =>
    editing?.targetArticlesPerWeek != null ? String(editing.targetArticlesPerWeek) : ''
  );
  const [bufferDays, setBufferDays] = useState(() => (editing?.targetBufferDays != null ? String(editing.targetBufferDays) : ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!loading) onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    const pins = parseOptionalNonNegativeInt(pinsPerDay);
    const articles = parseOptionalNonNegativeInt(articlesPerWeek);
    const buffer = parseOptionalNonNegativeInt(bufferDays);

    if (!pins.valid || !articles.valid || !buffer.valid) {
      setError('Targets must be whole numbers, zero or greater');
      return;
    }

    const payload = {
      ...(isEditMode ? {} : { projectId }),
      name: name.trim(),
      wordpressCategoryId: categoryId === NO_CATEGORY_VALUE ? null : categoryId,
      status,
      targetPinsPerDay: pins.value,
      targetArticlesPerWeek: articles.value,
      targetBufferDays: buffer.value,
      boardId: boardId === NO_BOARD_VALUE ? null : boardId,
    };

    setLoading(true);
    const res = await fetch(isEditMode ? `/api/content-streams/${editing.id}` : '/api/content-streams', {
      method: isEditMode ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Something went wrong';
      setError(message);
      toast.error(message);
      return;
    }

    if (json.data?.boardWarning) {
      // Partial success: the stream itself is saved, the board link is not — never phrased as a plain success.
      toast.warning(json.data.boardWarning);
    } else {
      toast.success(isEditMode ? 'Content stream updated' : 'Content stream created');
    }

    onOpenChange(false);
    router.refresh();
  }

  // `initialFocus` instead of `autoFocus`: autoFocus moves focus before the
  // dialog records the element to return to, so closing landed on <body>.
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" initialFocus={nameRef}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Content Stream' : 'Add Content Stream'}</DialogTitle>
            <DialogDescription>
              Groups this project&apos;s Pinterest board and WordPress category under one topic pillar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cs-name">Name</Label>
              <Input
                ref={nameRef}
                id="cs-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Crochet Cats"
                maxLength={100}
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cs-category">WordPress Category</Label>
                <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)}>
                  <SelectTrigger id="cs-category" className="w-full" disabled={loading}>
                    <span className="min-w-0 truncate text-sm">
                      {categoryId === NO_CATEGORY_VALUE ? 'No WordPress category' : categories.find((c) => c.id === categoryId)?.name ?? 'No WordPress category'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY_VALUE}>No WordPress category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cs-board">Pinterest Board</Label>
                <Select value={boardId} onValueChange={(v) => v && setBoardId(v)}>
                  <SelectTrigger id="cs-board" className="w-full" disabled={loading}>
                    <span className="min-w-0 truncate text-sm">
                      {boardId === NO_BOARD_VALUE ? 'No Pinterest board' : boards.find((b) => b.id === boardId)?.name ?? 'No Pinterest board'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_BOARD_VALUE}>No Pinterest board</SelectItem>
                    {boards.map((b) => {
                      const takenByAnother = !!b.occupant && b.occupant.streamId !== editing?.id;
                      return (
                        <SelectItem key={b.id} value={b.id} disabled={takenByAnother}>
                          {b.name}
                          {takenByAnother ? ` (in use by ${b.occupant?.streamName})` : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cs-status">Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as ContentStreamStatus)}>
                <SelectTrigger id="cs-status" className="w-full" disabled={loading}>
                  <span className="text-sm capitalize">{status}</span>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cs-pins-per-day">Pins / day</Label>
                <Input
                  id="cs-pins-per-day"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={pinsPerDay}
                  onChange={(e) => setPinsPerDay(e.target.value)}
                  disabled={loading}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-articles-per-week">Articles / week</Label>
                <Input
                  id="cs-articles-per-week"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={articlesPerWeek}
                  onChange={(e) => setArticlesPerWeek(e.target.value)}
                  disabled={loading}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-buffer-days">Buffer days</Label>
                <Input
                  id="cs-buffer-days"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={bufferDays}
                  onChange={(e) => setBufferDays(e.target.value)}
                  disabled={loading}
                  placeholder="—"
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Saving...' : isEditMode ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
