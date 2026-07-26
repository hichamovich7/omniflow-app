import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { ArticleForm } from '@/components/wordpress/article-form';
import { PinsSourceArticleForm } from '@/components/wordpress/pins-source-article-form';
import { getActivePinImageUrls } from '@/lib/queries/pin-images';
import { listWordPressCategories } from '@/lib/queries/wordpress-categories';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus, FileText, ImageOff } from 'lucide-react';
import type { Pin } from '@/types/database';

interface WordPressPageProps {
  searchParams: Promise<{ pinIds?: string }>;
}

export default async function WordPressPage({ searchParams }: WordPressPageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  if (params.pinIds) {
    const pinIds = params.pinIds.split(',').filter(Boolean);

    const { data: pinsData } = await supabase
      .from('pins')
      .select('*')
      .in('id', pinIds)
      .order('created_at', { ascending: true });

    const pins = (pinsData ?? []) as Pin[];

    if (pins.length === 0) {
      return (
        <PageContainer narrow>
          <EmptyState
            title="No pins found"
            description="The selected pins couldn't be loaded. Go back to your Pinterest generation and select pins again."
            icon={ImageOff}
          >
            <Link href="/pinterest" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Back to Pinterest
            </Link>
          </EmptyState>
        </PageContainer>
      );
    }

    const imageUrlByPinId = await getActivePinImageUrls(supabase, pins.map((p) => p.id));

    const { data: sourceGeneration } = await supabase
      .from('generations')
      .select('project_id')
      .eq('id', pins[0].generation_id)
      .single();

    const categories = sourceGeneration
      ? await listWordPressCategories(supabase, sourceGeneration.project_id)
      : [];

    return (
      <PageContainer narrow>
        <PinsSourceArticleForm
          pins={pins.map((p) => ({
            id: p.id,
            title: p.title,
            imageUrl: imageUrlByPinId.get(p.id) ?? p.media_url,
          }))}
          projectId={sourceGeneration?.project_id ?? ''}
          categories={categories}
        />
      </PageContainer>
    );
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, is_default, default_language')
    .order('created_at', { ascending: false });

  const list = projects ?? [];

  const { data: categoriesData } =
    list.length > 0
      ? await supabase
          .from('wordpress_categories')
          .select('*')
          .in('project_id', list.map((p) => p.id))
          .order('name')
      : { data: [] };

  return (
    <PageContainer narrow>
      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project before generating an article. Projects help you organize your content."
          icon={FileText}
        >
          <Link href="/projects/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      ) : (
        <ArticleForm projects={list} categories={categoriesData ?? []} />
      )}
    </PageContainer>
  );
}
