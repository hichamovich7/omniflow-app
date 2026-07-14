'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBoardSchema, updateBoardSchema } from '@/lib/validations/board';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

interface ProjectOption {
  id: string;
  name: string;
  is_default: boolean;
}

interface BoardFormProps {
  mode: 'create' | 'edit';
  boardId?: string;
  projects?: ProjectOption[];
  defaultValues?: {
    name: string;
    projectName: string;
  };
}

export function BoardForm({ mode, boardId, projects, defaultValues }: BoardFormProps) {
  const router = useRouter();
  const defaultProject = projects?.find((p) => p.is_default) ?? projects?.[0];
  const [projectId, setProjectId] = useState(defaultProject?.id ?? '');
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'create') {
      const parsed = createBoardSchema.safeParse({ projectId, name });
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }

      setLoading(true);
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        const message = json.error?.message ?? 'Something went wrong';
        setError(message);
        toast.error(message);
        setLoading(false);
        return;
      }

      toast.success('Board created');
      router.push(`/boards/${json.data.boardId}`);
      router.refresh();
      return;
    }

    const parsed = updateBoardSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/boards/${boardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Something went wrong';
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    toast.success('Board updated');
    router.push(`/boards/${boardId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'create' && projects && (
        <div className="space-y-1.5">
          <Label htmlFor="project">Project</Label>
          <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
            <SelectTrigger id="project" className="w-full">
              <span className="truncate text-sm">
                {projects.find((p) => p.id === projectId)?.name ?? 'Select a project'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {mode === 'edit' && defaultValues && (
        <div className="space-y-1.5">
          <Label>Project</Label>
          <p className="text-sm text-muted-foreground">{defaultValues.projectName}</p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g. Boho Bathroom Ideas"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          disabled={loading}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/boards')}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading || (mode === 'create' && !projectId)}>
          {loading
            ? mode === 'create'
              ? 'Creating...'
              : 'Saving...'
            : mode === 'create'
              ? 'Create Board'
              : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
