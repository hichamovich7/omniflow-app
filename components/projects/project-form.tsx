'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createProjectSchema, updateProjectSchema } from '@/lib/validations/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ProjectFormProps {
  mode: 'create' | 'edit';
  projectId?: string;
  defaultValues?: {
    name: string;
    description: string | null;
  };
}

export function ProjectForm({ mode, projectId, defaultValues }: ProjectFormProps) {
  const router = useRouter();
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [description, setDescription] = useState(defaultValues?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const schema = mode === 'create' ? createProjectSchema : updateProjectSchema;
    const parsed = schema.safeParse({ name, description: description || null });

    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);

    const url = mode === 'create' ? '/api/projects' : `/api/projects/${projectId}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    const res = await fetch(url, {
      method,
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

    toast.success(mode === 'create' ? 'Project created' : 'Project updated');
    router.push('/projects');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g. Bathroom Blog DE"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Brand Profile (optional)</Label>
        <Textarea
          id="description"
          placeholder="e.g. German Pinterest project for bathroom niche — friendly, cozy tone"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Used as context for all AI-generated content in this project.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/projects')}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === 'create'
              ? 'Creating...'
              : 'Saving...'
            : mode === 'create'
              ? 'Create Project'
              : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
