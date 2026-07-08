import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { BoardForm } from '@/components/boards/board-form';

export default async function EditBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: board } = await supabase
    .from('boards')
    .select('*, projects(name)')
    .eq('id', id)
    .single();

  if (!board) {
    redirect('/boards');
  }

  const projectName = Array.isArray(board.projects) ? board.projects[0]?.name : board.projects?.name;

  return (
    <PageContainer>
      <PageHeader title="Edit Board" description="Update board details" />
      <BoardForm
        mode="edit"
        boardId={board.id}
        defaultValues={{
          name: board.name,
          projectName: projectName ?? 'No project',
        }}
      />
    </PageContainer>
  );
}
