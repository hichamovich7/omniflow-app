import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { PinForm } from '@/components/pinterest/pin-form';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default async function PinterestPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, is_default')
    .order('created_at', { ascending: false });

  const list = projects ?? [];

  return (
    <PageContainer>
      <PageHeader title="Pinterest Generator" description="Generate optimized Pinterest content" />

      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project before generating pins."
        >
          <Link href="/projects/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      ) : (
        <PinForm projects={list} />
      )}
    </PageContainer>
  );
}
