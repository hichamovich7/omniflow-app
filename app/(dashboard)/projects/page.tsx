import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { buttonVariants } from '@/components/ui/button';
import { PageState } from '@/components/shared/page-state';
import { ResourceHeader } from '@/components/shared/resource-header';
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
      <section className="rounded-2xl border border-border/60 bg-surface px-5 py-6 shadow-sm sm:px-7 sm:py-8">
        <ResourceHeader
          title="Projects"
          metadata={<span>Organize your content, brand profile, and generation history by project.</span>}
          actions={<Link href="/projects/new" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-h-11 px-4')}><Plus className="h-4 w-4" />New Project</Link>}
        />
      </section>

      {list.length === 0 ? (
        <PageState
          variant="empty"
          title="No projects yet"
          description="Projects help you organize your generated content. Create one to get started."
          icon={FolderOpen}
          action={<Link href="/projects/new" className={buttonVariants({ size: 'sm' })}><Plus className="mr-1.5 h-3.5 w-3.5" />New Project</Link>}
        />
      ) : (
        <section className="space-y-3">
          <div><p className="text-label">Workspace</p><h2 className="text-section-title mt-1">Your content projects</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((project) => {
            const generationCount = Array.isArray(project.generations)
              ? project.generations.length
              : 0;
            return <ProjectCard key={project.id} project={project} generationCount={generationCount} />;
          })}
        </div>
        </section>
      )}
    </PageContainer>
  );
}
