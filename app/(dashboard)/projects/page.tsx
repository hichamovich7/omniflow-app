import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { ProjectActions } from '@/components/projects/project-actions';
import { Plus, FolderOpen } from 'lucide-react';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function ProjectsPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from('projects')
    .select('*, generations(id)')
    .order('created_at', { ascending: false });

  const list = projects ?? [];

  return (
    <PageContainer>
      <PageHeader title="Projects" description="Organize your content by project">
        <Link href="/projects/new" className={buttonVariants({ size: 'sm' })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Project
        </Link>
      </PageHeader>

      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Projects help you organize your generated content. Create one to get started."
          icon={FolderOpen}
        >
          <Link href="/projects/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Project
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((project) => {
            const generationCount = Array.isArray(project.generations)
              ? project.generations.length
              : 0;
            return (
              <div
                key={project.id}
                className="group relative rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-border"
              >
                <div className="absolute right-3 top-3">
                  <ProjectActions
                    projectId={project.id}
                    projectName={project.name}
                    isDefault={project.is_default}
                  />
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 pr-6">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    {project.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{generationCount} generation{generationCount !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{timeAgo(project.created_at)}</span>
                  {project.is_default && (
                    <>
                      <span>·</span>
                      <span className="text-primary font-medium">Default</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
