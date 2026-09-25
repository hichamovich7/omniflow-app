'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Circle, CircleCheck, Plus, Pencil, Check, X, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { resolvePriorityProjectName } from '@/lib/dashboard/build-command-center';
import type { PriorityItem, ProjectOption } from '@/types/dashboard';
import type { Task } from '@/types/tasks';

interface TodayPrioritiesProps {
  /** Real tasks pinned to today (lib/dashboard/build-command-center.ts selectTodayPriorities). */
  priorities: PriorityItem[];
  /** Real projects already fetched by the Dashboard page — never re-queried here. */
  projects: ProjectOption[];
}

const NO_PROJECT_VALUE = 'none';
const NO_REPLACE_TARGET = '';

/**
 * Priorities pinned to today, backed by the `tasks` table (TASK-FIX-042,
 * Command Center Phase 2b). At most `MAX_PRIORITIES` open priorities: at the
 * limit, Add becomes "Replace a priority" — the user explicitly picks which
 * one to unpin (it stays a pending task, never deleted). The server enforces
 * the same limit (409), so nothing is ever silently dropped.
 */
export const MAX_PRIORITIES = 3;

type PatchBody = { title?: string; projectId?: string | null; status?: 'pending' | 'completed'; pinnedToToday?: boolean };

function toPriority(task: Task): PriorityItem {
  return { id: task.id, label: task.title, done: task.status === 'completed', projectId: task.project_id };
}

async function readError(res: Response, fallback: string): Promise<string> {
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return json?.error?.message ?? fallback;
}

