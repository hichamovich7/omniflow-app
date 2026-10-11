'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { wordpressPostPinterestHref } from '@/lib/social/pin-display';
import { cn } from '@/lib/utils';
import type { WordPressPostListItem } from '@/lib/wordpress/post-reader';

export interface PickerSite {
  id: string;
  siteUrl: string;
  projectName: string;
}

type StatusFilter = 'publish' | 'draft';

const STATUS_LABELS: Record<string, string> = {
  publish: 'Published',
  draft: 'Draft',
  future: 'Scheduled',
  pending: 'Pending',
  private: 'Private',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Pinterest from an existing WordPress post — step 1: pick a connected site,
 * search its posts by title or keyword, choose one. Searching only reads
 * WordPress (GET); choosing a post opens the summary + form, nothing is
 * generated until "Generate Pins".
 */
export function WordPressPostPicker({ sites, initialSiteId }: { sites: PickerSite[]; initialSiteId: string | null }) {
  const [siteId, setSiteId] = useState(initialSiteId && sites.some((s) => s.id === initialSiteId) ? initialSiteId : sites[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('publish');
  const [posts, setPosts] = useState<WordPressPostListItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage: number) {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ search, status, page: String(nextPage) });
      const res = await fetch(`/api/wordpress/sites/${siteId}/posts?${params.toString()}`);
      const json = (await res.json().catch(() => null)) as
        | { data: { posts: WordPressPostListItem[]; hasMore: boolean } | null; error: { message: string } | null }
        | null;
      if (!res.ok || !json?.data) {
        setError(json?.error?.message ?? 'Could not search this WordPress site.');
        if (nextPage === 1) setPosts([]);
        return;
      }
      setPosts(nextPage === 1 ? json.data.posts : [...(posts ?? []), ...json.data.posts]);
      setPage(nextPage);
      setHasMore(json.data.hasMore);
    } catch {
      setError('Could not search this WordPress site.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm" data-testid="wordpress-post-picker">
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void load(1);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="wp-site">WordPress site</Label>
          <Select
            value={siteId}
            onValueChange={(value) => {
              if (!value) return;
              setSiteId(value);
              setPosts(null);
              setError(null);
            }}
          >
            <SelectTrigger id="wp-site" className="w-full">
              <span className="truncate text-sm">
                {(() => {
                  const site = sites.find((s) => s.id === siteId);
                  return site ? `${site.projectName} — ${site.siteUrl.replace(/^https?:\/\//, '')}` : 'Select';
                })()}
              </span>
            </SelectTrigger>
            <SelectContent>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.projectName} — {site.siteUrl.replace(/^https?:\/\//, '')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-search">Title or keyword</Label>
          <Input
            id="wp-search"
            value={search}
            maxLength={100}
            placeholder="e.g. crochet scarf"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-status">Status</Label>
          <Select value={status} onValueChange={(value) => value && setStatus(value as StatusFilter)}>
            <SelectTrigger id="wp-status" className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="publish">Published</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={!siteId || loading}>
          {loading && page === 1 ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
          Search
        </Button>
      </form>

      <p className="mt-3 text-xs text-muted-foreground">
        Posts are only read from WordPress — never modified. Drafts are listed only when the connected account can edit posts.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {posts && posts.length === 0 && !error && (
        <p className="mt-4 text-sm text-muted-foreground">No post matches this search.</p>
      )}

      {posts && posts.length > 0 && (
        <ul className="mt-4 divide-y divide-border/60" aria-label="WordPress posts">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center gap-3 py-3">
              {post.featuredImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.featuredImage.url} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-border/60 object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">{post.title}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {post.date && <span>{formatDate(post.date)}</span>}
                  <Badge variant={post.status === 'publish' ? 'success' : 'outline'}>{STATUS_LABELS[post.status] ?? post.status}</Badge>
                  {post.categories.slice(0, 2).map((category) => (
                    <Badge key={category} variant="secondary">
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>
              <Link
                href={wordpressPostPinterestHref({ siteId, postId: post.id })}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
              >
                Select
              </Link>
            </li>
          ))}
        </ul>
      )}

      {posts && hasMore && (
        <Button type="button" variant="outline" size="sm" className="mt-3" disabled={loading} onClick={() => void load(page + 1)}>
          {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Load more
        </Button>
      )}
    </section>
  );
}
