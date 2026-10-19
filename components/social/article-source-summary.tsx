import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import { wordpressPostPinterestHref } from '@/lib/social/pin-display';
import type { SupportedLanguage } from '@/types/pinterest';

/**
 * What the Pinterest form shows and pre-fills from a WordPress article
 * (TASK-044 phase 2). The only URL is the verified permalink of an existing
 * post (TASK-071) — shown here and used as the Pins' destination, never sent
 * to the AI.
 */
export interface ArticleFormSource {
  /** OmniFlow article (wordpress_generations.id); null for an existing WordPress post. */
  articleId: string | null;
  /** Existing WordPress post — null for an OmniFlow article. */
  externalPost: { siteId: string; postId: number } | null;
  /** Shown for an existing post: publication date, status and categories. */
  postMeta?: { date: string; status: string; categories: string[] } | null;
  /** Subjects (patterns / projects) detected in the article — what Pins are built from. */
  subjects?: string[];
  projectId: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  seoKeywords: string[];
  language: SupportedLanguage;
  featuredImageUrl: string | null;
  hasBrandProfile: boolean;
  /** Real board of the project pre-selected for this article, if any. */
  suggestedBoardName: string | null;
  /** Name only suggested when no real board matches — never created. */
  boardNameSuggestion: string | null;
  /** Existing post only: its verified public permalink (null = none found). */
  permalink?: string | null;
}

export function ArticleSourceSummary({ source }: { source: ArticleFormSource }) {
  return (
    <section
      aria-labelledby="article-source-heading"
      className="mb-5 flex gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
      data-testid="article-source-summary"
    >
      {source.featuredImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source.featuredImageUrl}
          alt=""
          className="hidden h-24 w-24 shrink-0 rounded-xl border border-border/60 object-cover sm:block"
        />
      ) : (
        <div className="hidden h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-muted sm:flex">
          <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {source.externalPost ? 'Existing WordPress post' : 'Source article'}
        </p>
        <h2 id="article-source-heading" className="text-sm font-semibold leading-snug">
          {source.title}
        </h2>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          <span className="font-medium">Meta:</span> {source.metaTitle} — {source.metaDescription}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{LANGUAGE_LABELS[source.language]}</Badge>
          <Badge variant="outline">Keyword: {source.primaryKeyword}</Badge>
          {source.seoKeywords.slice(0, 5).map((keyword) => (
            <Badge key={keyword} variant="secondary">
              {keyword}
            </Badge>
          ))}
          <Badge variant="outline">{source.hasBrandProfile ? 'Brand Profile used' : 'No Brand Profile'}</Badge>
          {source.postMeta && (
            <>
              <Badge variant="outline">{source.postMeta.status === 'publish' ? 'Published' : source.postMeta.status}</Badge>
              {source.postMeta.date && <Badge variant="outline">{source.postMeta.date.slice(0, 10)}</Badge>}
              {source.postMeta.categories.slice(0, 3).map((category) => (
                <Badge key={category} variant="secondary">
                  {category}
                </Badge>
              ))}
            </>
          )}
        </div>
        {source.subjects && source.subjects.length > 0 && (
          <p className="line-clamp-3 text-xs text-muted-foreground" data-testid="article-source-subjects">
            <span className="font-medium">
              {source.subjects.length} subject{source.subjects.length > 1 ? 's' : ''} in the article — each Pin shows one of them:
            </span>{' '}
            {source.subjects.join(' · ')}
          </p>
        )}
        {source.externalPost && (
          source.permalink ? (
            <p className="truncate text-xs text-muted-foreground" data-testid="article-source-permalink">
              <span className="font-medium">Destination URL:</span>{' '}
              <a href={source.permalink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {source.permalink}
              </a>{' '}
              — used for every Pin unless you enter another one below.
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="article-source-permalink-missing">
              No public link was found for this post (not published yet, or its link could not be verified). The
              Pins will be saved without a destination URL unless you enter one below.
            </p>
          )
        )}
        <p className="text-xs text-muted-foreground">
          The article is only read, never modified.{' '}
          {source.externalPost ? '' : 'Add a destination URL below if you want one on the Pins. '}
          {source.articleId ? (
            <Link href={`/wordpress/${source.articleId}`} className="text-primary hover:underline">
              Back to article
            </Link>
          ) : source.externalPost ? (
            <Link href={wordpressPostPinterestHref({ siteId: source.externalPost.siteId })} className="text-primary hover:underline">
              Choose another post
            </Link>
          ) : null}
        </p>
      </div>
    </section>
  );
}
