'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteProjectDialog } from './delete-project-dialog';

interface ProjectActionsProps {
  projectId: string;
  projectName: string;
  isDefault: boolean;
}

export function ProjectActions({ projectId, projectName, isDefault }: ProjectActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleSetDefault() {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to set default project');
      return;
    }

    toast.success('Default project updated');
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/projects/${projectId}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {!isDefault && (
            <DropdownMenuItem onClick={handleSetDefault}>
              <Star className="mr-2 h-4 w-4" />
              Set as Default
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteProjectDialog
        projectId={projectId}
        projectName={projectName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
