import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProjectActions } from '@/components/projects/project-actions';
import { Plus, FolderOpen } from 'lucide-react';
import { timeAgo } from '@/lib/utils/format-date';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

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
        <Link href="/projects/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((project) => {
            const generationCount = Array.isArray(project.generations)
              ? project.generations.length
              : 0;
            return (
              <div
                key={project.id}
                className="group relative rounded-2xl border border-border/60 bg-card p-6 transition-colors hover:border-border"
              >
                <div className="absolute right-4 top-4">
                  <ProjectActions
                    projectId={project.id}
                    projectName={project.name}
                    isDefault={project.is_default}
                  />
                </div>
                <div className="flex items-start gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 pr-8">
                    <p className="truncate text-base font-semibold tracking-tight">{project.name}</p>
                    {project.niche && (
                      <span className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {project.niche}
                      </span>
                    )}
                  </div>
                </div>
                {project.description && (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                  <span>{generationCount} generation{generationCount !== 1 ? 's' : ''}</span>
                  <span className="text-border">·</span>
                  <span>{timeAgo(project.created_at)}</span>
                  {project.default_language && (
                    <>
                      <span className="text-border">·</span>
                      <span>
                        {LANGUAGE_LABELS[project.default_language as SupportedLanguage] ?? project.default_language}
                      </span>
                    </>
                  )}
                  {project.is_default && (
                    <>
                      <span className="text-border">·</span>
                      <span className="font-medium text-primary">Default</span>
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
