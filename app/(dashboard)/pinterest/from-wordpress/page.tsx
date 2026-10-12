import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle, Globe } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { PinForm } from '@/components/pinterest/pin-form';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { ArticlePinResults } from '@/components/social/article-pin-results';
import { WordPressPostPicker, type PickerSite } from '@/components/social/wordpress-post-picker';
import type { ArticleFormSource } from '@/components/social/article-source-summary';
import type { ContentStreamOption } from '@/components/social/article-board-picker';
import {
  articlePinterestKeyword,
  SocialGenerationError,
  suggestBoardForArticle,
} from '@/lib/social/pinterest-from-article';
import {
  loadWordPressPostPinterestSource,
  type WordPressPostPinterestSource,
} from '@/lib/social/pinterest-from-wordpress-post';
import { WordPressReadError } from '@/lib/wordpress/post-reader';
import { subjectSections } from '@/lib/wordpress/article-context';
import { wordpressPostSourceSchema } from '@/lib/validations/wordpress-post-source';
import { wordpressPostPinterestHref } from '@/lib/social/pin-display';
import { getGenerationWithPins } from '@/lib/queries/generations';
import { isValidUuid } from '@/lib/utils/uuid';
import { cn } from '@/lib/utils';
import { PinterestSourceChooser } from '@/components/pinterest/pinterest-source-chooser';
import { MediumSummaryPanel } from '@/components/social/medium-summary-panel';

/**
 * Pinterest from an existing WordPress post (Volet A):
 * /pinterest/from-wordpress                    → pick a site, search, select
 * /pinterest/from-wordpress?siteId=&postId=    → summary + the existing form
 * …&generationId=                              → the saved Pins below the form
 * Loading reads WordPress (GET) only; nothing is generated before "Generate Pins"
 * (or "Generate Medium summary", TASK-062 — same post, not saved, never published).
 */
export default async function PinterestFromWordPressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : null);
  const siteId = value('siteId');
  const postId = value('postId');
  const generationId = value('generationId');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Public columns only — the encrypted password never leaves the server.
  const { data: siteRows } = await supabase
    .from('wordpress_sites')
    .select('id, site_url, project_id, projects(name)')
    .eq('user_id', user.id);
  const sites: PickerSite[] = ((siteRows ?? []) as unknown as Array<{ id: string; site_url: string; projects: { name: string } | null }>).map(
    (row) => ({ id: row.id, siteUrl: row.site_url, projectName: row.projects?.name ?? 'Project' })
  );

  if (sites.length === 0) {
    return (
      <PageContainer narrow>
        <EmptyState
          title="No WordPress site connected"
          description="Connect a WordPress site to a project first. Its existing posts can then be turned into Pins."
          icon={Globe}
        >
          <Link href="/projects" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Connect a WordPress site
          </Link>
        </EmptyState>
      </PageContainer>
    );
  }

  const parsedSource = wordpressPostSourceSchema.safeParse({ siteId, postId });
  if (!parsedSource.success) {
    return (
      <PageContainer narrow>
        <div className="mb-5 space-y-1 pt-4 sm:pt-6">
          <h1 className="text-xl font-semibold">Pinterest from a WordPress post</h1>
          <p className="text-sm text-muted-foreground">
            Choose an article already published on one of your connected sites. It is only read — never modified — and no
            destination link is added to the Pins.
          </p>
        </div>
        <PinterestSourceChooser active="existing-post" hasWordPressSite />
        <WordPressPostPicker sites={sites} initialSiteId={siteId && isValidUuid(siteId) ? siteId : null} />
      </PageContainer>
    );
  }

  let article: WordPressPostPinterestSource;
  try {
    article = await loadWordPressPostPinterestSource(supabase, user.id, parsedSource.data);
  } catch (err) {
    if (!(err instanceof SocialGenerationError) && !(err instanceof WordPressReadError)) throw err;
    return (
      <PageContainer narrow>
        <EmptyState title="This post can't be used" description={err.message} icon={AlertCircle}>
          <Link
            href={wordpressPostPinterestHref({ siteId: parsedSource.data.siteId })}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Choose another post
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
    articleId: null,
    externalPost: { siteId: parsedSource.data.siteId, postId: parsedSource.data.postId },
    postMeta: { date: article.post.date, status: article.post.status, categories: article.post.categories },
    subjects: subjectSections(article.context).map((section) => section.subject),
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
        sourceChooser={<PinterestSourceChooser active="existing-post" hasWordPressSite />}
      />
      {result?.generation && result.pins.length > 0 && (
        <ArticlePinResults
          pins={result.pins}
          generationId={result.generation.id}
          regenerateSource={{ wordpressPost: parsedSource.data }}
          boardNames={result.boardNames}
          imagesProcessing={result.generation.image_status === 'processing'}
        />
      )}
      <section
        aria-labelledby="medium-summary-title"
        className="mt-6 rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
        data-testid="medium-summary-section"
      >
        <h2 id="medium-summary-title" className="text-base font-semibold">
          Medium summary
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          A short summary of this post for Medium, ending with a link to it. Nothing is saved or published, and the post is
          never modified.
        </p>
        <MediumSummaryPanel source={{ wordpressPost: parsedSource.data }} />
      </section>
    </PageContainer>
  );
}
