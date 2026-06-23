import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProjectActions } from '@/components/projects/project-actions';
import { Plus } from 'lucide-react';

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  const list = projects ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="Manage your projects">
        <Link href="/projects/new" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Link>
      </PageHeader>

      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project to get started"
        >
          <Link href="/projects/new" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </EmptyState>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {project.name}
                      {project.is_default && <Badge variant="secondary">Default</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(project.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>
                    <ProjectActions
                      projectId={project.id}
                      projectName={project.name}
                      isDefault={project.is_default}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
