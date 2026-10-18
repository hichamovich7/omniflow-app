'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Globe, Pin, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediumSummaryPanel } from '@/components/social/medium-summary-panel';
import { WordPressPostPicker } from '@/components/social/wordpress-post-picker';
import type { MediumArticleOption, MediumPinterestOption, MediumSiteOption } from '@/lib/queries/social-content';
import type { MediumSummaryRequest } from '@/lib/validations/medium-summary';
import { cn } from '@/lib/utils';

export type MediumSourceKind = 'omniflow-article' | 'existing-post' | 'pinterest';

const SOURCES: Array<{ kind: MediumSourceKind; label: string; description: string; icon: typeof Globe }> = [
  {
    kind: 'omniflow-article',
    label: 'From OmniFlow WordPress article',
    description: 'Pick an article written by OmniFlow.',
    icon: FileText,
  },
  {
    kind: 'existing-post',
    label: 'From existing WordPress article',
    description: 'Pick a post already on your WordPress site.',
    icon: Globe,
  },
  {
    kind: 'pinterest',
    label: 'From Pinterest Pins',
    description: 'Pick Pins made from an article — the summary is written from that article.',
    icon: Pin,
  },
];

export const NO_SITE_FOR_MEDIUM_MESSAGE = 'No WordPress site connected yet. Connect one in a project to use your existing posts.';

interface Selected {
  source: MediumSummaryRequest;
  label: string;
}

interface NewMediumSummaryProps {
  articles: MediumArticleOption[];
  sites: MediumSiteOption[];
  pinterest: MediumPinterestOption[];
  /** Reused by "New Facebook post" (TASK-068): same sources, another heading and panel. */
  heading?: string;
  intro?: string;
  testId?: string;
  renderPanel?: (source: MediumSummaryRequest) => ReactNode;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * "New Medium summary" on /medium (TASK-064): choose a source, pick it in
 * place, then generate with the existing panel. Choosing only reads
 * (OmniFlow lists from the server, WordPress search with GET); nothing is
 * generated before "Generate Medium summary". The new summary is saved to
 * the history below, which refreshes.
 */
export function NewMediumSummary({
  articles,
  sites,
  pinterest,
  heading = 'New Medium summary',
  intro = 'Choose the article to summarize. It is only read — never modified — and nothing is published to Medium.',
  testId = 'new-medium-summary',
  renderPanel,
}: NewMediumSummaryProps) {
  const router = useRouter();
  const [kind, setKind] = useState<MediumSourceKind | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [query, setQuery] = useState('');

  const filteredArticles = useMemo(
    () => articles.filter((article) => `${article.title} ${article.projectName}`.toLowerCase().includes(query.trim().toLowerCase())),
    [articles, query]
  );
  const filteredPinterest = useMemo(
    () => pinterest.filter((item) => `${item.keyword} ${item.projectName}`.toLowerCase().includes(query.trim().toLowerCase())),
    [pinterest, query]
  );

  function choose(next: MediumSourceKind) {
    setKind(next);
    setSelected(null);
    setQuery('');
  }

  return (
    <section
      aria-labelledby="new-medium-summary-title"
      className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
      data-testid={testId}
    >
      <h2 id="new-medium-summary-title" className="text-base font-semibold">
        {heading}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{intro}</p>

      <ul className="grid gap-2 sm:grid-cols-3" aria-label="Medium source">
        {SOURCES.map((option) => {
          const disabled = option.kind === 'existing-post' && sites.length === 0;
          const active = kind === option.kind;
          return (
            <li key={option.kind}>
              <button
                type="button"
                onClick={() => !disabled && choose(option.kind)}
                disabled={disabled}
                aria-pressed={active}
                data-source={option.kind}
                className={cn(
                  'block h-full w-full rounded-xl border p-3 text-left transition-colors',
                  disabled
                    ? 'cursor-not-allowed border-dashed border-border bg-muted/40 text-muted-foreground'
                    : active
                      ? 'border-primary bg-selected'
                      : 'border-border hover:bg-muted/60'
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <option.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {disabled ? NO_SITE_FOR_MEDIUM_MESSAGE : option.description}
                </span>
              </button>
              {disabled && (
                <Link href="/projects" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                  Connect a WordPress site
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {selected ? (
        <div className="mt-4 space-y-3" data-testid="new-medium-summary-selected">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Selected:</span>
            <span className="font-medium">{selected.label}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Change
            </Button>
          </div>
          {renderPanel ? (
            <div key={JSON.stringify(selected.source)}>{renderPanel(selected.source)}</div>
          ) : (
            <MediumSummaryPanel key={JSON.stringify(selected.source)} source={selected.source} onGenerated={() => router.refresh()} />
          )}
        </div>
      ) : (
        <>
          {(kind === 'omniflow-article' || kind === 'pinterest') && (
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={kind === 'pinterest' ? 'Filter by keyword or project' : 'Filter by title or project'}
                aria-label="Filter"
                className="pl-9"
              />
            </div>
          )}

          {kind === 'omniflow-article' && (
            <OptionList
              empty={articles.length === 0 ? 'No completed OmniFlow article yet.' : 'No article matches this filter.'}
              items={filteredArticles.map((article) => ({
                id: article.id,
                title: article.title,
                meta: [article.projectName, formatDate(article.createdAt)],
                badge: article.published ? 'Published' : 'Not published',
                onSelect: () => setSelected({ source: { wordpressArticleId: article.id }, label: article.title }),
              }))}
            />
          )}

          {kind === 'pinterest' && (
            <OptionList
              empty={
                pinterest.length === 0
                  ? 'No Pinterest generation made from an article yet. Pins created from a keyword have no article to summarize.'
                  : 'No Pinterest generation matches this filter.'
              }
              items={filteredPinterest.map((item) => ({
                id: item.id,
                title: item.keyword,
                meta: [item.projectName, `${item.pins} Pins`, formatDate(item.createdAt)],
                badge: null,
                onSelect: () => setSelected({ source: { pinterestGenerationId: item.id }, label: `Pins “${item.keyword}”` }),
              }))}
            />
          )}

          {kind === 'existing-post' && sites.length > 0 && (
            <div className="mt-4">
              <WordPressPostPicker
                sites={sites}
                initialSiteId={null}
                onSelectPost={(post) => setSelected({ source: { wordpressPost: { siteId: post.siteId, postId: post.postId } }, label: post.title })}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function OptionList({
  items,
  empty,
}: {
  items: Array<{ id: string; title: string; meta: string[]; badge: string | null; onSelect: () => void }>;
  empty: string;
}) {
  if (items.length === 0) return <p className="mt-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="mt-3 max-h-80 divide-y divide-border/60 overflow-y-auto" data-testid="medium-source-options">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {item.meta.filter(Boolean).join(' · ')}
              {item.badge && <Badge variant={item.badge === 'Published' ? 'success' : 'outline'}>{item.badge}</Badge>}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={item.onSelect}>
            Select
          </Button>
        </li>
      ))}
    </ul>
  );
}
