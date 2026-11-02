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
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Star, Trash2 } from 'lucide-react';
import type { ContentStreamStatus } from '@/types/content-streams';
import { DESTINATION_WEIGHT_MAX, DESTINATION_WEIGHT_MIN } from '@/lib/validations/content-streams';

const NO_CATEGORY_VALUE = 'none';
const NO_ACCOUNT_VALUE = 'none';
const WHOLE_BOARD_VALUE = 'none';

// `planned` = prepared for later, not started: it can move to warming or active at any time.
export const STATUS_OPTIONS: ContentStreamStatus[] = ['active', 'planned', 'warming', 'paused', 'archived'];

export interface CategoryOption {
  id: string;
  name: string;
}

export interface BoardOption {
  id: string;
  name: string;
  /** Set only when a non-archived stream other than the one being edited already claims this board. */
  occupant: { streamId: string; streamName: string } | null;
  /** TASK-091 — null = legacy board without account. */
  pinterestAccountId?: string | null;
  isActive?: boolean;
  sections?: { id: string; name: string; is_active: boolean }[];
}

export interface AccountOption {
  id: string;
  name: string;
  status: string;
}

/** One Pinterest destination of the stream being edited (content_stream_boards row). */
export interface DestinationDraft {
  boardId: string;
  sectionId: string | null;
  isPrimary: boolean;
  isActive: boolean;
  weight: number;
}

