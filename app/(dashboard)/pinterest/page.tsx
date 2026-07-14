import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { PinForm } from '@/components/pinterest/pin-form';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { Plus, Sparkles } from 'lucide-react';

export default async function PinterestPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, is_default')
    .order('created_at', { ascending: false });

  const { data: boards } = await supabase
    .from('boards')
    .select('id, name, project_id')
    .order('name', { ascending: true });

  const list = projects ?? [];

  return (
    <PageContainer narrow>
      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project before generating pins. Projects help you organize your content."
          icon={Sparkles}
        >
          <Link href="/projects/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      ) : (
        <PinForm projects={list} boards={boards ?? []} />
      )}
    </PageContainer>
  );
}
