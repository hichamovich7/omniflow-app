import { PageHeader } from '@/components/layout/page-header';
import { ProjectForm } from '@/components/projects/project-form';

export default function NewProjectPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New Project" description="Create a new project" />
      <ProjectForm mode="create" />
    </div>
  );
}
