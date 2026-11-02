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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { PinterestAccount, PinterestAccountStatus, PinterestAccountType } from '@/types/pinterest-accounts';
import { attachableBoards, boardNameConflict, type BoardNameConflict, type ExistingBoard } from '@/lib/pinterest/board-attach';

/** JSON request to one of the app's own routes; returns the API envelope's data or its message. */
export async function sendJson<T>(
  url: string,
  method: 'POST' | 'PATCH',
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok || json.error) return { ok: false, message: json.error?.message ?? 'Something went wrong' };
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, message: 'Network error — try again.' };
  }
}

const ACCOUNT_TYPE_LABELS: Record<PinterestAccountType, string> = { business: 'Business', personal: 'Personal' };
const ACCOUNT_STATUS_LABELS: Record<PinterestAccountStatus, string> = { active: 'Active', paused: 'Paused', archived: 'Archived' };

// ---------------------------------------------------------------------------
// Pinterest account
// ---------------------------------------------------------------------------

export function AccountFormDialog({
  open,
  onOpenChange,
  projectId,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** undefined = create. */
  editing?: PinterestAccount;
}) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState(() => ({
    name: editing?.name ?? '',
    username: editing?.username ?? '',
    profileUrl: editing?.profile_url ?? '',
    mainKeyword: editing?.main_keyword ?? '',
    websiteUrl: editing?.website_url ?? '',
    language: editing?.language ?? '',
    market: editing?.market ?? '',
    notes: editing?.notes ?? '',
  }));
  const [accountType, setAccountType] = useState<PinterestAccountType>(editing?.account_type ?? 'business');
  const [status, setStatus] = useState<PinterestAccountStatus>(editing?.status ?? 'active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!fields.name.trim()) {
      setError('Name is required');
      return;
    }
    setLoading(true);
    const result = editing
      ? await sendJson(`/api/pinterest-accounts/${editing.id}`, 'PATCH', { ...fields, accountType, status })
      : await sendJson('/api/pinterest-accounts', 'POST', { projectId, ...fields, accountType, status });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }
    toast.success(editing ? 'Pinterest account updated' : 'Pinterest account created');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" initialFocus={nameRef}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Pinterest account' : 'Add Pinterest account'}</DialogTitle>
            <DialogDescription>
              Typed in by hand — OmniFlow never asks for a Pinterest password, cookie or token.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pa-name">Name</Label>
              <Input ref={nameRef} id="pa-name" value={fields.name} onChange={set('name')} maxLength={100} placeholder="e.g. Air Dry Clay Projects" disabled={loading} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pa-username">Username</Label>
                <Input id="pa-username" value={fields.username} onChange={set('username')} maxLength={100} placeholder="@airdryclayprojects" disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pa-profile-url">Profile URL</Label>
                <Input id="pa-profile-url" type="url" inputMode="url" value={fields.profileUrl} onChange={set('profileUrl')} maxLength={500} placeholder="https://pinterest.com/…" disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pa-keyword">Main keyword / niche</Label>
                <Input id="pa-keyword" value={fields.mainKeyword} onChange={set('mainKeyword')} maxLength={200} placeholder="air dry clay" disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pa-website">Website URL</Label>
                <Input id="pa-website" type="url" inputMode="url" value={fields.websiteUrl} onChange={set('websiteUrl')} maxLength={500} placeholder="https://…" disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pa-language">Language</Label>
                <Input id="pa-language" value={fields.language} onChange={set('language')} maxLength={40} placeholder="en" disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pa-market">Market</Label>
                <Input id="pa-market" value={fields.market} onChange={set('market')} maxLength={60} placeholder="US" disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pa-type">Account type</Label>
                <Select value={accountType} onValueChange={(value) => value && setAccountType(value as PinterestAccountType)}>
                  <SelectTrigger id="pa-type" className="w-full" disabled={loading}>
                    <span className="text-sm">{ACCOUNT_TYPE_LABELS[accountType]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACCOUNT_TYPE_LABELS) as PinterestAccountType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {ACCOUNT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pa-status">Status</Label>
                <Select value={status} onValueChange={(value) => value && setStatus(value as PinterestAccountStatus)}>
                  <SelectTrigger id="pa-status" className="w-full" disabled={loading}>
                    <span className="text-sm">{ACCOUNT_STATUS_LABELS[status]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACCOUNT_STATUS_LABELS) as PinterestAccountStatus[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {ACCOUNT_STATUS_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pa-notes">Notes</Label>
              <Textarea id="pa-notes" value={fields.notes} onChange={set('notes')} maxLength={2000} className="min-h-20" disabled={loading} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !fields.name.trim()}>
              {loading ? 'Saving...' : editing ? 'Save changes' : 'Create account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

const NO_ACCOUNT = '__none__';

export interface EditingBoard {
  id: string;
  name: string;
  accountId: string | null;
  isActive: boolean;
}

/**
 * TASK-093: what the typed board name points to in the project, with the fix
 * when there is one — a legacy board is attached to the chosen account instead
 * of re-created (board names are unique per project).
 */
export function BoardNameConflictNotice({
  conflict,
  accountName,
  otherAccountName,
  onAttach,
  disabled,
}: {
  conflict: BoardNameConflict;
  /** The account chosen in the dialog; null = "No account (legacy)". */
  accountName: string | null;
  otherAccountName?: string;
  onAttach: () => void;
  disabled?: boolean;
}) {
  const name = <span className="font-medium text-foreground">{conflict.board.name}</span>;
  return (
    <div className="space-y-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm" data-testid="board-name-conflict">
      {conflict.kind === 'legacy' && (
        <>
          <p>{name} already exists in this project, without a Pinterest account.</p>
          {accountName ? (
            <Button type="button" size="sm" onClick={onAttach} disabled={disabled}>
              Attach to {accountName}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Choose an account below to attach it.</p>
          )}
        </>
      )}
      {conflict.kind === 'same_account' && (
        <p>
          {name} is already a board of {accountName ?? 'this account'}.
        </p>
      )}
      {conflict.kind === 'other_account' && (
        <p>
          {name} already belongs to {otherAccountName ?? 'another account'} in this project. Edit it from that account to move it.
        </p>
      )}
    </div>
  );
}

export function BoardFormDialog({
  open,
  onOpenChange,
  projectId,
  accounts,
  editing,
  defaultAccountId,
  projectBoards = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  accounts: { id: string; name: string; status: string }[];
  editing?: EditingBoard;
  defaultAccountId?: string | null;
  /** Every board of the project (TASK-093): name conflicts and "Existing board". */
  projectBoards?: ExistingBoard[];
}) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState(editing?.name ?? '');
  const [existingId, setExistingId] = useState('');
  const [accountId, setAccountId] = useState(editing?.accountId ?? defaultAccountId ?? NO_ACCOUNT);
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectable = accounts.filter((account) => account.status !== 'archived' || account.id === accountId);
  const pinterestAccountId = accountId === NO_ACCOUNT ? null : accountId;
  const accountName = accounts.find((account) => account.id === pinterestAccountId)?.name ?? null;

  // Creation only: an edited board keeps its own name.
  const attachable = editing ? [] : attachableBoards(projectBoards);
  const conflict = editing ? null : boardNameConflict(projectBoards, name, pinterestAccountId);
  const existing = attachable.find((board) => board.id === existingId);

  async function attach(board: ExistingBoard) {
    setError(null);
    if (!pinterestAccountId) {
      setError('Choose the Pinterest account to attach it to');
      return;
    }
    setLoading(true);
    const result = await sendJson(`/api/boards/${board.id}`, 'PATCH', { pinterestAccountId });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }
    toast.success(`"${board.name}" attached to ${accountName}`);
    onOpenChange(false);
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === 'existing') {
      if (!existing) {
        setError('Choose a board');
        return;
      }
      await attach(existing);
      return;
    }
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setLoading(true);
    const result = editing
      ? await sendJson(`/api/boards/${editing.id}`, 'PATCH', { name, pinterestAccountId, isActive })
      : await sendJson('/api/boards', 'POST', { projectId, name, pinterestAccountId, isActive });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }
    toast.success(editing ? 'Board updated' : 'Board created');
    onOpenChange(false);
    router.refresh();
  }

  const accountField = (
    <div className="space-y-1.5">
      <Label htmlFor="board-account">Pinterest account</Label>
      <Select value={accountId} onValueChange={(value) => value && setAccountId(value)}>
        <SelectTrigger id="board-account" className="w-full" disabled={loading}>
          <span className="min-w-0 truncate text-sm">{accountName ?? 'No account (legacy)'}</span>
        </SelectTrigger>
        <SelectContent>
          {mode === 'new' && <SelectItem value={NO_ACCOUNT}>No account (legacy)</SelectItem>}
          {selectable.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">A board belongs to one account only.</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="max-w-md" initialFocus={nameRef}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit board' : 'Add board'}</DialogTitle>
            <DialogDescription>Use the exact board name shown on Pinterest — it is written as is in the CSV.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {attachable.length > 0 && (
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="New or existing board">
                {(['new', 'existing'] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={mode === value ? 'outline' : 'ghost'}
                    aria-pressed={mode === value}
                    className={mode === value ? 'bg-card' : undefined}
                    onClick={() => {
                      setMode(value);
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    {value === 'new' ? 'New board' : `Existing board (${attachable.length})`}
                  </Button>
                ))}
              </div>
            )}

            {mode === 'new' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="board-name-input">Board name</Label>
                  <Input ref={nameRef} id="board-name-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} disabled={loading} />
                </div>
                {conflict && (
                  <BoardNameConflictNotice
                    conflict={conflict}
                    accountName={accountName}
                    otherAccountName={accounts.find((account) => account.id === conflict.board.accountId)?.name}
                    onAttach={() => attach(conflict.board)}
                    disabled={loading}
                  />
                )}
                {accountField}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} disabled={loading} />
                  Active — offered for new Pins
                </label>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="board-existing">Board without account (legacy)</Label>
                  <Select value={existingId} onValueChange={(value) => value && setExistingId(value)}>
                    <SelectTrigger id="board-existing" className="w-full" disabled={loading}>
                      <span className="min-w-0 truncate text-sm">{existing?.name ?? 'Choose a board'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {attachable.map((board) => (
                        <SelectItem key={board.id} value={board.id}>
                          {board.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Its sections and Pins follow it. Only this project&apos;s boards are listed.</p>
                </div>
                {accountField}
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            {mode === 'existing' ? (
              <Button type="submit" disabled={loading || !existing || !pinterestAccountId}>
                {loading ? 'Saving...' : 'Attach board'}
              </Button>
            ) : (
              <Button type="submit" disabled={loading || !name.trim() || Boolean(conflict?.exact)}>
                {loading ? 'Saving...' : editing ? 'Save changes' : 'Create board'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export interface EditingSection {
  id: string;
  name: string;
  isActive: boolean;
}

export interface CreatedSection {
  id: string;
  name: string;
  board_id: string;
  is_active: boolean;
}

export function SectionFormDialog({
  open,
  onOpenChange,
  boardId,
  boardName,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  boardName: string;
  editing?: EditingSection;
  /** Called with the saved section (the Pinterest form selects it right away). */
  onSaved?: (section: CreatedSection) => void;
}) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(editing?.name ?? '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    // A nested form (inside the Pinterest form) must never submit its parent.
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    if (!name.trim()) {
      setError('Section name is required');
      return;
    }
    setLoading(true);
    const result = editing
      ? await sendJson<{ section: CreatedSection }>(`/api/board-sections/${editing.id}`, 'PATCH', { name, isActive })
      : await sendJson<{ section: CreatedSection }>('/api/board-sections', 'POST', { boardId, name });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }
    toast.success(editing ? 'Section updated' : 'Section created');
    onSaved?.(result.data.section);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="max-w-md" initialFocus={nameRef}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit section' : 'Add section'}</DialogTitle>
            <DialogDescription>
              Section of <span className="font-medium text-foreground">{boardName}</span>. Use the exact name shown on Pinterest.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="section-name-input">Section name</Label>
              <Input
                ref={nameRef}
                id="section-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="e.g. Pumpkins"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">No &quot;/&quot; — it separates board and section in the CSV.</p>
            </div>
            {editing && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} disabled={loading} />
                Active — offered for new Pins
              </label>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Saving...' : editing ? 'Save changes' : 'Add section'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
