import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProjectCard } from '@/components/projects/project-card';
import { Plus, FolderOpen } from 'lucide-react';

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
            return <ProjectCard key={project.id} project={project} generationCount={generationCount} />;
          })}
        </div>
      )}
    </PageContainer>
  );
}