export interface EditingContentStream {
  id: string;
  name: string;
  wordpressCategoryId: string | null;
  pinterestAccountId: string | null;
  destinations: DestinationDraft[];
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
  accounts?: AccountOption[];
  /** undefined = create mode. Provided = edit mode, pre-filled from this stream. */
  editing?: EditingContentStream;
  /** Pre-filled name for a new stream (e.g. a recommended sub-niche from the niche settings). */
  initialName?: string;
  /** TASK-092: create-mode prefill (account, destinations, WordPress category) — every field stays editable. */
  initialDraft?: {
    accountId: string | null;
    categoryId: string | null;
    destinations: DestinationDraft[];
  };
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
  accounts = [],
  editing,
  initialName,
  initialDraft,
}: ContentStreamFormDialogProps) {
  const router = useRouter();
  const isEditMode = !!editing;

  // Initialized once per mount from `editing` — the parent remounts this
  // component (via a `key` tied to open state + which stream, if any, is
  // being edited) every time it opens, so this lazy init always runs fresh
  // instead of needing an effect + setState to resync on prop changes.
  const [name, setName] = useState(() => editing?.name ?? initialName ?? '');
  const [categoryId, setCategoryId] = useState(
    () => editing?.wordpressCategoryId ?? initialDraft?.categoryId ?? NO_CATEGORY_VALUE
  );
  const [accountId, setAccountId] = useState(
    () => editing?.pinterestAccountId ?? initialDraft?.accountId ?? NO_ACCOUNT_VALUE
  );
  const [destinations, setDestinations] = useState<DestinationDraft[]>(
    () => editing?.destinations ?? initialDraft?.destinations ?? []
  );
  const [status, setStatus] = useState<ContentStreamStatus>(() => editing?.status ?? 'active');
  const [pinsPerDay, setPinsPerDay] = useState(() => (editing?.targetPinsPerDay != null ? String(editing.targetPinsPerDay) : ''));
  const [articlesPerWeek, setArticlesPerWeek] = useState(() =>
    editing?.targetArticlesPerWeek != null ? String(editing.targetArticlesPerWeek) : ''
  );
  const [bufferDays, setBufferDays] = useState(() => (editing?.targetBufferDays != null ? String(editing.targetBufferDays) : ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A linked stream only offers boards of its own account; a legacy stream
  // (no account) keeps every board of the project, as before TASK-091.
  const availableBoards =
    accountId === NO_ACCOUNT_VALUE ? boards : boards.filter((b) => b.pinterestAccountId === accountId);

  function changeAccount(next: string) {
    setAccountId(next);
    if (next === NO_ACCOUNT_VALUE) return;
    // Boards of another account can never stay on a linked stream.
    setDestinations((current) =>
      normalizeDrafts(current.filter((d) => boards.find((b) => b.id === d.boardId)?.pinterestAccountId === next))
    );
  }

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

    const destinationError = checkDestinationDrafts(destinations);
    if (destinationError) {
      setError(destinationError);
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
      pinterestAccountId: accountId === NO_ACCOUNT_VALUE ? null : accountId,
      destinations,
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
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" initialFocus={nameRef}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Content Stream' : 'Add Content Stream'}</DialogTitle>
            <DialogDescription>
              Groups a Pinterest account&apos;s boards and sections and a WordPress category under one topic pillar.
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

            <div className="grid gap-3 sm:grid-cols-2">
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
                <Label htmlFor="cs-account">Pinterest account</Label>
                <Select value={accountId} onValueChange={(v) => v && changeAccount(v)}>
                  <SelectTrigger id="cs-account" className="w-full" disabled={loading}>
                    <span className="min-w-0 truncate text-sm">
                      {accounts.find((a) => a.id === accountId)?.name ?? 'No account (legacy)'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACCOUNT_VALUE}>No account (legacy)</SelectItem>
                    {accounts
                      .filter((a) => a.status !== 'archived' || a.id === accountId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DestinationsEditor
              destinations={destinations}
              onChange={setDestinations}
              boards={availableBoards}
              editingStreamId={editing?.id}
              disabled={loading}
              legacy={accountId === NO_ACCOUNT_VALUE}
            />

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

/** First active destination becomes primary when none is (same rule as the API). */
export function normalizeDrafts(drafts: DestinationDraft[]): DestinationDraft[] {
  if (drafts.some((d) => d.isPrimary) || drafts.length === 0) return drafts;
  const firstActive = drafts.findIndex((d) => d.isActive);
  return firstActive < 0 ? drafts : drafts.map((d, i) => (i === firstActive ? { ...d, isPrimary: true } : d));
}

/** Client-side mirror of the API / database rules; null when valid. */
export function checkDestinationDrafts(drafts: DestinationDraft[]): string | null {
  const keys = new Set<string>();
  for (const d of drafts) {
    if (!d.boardId) return 'Choose a board for every destination.';
    const key = `${d.boardId}:${d.sectionId ?? ''}`;
    if (keys.has(key)) return 'The same board and section is listed twice.';
    keys.add(key);
    if (!Number.isInteger(d.weight) || d.weight < DESTINATION_WEIGHT_MIN || d.weight > DESTINATION_WEIGHT_MAX) {
      return `Weights must be whole numbers from ${DESTINATION_WEIGHT_MIN} to ${DESTINATION_WEIGHT_MAX}.`;
    }
    if (d.isPrimary && !d.isActive) return 'The primary destination must be active.';
  }
  if (drafts.filter((d) => d.isPrimary).length > 1) return 'Only one destination can be primary.';
  return null;
}

/**
 * TASK-091: the stream's Pinterest destinations — a board, optionally one of
 * its sections; one primary (first Pin + fallback), active flag, weight
 * (share of the stream's Pins). The same board can be listed once per section.
 */
function DestinationsEditor({
  destinations,
  onChange,
  boards,
  editingStreamId,
  disabled,
  legacy,
}: {
  destinations: DestinationDraft[];
  onChange: (next: DestinationDraft[]) => void;
  boards: BoardOption[];
  editingStreamId?: string;
  disabled: boolean;
  legacy: boolean;
}) {
  const selectable = boards.filter((b) => !b.occupant || b.occupant.streamId === editingStreamId);

  function update(index: number, patch: Partial<DestinationDraft>) {
    onChange(destinations.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function setPrimary(index: number) {
    onChange(destinations.map((d, i) => ({ ...d, isPrimary: i === index, isActive: i === index ? true : d.isActive })));
  }

  function remove(index: number) {
    onChange(normalizeDrafts(destinations.filter((_, i) => i !== index)));
  }

  function add() {
    const first = selectable.find((b) => b.isActive !== false) ?? selectable[0];
    if (!first) return;
    onChange(normalizeDrafts([...destinations, { boardId: first.id, sectionId: null, isPrimary: false, isActive: true, weight: 1 }]));
  }

  return (
    <fieldset className="space-y-2" data-testid="stream-destinations">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm font-medium">Pinterest destinations</legend>
        <Button type="button" variant="outline" size="xs" onClick={add} disabled={disabled || selectable.length === 0}>
          <Plus className="h-3 w-3" />
          Add board
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {legacy
          ? 'Legacy stream (no account): any board of the project. Link an account to use its boards and sections.'
          : "Boards of the selected account. The primary destination gets the first Pin and is the fallback; weights split the stream's Pins."}
      </p>
      {selectable.length === 0 && (
        <p className="text-xs text-muted-foreground">No available board — add boards to this account on the Pinterest Accounts page.</p>
      )}
      {destinations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">No destination yet.</p>
      ) : (
        <ul className="space-y-2">
          {destinations.map((d, index) => {
            const board = boards.find((b) => b.id === d.boardId);
            const sections = (board?.sections ?? []).filter((s) => s.is_active || s.id === d.sectionId);
            return (
              <li key={index} className="space-y-2 rounded-lg border border-border/60 p-2.5" data-testid="stream-destination">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={d.boardId} onValueChange={(v) => v && update(index, { boardId: v, sectionId: null })}>
                    <SelectTrigger aria-label={`Board of destination ${index + 1}`} className="w-full" disabled={disabled}>
                      <span className="min-w-0 truncate text-sm">{board?.name ?? 'Choose a board'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {boards
                        .filter((b) => b.id === d.boardId || selectable.includes(b))
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                            {b.isActive === false ? ' (inactive)' : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={d.sectionId ?? WHOLE_BOARD_VALUE}
                    onValueChange={(v) => v && update(index, { sectionId: v === WHOLE_BOARD_VALUE ? null : v })}
                  >
                    <SelectTrigger aria-label={`Section of destination ${index + 1}`} className="w-full" disabled={disabled}>
                      <span className="min-w-0 truncate text-sm">{sections.find((s) => s.id === d.sectionId)?.name ?? 'No section'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WHOLE_BOARD_VALUE}>No section</SelectItem>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="cs-primary-destination"
                      checked={d.isPrimary}
                      onChange={() => setPrimary(index)}
                      disabled={disabled}
                      className="accent-primary"
                    />
                    <Star className="h-3 w-3" aria-hidden="true" />
                    Primary
                  </label>
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={d.isActive}
                      onCheckedChange={(checked) => update(index, { isActive: checked === true })}
                      disabled={disabled || d.isPrimary}
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-1.5">
                    Weight
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={DESTINATION_WEIGHT_MIN}
                      max={DESTINATION_WEIGHT_MAX}
                      step={1}
                      value={d.weight}
                      onChange={(e) => update(index, { weight: Number(e.target.value) })}
                      disabled={disabled}
                      className="h-8 w-16"
                      aria-label={`Weight of destination ${index + 1}`}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="ml-auto"
                    onClick={() => remove(index)}
                    disabled={disabled}
                    aria-label={`Remove destination ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
