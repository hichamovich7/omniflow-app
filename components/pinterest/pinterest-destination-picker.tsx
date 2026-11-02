'use client';

import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { SectionFormDialog, type CreatedSection } from '@/components/pinterest-accounts/structure-dialogs';
import {
  accountChoices,
  activeStreamDestinationCount,
  boardChoices,
  destinationSelectionError,
  LEGACY_SELECTION,
  sectionChoices,
  selectAccount,
  streamChoices,
  type DestinationSelection,
} from '@/lib/pinterest/destination-picker';
import type { PinterestStructure } from '@/lib/queries/pinterest-accounts';

const LEGACY = '__legacy__';
const NO_STREAM = '__none__';
const AUTO_BOARD = '__auto__';
const NO_SECTION = '__none__';

/**
 * TASK-091: Pinterest Account → Content Stream → Board → Section (optional).
 * Each list is filtered by the one above it, so a board of another account or
 * a section of another board can never be chosen. "Legacy" keeps the former
 * free-text board / section (`legacyFields`) for streams not linked yet.
 */
export function PinterestDestinationPicker({
  structure,
  projectId,
  value,
  onChange,
  disabled,
  legacyFields,
}: {
  structure: PinterestStructure;
  projectId: string;
  value: DestinationSelection;
  onChange: (next: DestinationSelection) => void;
  disabled: boolean;
  legacyFields: ReactNode;
}) {
  // Sections added from here, shown before the page data is refreshed.
  const [addedSections, setAddedSections] = useState<CreatedSection[]>([]);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [sectionSession, setSectionSession] = useState(0);

  const accounts = accountChoices(structure, projectId);
  const legacy = value.mode === 'legacy';
  const accountId = value.mode === 'account' ? value.accountId : null;
  const streamId = value.mode === 'account' ? value.streamId : null;
  const boardId = value.mode === 'account' ? value.boardId : null;
  const sectionId = value.mode === 'account' ? value.sectionId : null;

  const streams = accountId ? streamChoices(structure, accountId) : [];
  const boards = accountId ? boardChoices(structure, accountId, streamId) : [];
  const board = boards.find((candidate) => candidate.id === boardId) ?? null;
  const sections = board
    ? [
        ...sectionChoices(structure, board.id),
        ...addedSections
          .filter((section) => section.board_id === board.id && section.is_active)
          .filter((section) => !sectionChoices(structure, board.id).some((known) => known.id === section.id)),
      ]
    : [];
  const autoCount = accountId && streamId ? activeStreamDestinationCount(structure, accountId, streamId) : 0;
  const error = destinationSelectionError(structure, value);

  function patch(next: Partial<Extract<DestinationSelection, { mode: 'account' }>>) {
    if (value.mode !== 'account') return;
    onChange({ ...value, ...next });
  }

  const accountLabel = legacy ? 'Legacy — free board (no account)' : accounts.find((a) => a.id === accountId)?.name ?? 'Choose';
  const streamLabel = streams.find((s) => s.id === streamId)?.name ?? 'No stream — choose a board';
  const boardLabel = board?.name ?? (streamId ? `Auto — ${autoCount} active destination${autoCount === 1 ? '' : 's'}` : 'Choose a board');
  const sectionLabel = sections.find((s) => s.id === sectionId)?.name ?? 'No section';

  return (
    <div className="space-y-3" data-testid="pinterest-destination-picker">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pinterest-account" className="text-xs font-medium text-muted-foreground">
            Pinterest account
          </Label>
          <Select
            value={legacy ? LEGACY : accountId ?? LEGACY}
            onValueChange={(v) => v && onChange(v === LEGACY ? LEGACY_SELECTION : selectAccount(structure, v))}
            disabled={disabled}
          >
            <SelectTrigger id="pinterest-account" className="w-full" aria-describedby="board-help">
              <span className="truncate text-sm">{accountLabel}</span>
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
              <SelectItem value={LEGACY}>Legacy — free board (no account)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!legacy && (
          <div className="space-y-1.5">
            <Label htmlFor="pinterest-stream" className="text-xs font-medium text-muted-foreground">
              Content Stream
            </Label>
            <Select
              value={streamId ?? NO_STREAM}
              onValueChange={(v) => {
                if (!v || !accountId) return;
                const nextStream = v === NO_STREAM ? null : v;
                const [firstBoard] = nextStream ? [] : boardChoices(structure, accountId, null);
                patch({ streamId: nextStream, boardId: nextStream ? null : firstBoard?.id ?? null, sectionId: null });
              }}
              disabled={disabled}
            >
              <SelectTrigger id="pinterest-stream" className="w-full">
                <span className="truncate text-sm">{streamLabel}</span>
              </SelectTrigger>
              <SelectContent>
                {streams.map((stream) => (
                  <SelectItem key={stream.id} value={stream.id}>
                    {stream.name}
                  </SelectItem>
                ))}
                <SelectItem value={NO_STREAM}>No stream — choose a board</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {!legacy && (
          <div className="space-y-1.5">
            <Label htmlFor="pinterest-board" className="text-xs font-medium text-muted-foreground">
              Board
            </Label>
            <Select
              value={boardId ?? AUTO_BOARD}
              onValueChange={(v) => v && patch({ boardId: v === AUTO_BOARD ? null : v, sectionId: null })}
              disabled={disabled}
            >
              <SelectTrigger id="pinterest-board" className="w-full">
                <span className="truncate text-sm">{boardLabel}</span>
              </SelectTrigger>
              <SelectContent>
                {streamId && (
                  <SelectItem value={AUTO_BOARD}>
                    Auto — split across the stream&apos;s active destinations
                  </SelectItem>
                )}
                {boards.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!legacy && board && (
          <div className="space-y-1.5">
            <Label htmlFor="pinterest-section" className="text-xs font-medium text-muted-foreground">
              Section (optional)
            </Label>
            <div className="flex gap-2">
              <Select
                value={sectionId ?? NO_SECTION}
                onValueChange={(v) => v && patch({ sectionId: v === NO_SECTION ? null : v })}
                disabled={disabled}
              >
                <SelectTrigger id="pinterest-section" className="w-full min-w-0">
                  <span className="truncate text-sm">{sectionLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SECTION}>No section</SelectItem>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label={`Add a section to "${board.name}"`}
                disabled={disabled}
                onClick={() => {
                  setSectionSession((n) => n + 1);
                  setSectionDialogOpen(true);
                }}
              >
                <Plus />
              </Button>
            </div>
          </div>
        )}
      </div>

      {!legacy && (
        <p className="text-xs text-muted-foreground" data-testid="destination-summary">
          {streamId && !boardId
            ? 'Each Pin gets one board of the stream — primary first, then by weight. No Pin is duplicated on several boards.'
            : 'Every Pin goes to this board and section. Names are written exactly as configured in the CSV.'}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {legacy && legacyFields}

      {board && sectionDialogOpen && (
        <SectionFormDialog
          key={sectionSession}
          open
          onOpenChange={setSectionDialogOpen}
          boardId={board.id}
          boardName={board.name}
          onSaved={(section) => {
            setAddedSections((current) => [...current, section]);
            patch({ sectionId: section.id });
          }}
        />
      )}
    </div>
  );
}
