import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { ProjectForm } from '@/components/projects/project-form';

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!project) {
    redirect('/projects');
  }

  return (
    <PageContainer narrow>
      <PageHeader title="Edit Project" description="Update project details" />
      <ProjectForm
        mode="edit"
        projectId={project.id}
        defaultValues={{
          name: project.name,
          description: project.description,
          niche: project.niche,
          default_language: project.default_language,
        }}
      />
    </PageContainer>
  );
}
