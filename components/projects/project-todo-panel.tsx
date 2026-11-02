'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { sendJson } from '@/components/pinterest-accounts/structure-dialogs';
import { useProjectDialogs } from '@/components/projects/project-dialogs';
import { draftFromCategory, type TodoItem } from '@/lib/projects/project-dashboard';

const KIND_LABELS: Record<TodoItem['kind'], { title: string; hint: string }> = {
  board_without_account: { title: 'Board without account', hint: 'Legacy board. Attach it to its Pinterest account:' },
  stream_without_account: { title: 'Stream without account', hint: 'Works as legacy. Link it to an account (its legacy boards follow):' },
  stream_without_category: { title: 'Stream without WordPress category', hint: 'Choose the category its articles go to:' },
  category_without_stream: { title: 'Category without stream', hint: 'Its articles feed no Pinterest stream yet.' },
};

/**
 * TASK-092: what is not linked yet, each with an explicit fix — never applied
 * automatically. Writes go through the existing routes (boards, content
 * streams), which re-check ownership and the account rules.
 */
export function ProjectTodoPanel({
  todos,
  accounts,
  categories,
  legacyBoardsByStream,
}: {
  todos: TodoItem[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  /** Stream id → its boards that have no account yet (moved with the stream). */
  legacyBoardsByStream: Record<string, string[]>;
}) {
  const router = useRouter();
  const dialogs = useProjectDialogs();
  const [busy, setBusy] = useState<string | null>(null);
  const [categoryChoice, setCategoryChoice] = useState<Record<string, string>>({});

  async function run(key: string, steps: { url: string; body: unknown }[], success: string) {
    setBusy(key);
    for (const step of steps) {
      const result = await sendJson(step.url, 'PATCH', step.body);
      if (!result.ok) {
        setBusy(null);
        toast.error(result.message);
        router.refresh();
        return;
      }
    }
    setBusy(null);
    toast.success(success);
    router.refresh();
  }

  if (todos.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-success/25 bg-success-soft p-4 text-sm" data-testid="todo-empty">
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
        Everything is linked.
      </div>
    );
  }

  return (
    <ul className="space-y-2.5" data-testid="todo-list">
      {todos.map((todo) => {
        const key = `${todo.kind}:${todo.id}`;
        const label = KIND_LABELS[todo.kind];
        const disabled = busy === key;
        return (
          <li key={key} className="space-y-2 rounded-2xl border border-warning/25 bg-warning-soft p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">{label.title}</p>
            <p className="text-sm font-medium">{todo.name}</p>
            <p className="text-xs text-muted-foreground">{label.hint}</p>

            {(todo.kind === 'board_without_account' || todo.kind === 'stream_without_account') && (
              <div className="flex flex-wrap gap-1.5">
                {accounts.length === 0 && (
                  <Button type="button" size="xs" variant="outline" onClick={dialogs.createAccount}>
                    Add a Pinterest account first
                  </Button>
                )}
                {accounts.map((account) => (
                  <Button
                    key={account.id}
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      todo.kind === 'board_without_account'
                        ? run(key, [{ url: `/api/boards/${todo.id}`, body: { pinterestAccountId: account.id } }], `"${todo.name}" attached to ${account.name}`)
                        : run(
                            key,
                            [
                              ...(legacyBoardsByStream[todo.id] ?? []).map((boardId) => ({
                                url: `/api/boards/${boardId}`,
                                body: { pinterestAccountId: account.id },
                              })),
                              { url: `/api/content-streams/${todo.id}`, body: { pinterestAccountId: account.id } },
                            ],
                            `"${todo.name}" linked to ${account.name}`
                          )
                    }
                  >
                    → {account.name}
                  </Button>
                ))}
              </div>
            )}

            {todo.kind === 'stream_without_category' && (
              <div className="flex flex-wrap gap-1.5">
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No WordPress category in this project yet.</p>
                ) : (
                  <>
                    <Select value={categoryChoice[todo.id] ?? ''} onValueChange={(v) => v && setCategoryChoice((c) => ({ ...c, [todo.id]: v }))}>
                      <SelectTrigger className="h-8 min-w-0 flex-1 bg-card" aria-label={`WordPress category for "${todo.name}"`}>
                        <span className="truncate text-xs">{categories.find((c) => c.id === categoryChoice[todo.id])?.name ?? 'Choose a category'}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="xs"
                      disabled={disabled || !categoryChoice[todo.id]}
                      onClick={() =>
                        run(
                          key,
                          [{ url: `/api/content-streams/${todo.id}`, body: { wordpressCategoryId: categoryChoice[todo.id] } }],
                          `Category linked to "${todo.name}"`
                        )
                      }
                    >
                      Link
                    </Button>
                  </>
                )}
              </div>
            )}

            {todo.kind === 'category_without_stream' && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => dialogs.createStream(draftFromCategory({ id: todo.id, name: todo.name }))}
              >
                Create a stream for it
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
