import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { ProjectForm } from '@/components/projects/project-form';

export default function NewProjectPage() {
  return (
    <PageContainer narrow>
      <PageHeader title="New Project" description="Create a new project" />
      <ProjectForm mode="create" />
    </PageContainer>
  );
}
