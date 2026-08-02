import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getWordPressArticleByGenerationId } from '@/lib/queries/wordpress';
import { getWordPressSiteByProjectId } from '@/lib/queries/wordpress-sites';
import { createClient } from '@/lib/supabase/server';
import { exportToMarkdown, exportToHtml, getMetaTitle } from '@/lib/wordpress/export';
import { PageContainer } from '@/components/ui/page-container';
import { ArticleContent } from '@/components/wordpress/article-content';
import { CopyExportButtons } from '@/components/wordpress/copy-export-buttons';
import { PublishControl } from '@/components/wordpress/publish-control';
import { WpSendStatusBadge } from '@/components/wordpress/wp-send-status-badge';
import { ArticleCategoryEditor } from '@/components/wordpress/article-category-editor';
import { Badge } from '@/components/ui/badge';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { ArrowLeft, FileText } from 'lucide-react';
import { timeAgo } from '@/lib/utils/format-date';
import { statusToBadgeVariant } from '@/lib/utils/status';

export default async function WordPressArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { generation, article, images } = await getWordPressArticleByGenerationId(supabase, id);

  if (!generation) {
    redirect('/wordpress');
  }

  const wordpressSite = await getWordPressSiteByProjectId(supabase, generation.project_id);

  const { data: categories } = await supabase
    .from('wordpress_categories')
    .select('id, project_id, name, wp_category_id')
    .eq('project_id', generation.project_id)
    .order('name');

  const langLabel = LANGUAGE_LABELS[generation.language as SupportedLanguage] ?? generation.language;

  return (
    <PageContainer>
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link
            href="/wordpress"
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
            aria-label="Back to generator"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="space-y-0.5">
            <h1 className="text-xl font-semibold tracking-tight">{generation.keyword}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              <span>{langLabel}</span>
              {article && (
                <>
                  <span className="text-border">·</span>
                  <span>{article.word_count} words</span>
                </>
              )}
              <span className="text-border">·</span>
              <span>{timeAgo(generation.created_at)}</span>
              <Badge variant={statusToBadgeVariant(generation.status)} className="ml-0.5">
                {generation.status}
              </Badge>
            </div>
            {article && <WpSendStatusBadge article={article} siteUrl={wordpressSite?.site_url} />}
          </div>
        </div>
      </div>

      {/* Article */}
      {article ? (
        <div className="space-y-6">
          {wordpressSite ? (
            <PublishControl generationId={id} article={article} wordpressSite={wordpressSite} />
          ) : (
            <CopyExportButtons
              markdown={exportToMarkdown(article)}
              html={exportToHtml(article)}
              filename={`${article.slug}.md`}
            />
          )}

          <ArticleCategoryEditor
            generationId={id}
            projectId={generation.project_id}
            categories={categories ?? []}
            initialCategoryId={article.category_id}
            hasWpPostId={!!article.wp_post_id}
          />

          {article.featured_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.featured_image_url}
              alt={article.title}
              className="w-full rounded-2xl border border-border/60"
            />
          )}

          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
            <p className="text-xs text-muted-foreground/80">
              <span className="font-medium">Meta title:</span> {getMetaTitle(article)}
            </p>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">{article.meta_description}</p>
            <ArticleContent html={exportToHtml(article)} />
          </div>

          {images.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {images.filter((img) => img.url).length} of {images.length} internal images generated.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 py-20 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No article generated</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            This generation didn&apos;t produce an article. Try generating again.
          </p>
        </div>
      )}
    </PageContainer>
  );
}
