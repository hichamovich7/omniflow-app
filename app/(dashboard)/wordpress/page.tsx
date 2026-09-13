import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { PinsSourceArticleForm } from '@/components/wordpress/pins-source-article-form';
import { getActivePinImageUrls } from '@/lib/queries/pin-images';
import { listWordPressCategories } from '@/lib/queries/wordpress-categories';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileText, ImageOff, Layers, LayoutTemplate, RefreshCw } from 'lucide-react';
import type { Pin } from '@/types/database';

interface WordPressPageProps {
  searchParams: Promise<{ pinIds?: string }>;
}

interface GeneratorCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}

const GENERATOR_CARDS: GeneratorCard[] = [
  {
    title: '1-Click Blog Post',
    description: 'Generate a full SEO article from a keyword or an external source, with a featured image and internal images.',
    icon: FileText,
    href: '/wordpress/blog-post',
  },
  {
    title: 'Bulk Article Generation',
    description: 'Generate several articles at once from a list of keywords.',
    icon: Layers,
  },
  {
    title: 'Super Page',
    description: 'Build a long-form pillar page covering a topic in full depth.',
    icon: LayoutTemplate,
  },
  {
    title: 'Rewriter Tool',
    description: 'Rewrite and refresh an existing article.',
    icon: RefreshCw,
  },
];

function GeneratorCardItem({ card }: { card: GeneratorCard }) {
  const Icon = card.icon;

  if (!card.href) {
    return (
      <div
        aria-disabled="true"
        className="relative flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-5 opacity-60 cursor-not-allowed"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-4.5 w-4.5 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground/70">{card.title}</p>
          <p className="mt-1 text-xs text-muted-foreground/50">{card.description}</p>
        </div>
        <span className="absolute right-4 top-4 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/40">
          Soon
        </span>
      </div>
    );
  }

  return (
    <Link
      href={card.href}
      className="group relative flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium">{card.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.description}</p>
      </div>
    </Link>
  );
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

  return (
    <PageContainer>
      <div className="pt-8 sm:pt-16">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">WordPress Generator</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Choose how you want to create your next WordPress article.
          </p>
        </div>

        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {GENERATOR_CARDS.map((card) => (
            <GeneratorCardItem key={card.title} card={card} />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
