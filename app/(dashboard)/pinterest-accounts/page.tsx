import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FolderOpen, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { countAccountStructure, loadPinterestStructure } from '@/lib/queries/pinterest-accounts';
import { PinterestAccountsManager, type AccountView } from '@/components/pinterest-accounts/pinterest-accounts-manager';

/**
 * TASK-091: Pinterest accounts of one project, with their boards and
 * sections. Project → Pinterest Account → Content Stream → Board → Section → Pin.
 */
export default async function PinterestAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: projects } = await supabase.from('projects').select('id, name, is_default').order('name');
  const projectList = (projects ?? []) as { id: string; name: string; is_default: boolean }[];

  if (projectList.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Pinterest Accounts" description="Project → Pinterest Account → Content Stream → Board → Section" />
        <EmptyState title="No projects yet" description="Pinterest accounts belong to a project. Create a project first." icon={FolderOpen}>
          <Link href="/projects/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      </PageContainer>
    );
  }

  const project =
    projectList.find((p) => p.id === params.project) ?? projectList.find((p) => p.is_default) ?? projectList[0];
  const structure = await loadPinterestStructure(supabase, [project.id]);

  const accounts: AccountView[] = structure.accounts.map((account) => ({
    account,
    counts: countAccountStructure(structure, account.id),
    streamNames: structure.streams
      .filter((stream) => stream.pinterest_account_id === account.id && stream.status !== 'archived')
      .map((stream) => stream.name),
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Pinterest Accounts"
        description="Project → Pinterest Account → Content Stream → Board → Section. Entered by hand — no Pinterest login."
      />

      {projectList.length > 1 && (
        <nav aria-label="Project" className="flex flex-wrap gap-1.5">
          {projectList.map((p) => (
            <Link
              key={p.id}
              href={`/pinterest-accounts?project=${p.id}`}
              aria-current={p.id === project.id ? 'page' : undefined}
              className={cn(buttonVariants({ variant: p.id === project.id ? 'default' : 'outline', size: 'sm' }), 'max-w-full truncate')}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      <PinterestAccountsManager projectId={project.id} accounts={accounts} boards={structure.boards} />
    </PageContainer>
  );
}