export function TodayPriorities({ priorities, projects }: TodayPrioritiesProps) {
  const router = useRouter();
  const [items, setItems] = useState<PriorityItem[]>(priorities);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addDraftTitle, setAddDraftTitle] = useState('');
  const [addDraftProjectId, setAddDraftProjectId] = useState<string | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState(NO_REPLACE_TARGET);
  const [busy, setBusy] = useState(false);

  // Server data wins after every router.refresh() (reset-on-prop-change, no effect).
  const [syncedPriorities, setSyncedPriorities] = useState(priorities);
  if (syncedPriorities !== priorities) {
    setSyncedPriorities(priorities);
    setItems(priorities);
  }

  const openItems = items.filter((item) => !item.done);
  const atLimit = openItems.length >= MAX_PRIORITIES;

  async function patch(id: string, body: PatchBody, fallback: string): Promise<boolean> {
    setBusy(true);
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(await readError(res, fallback));
      return false;
    }
    const json = (await res.json()) as { data: { task: Task } };
    const updated = json.data.task;
    setItems((prev) =>
      updated.pinned_to_today && updated.status !== 'cancelled'
        ? prev.map((item) => (item.id === id ? toPriority(updated) : item))
        : prev.filter((item) => item.id !== id)
    );
    router.refresh();
    return true;
  }

  function toggleDone(item: PriorityItem) {
    if (item.done && atLimit) {
      toast.error(`You already have ${MAX_PRIORITIES} open priorities. Finish or remove one first.`);
      return;
    }
    void patch(item.id, { status: item.done ? 'pending' : 'completed' }, 'Could not update this priority');
  }

  function setProjectFor(id: string, projectId: string | null) {
    void patch(id, { projectId }, 'Could not change the project');
  }

  function removeFromToday(item: PriorityItem) {
    // Unpin only: the task itself stays (pending or completed), nothing is deleted.
    void patch(item.id, { pinnedToToday: false }, 'Could not remove this priority');
  }

  function startEdit(item: PriorityItem) {
    setEditing({ id: item.id, draft: item.label });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const trimmed = editing.draft.trim();
    if (!trimmed) return; // never save an empty title
    const current = items.find((item) => item.id === editing.id);
    if (current?.label === trimmed) {
      setEditing(null); // unchanged — no-op
      return;
    }
    if (await patch(editing.id, { title: trimmed }, 'Could not rename this priority')) setEditing(null);
  }

  function cancelAdd() {
    setIsAdding(false);
    setAddDraftTitle('');
    setAddDraftProjectId(null);
    setReplaceTargetId(NO_REPLACE_TARGET);
  }

  async function addOrReplacePriority() {
    const title = addDraftTitle.trim();
    if (!title) return;
    if (atLimit && !replaceTargetId) return; // a replace target is required once at the limit

    setBusy(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        source: 'manual',
        type: 'custom',
        projectId: addDraftProjectId,
        pinnedToToday: true,
        ...(atLimit ? { replaceTaskId: replaceTargetId } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(await readError(res, 'Could not add this priority'));
      return;
    }
    const json = (await res.json()) as { data: { task: Task } };
    const created = toPriority(json.data.task);
    setItems((prev) => [...prev.filter((item) => !(atLimit && item.id === replaceTargetId)), created]);
    cancelAdd();
    router.refresh();
  }

  return (
    <div className="h-full rounded-xl border border-border/60 bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-section-title">Today&apos;s Priorities</h2>
        {!isAdding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            title={atLimit ? `You already have ${MAX_PRIORITIES} priorities — pick one to replace` : undefined}
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            {atLimit ? 'Replace a priority' : 'Add priority'}
          </Button>
        )}
      </div>

      <ul className="mt-4 space-y-3">
        {items.map((priority) => {
          const isEditing = editing?.id === priority.id;
          return (
            <li key={priority.id} className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => toggleDone(priority)}
                disabled={busy}
                aria-pressed={priority.done}
                aria-label={priority.done ? `Mark "${priority.label}" as not done` : `Mark "${priority.label}" as done`}
                className="relative after:absolute after:-inset-2.5 after:content-[''] max-md:after:-inset-3.5 mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {priority.done ? (
                  <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={editing.draft}
                      onChange={(event) => setEditing({ id: priority.id, draft: event.target.value })}
                      maxLength={200}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveEdit();
                        if (event.key === 'Escape') cancelEdit();
                      }}
                      className="h-7 min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={busy || !editing.draft.trim()}
                      aria-label="Save title"
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      aria-label="Cancel editing"
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <span className={cn('block text-sm', priority.done && 'text-muted-foreground line-through')}>
                    {priority.label}
                  </span>
                )}

                <div className="mt-1">
                  <Select
                    value={priority.projectId ?? NO_PROJECT_VALUE}
                    onValueChange={(value) => {
                      if (!value) return;
                      setProjectFor(priority.id, value === NO_PROJECT_VALUE ? null : value);
                    }}
                  >
                    {/* Compact metadata chip (28 px); the invisible hit area makes it 36 px (44 px below md). */}
                    <SelectTrigger
                      size="sm"
                      aria-label={`Project for "${priority.label}"`}
                      className="relative h-5.5 w-fit gap-1 rounded-full border-none bg-muted px-2 py-0 text-xs font-normal text-muted-foreground after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-muted/70 max-md:after:-inset-y-2 [&_svg]:size-3"
                    >
                      <span className="max-w-32 truncate">{resolvePriorityProjectName(priority, projects)}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!isEditing && (
                <div className="mt-0.5 flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(priority)}
                    aria-label={`Edit "${priority.label}"`}
                    className="relative after:absolute after:-inset-2 after:content-[''] max-md:after:-inset-3 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFromToday(priority)}
                    disabled={busy}
                    aria-label={`Remove "${priority.label}" from today`}
                    className="relative after:absolute after:-inset-2 after:content-[''] max-md:after:-inset-3 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {items.length === 0 && !isAdding && (
        <p className="mt-4 text-sm text-muted-foreground">No priorities yet. Add one, or add a recommended action.</p>
      )}

      {isAdding && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void addOrReplacePriority();
          }}
          className="mt-3 space-y-2"
        >
          {atLimit && (
            <div>
              <label htmlFor="replace-target" className="text-xs text-muted-foreground">
                You already have {MAX_PRIORITIES} priorities — choose one to replace
              </label>
              <Select value={replaceTargetId || undefined} onValueChange={(value) => value && setReplaceTargetId(value)}>
                <SelectTrigger id="replace-target" aria-label="Priority to replace" className="mt-1 w-full">
                  <span className="truncate">
                    {openItems.find((item) => item.id === replaceTargetId)?.label ?? 'Choose a priority to replace…'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {openItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              autoFocus={!atLimit}
              value={addDraftTitle}
              onChange={(event) => setAddDraftTitle(event.target.value)}
              placeholder="New priority…"
              maxLength={200}
              aria-label="New priority"
              className="flex-1"
            />
            <Button type="submit" disabled={busy || !addDraftTitle.trim() || (atLimit && !replaceTargetId)}>
              {atLimit ? 'Replace' : 'Add'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={cancelAdd}
              aria-label={atLimit ? 'Cancel replacing a priority' : 'Cancel adding a priority'}
              className="text-muted-foreground"
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          <Select
            value={addDraftProjectId ?? NO_PROJECT_VALUE}
            onValueChange={(value) => {
              if (!value) return;
              setAddDraftProjectId(value === NO_PROJECT_VALUE ? null : value);
            }}
          >
            <SelectTrigger aria-label="Project for new priority" className="w-fit max-w-full">
              <span className="truncate">{resolvePriorityProjectName({ projectId: addDraftProjectId }, projects)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </form>
      )}
    </div>
  );
}
