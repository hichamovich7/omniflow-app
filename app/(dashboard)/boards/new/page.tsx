import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { BoardForm } from '@/components/boards/board-form';

export default async function NewBoardPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, is_default')
    .order('created_at', { ascending: false });

  return (
    <PageContainer>
      <PageHeader title="New Board" description="Create a new Pinterest board" />
      <BoardForm mode="create" projects={projects ?? []} />
    </PageContainer>
  );
}
