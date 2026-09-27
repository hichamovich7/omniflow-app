import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { PinForm } from '@/components/pinterest/pin-form';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { ArticlePinResults } from '@/components/social/article-pin-results';
import type { ArticleFormSource } from '@/components/social/article-source-summary';
import type { ContentStreamOption } from '@/components/social/article-board-picker';
import {
  articlePinterestKeyword,
  loadArticlePinterestSource,
  SocialGenerationError,
  suggestBoardForArticle,
  type ArticlePinterestSource,
} from '@/lib/social/pinterest-from-article';
import { getGenerationWithPins } from '@/lib/queries/generations';
import { isValidUuid } from '@/lib/utils/uuid';
import { cn } from '@/lib/utils';

/**
 * Social Content Studio phase 2 (TASK-044): the Pinterest form pre-filled
 * from a WordPress article — /pinterest/create?source=wordpress&articleId=<id>.
 * Nothing is generated on load. After Generate Pins the saved generation is
 * shown below the form (&generationId=<id>).
 */
export default async function PinterestCreatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const source = typeof params.source === 'string' ? params.source : null;
  const articleId = typeof params.articleId === 'string' ? params.articleId : null;
  const generationId = typeof params.generationId === 'string' ? params.generationId : null;

  if (source !== 'wordpress' || !articleId || !isValidUuid(articleId)) {
    redirect('/pinterest');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  let article: ArticlePinterestSource;
  try {
    article = await loadArticlePinterestSource(supabase, user.id, articleId);
  } catch (err) {
    if (!(err instanceof SocialGenerationError)) throw err;
    return (
      <PageContainer narrow>
        <EmptyState title="This article can't be used" description={err.message} icon={AlertCircle}>
          <Link href="/wordpress" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Back to WordPress
          </Link>
        </EmptyState>
      </PageContainer>
    );
  }

  const [{ data: project }, { data: boards }, { data: streams }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, is_default, default_language, niche')
      .eq('id', article.projectId)
      .single(),
    supabase
      .from('boards')
      .select('id, name, project_id')
      .eq('project_id', article.projectId)
      .order('name', { ascending: true }),
    supabase
      .from('content_streams')
      .select('id, name, status, content_stream_boards(board_id)')
      .eq('project_id', article.projectId)
      .neq('status', 'archived')
      .order('name', { ascending: true }),
  ]);

  if (!project) {
    redirect('/pinterest');
  }

  const boardList = boards ?? [];
  const contentStreams: ContentStreamOption[] = (
    (streams ?? []) as Array<{ id: string; name: string; content_stream_boards: Array<{ board_id: string }> | null }>
  ).map((stream) => ({
    id: stream.id,
    name: stream.name,
    boardIds: (stream.content_stream_boards ?? []).map((link) => link.board_id),
  }));

  const suggestion = suggestBoardForArticle(boardList, article);
  const formSource: ArticleFormSource = {
    articleId: article.articleId,
    projectId: article.projectId,
    title: article.title,
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    primaryKeyword: articlePinterestKeyword(article),
    seoKeywords: article.seoKeywords,
    language: article.language,
    featuredImageUrl: article.featuredImageUrl,
    hasBrandProfile: Boolean(article.brandProfileDescription?.trim()),
    suggestedBoardName: boardList.find((b) => b.id === suggestion.boardId)?.name ?? null,
    boardNameSuggestion: suggestion.suggestedName,
  };

  // The saved generation, only if it is the user's and from this project.
  let result: Awaited<ReturnType<typeof getGenerationWithPins>> | null = null;
  if (generationId && isValidUuid(generationId)) {
    const loaded = await getGenerationWithPins(supabase, generationId);
    if (loaded.generation && loaded.generation.user_id === user.id && loaded.generation.project_id === article.projectId) {
      result = loaded;
    }
  }

  return (
    <PageContainer narrow>
      <PinForm
        projects={[project]}
        boards={boardList}
        articleSource={formSource}
        contentStreams={contentStreams}
      />
      {result?.generation && result.pins.length > 0 && (
        <ArticlePinResults
          pins={result.pins}
          generationId={result.generation.id}
          articleId={article.articleId}
          boardNames={result.boardNames}
          imagesProcessing={result.generation.image_status === 'processing'}
        />
      )}
    </PageContainer>
  );
}
