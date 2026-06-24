import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
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
    <div className="space-y-6">
      <PageHeader title="Pinterest Generator" description="Generate optimized Pinterest content" />

      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project before generating pins"
        >
          <Link href="/projects/new" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Link>
        </EmptyState>
      ) : (
        <PinForm projects={list} />
      )}
    </div>
  );
}
