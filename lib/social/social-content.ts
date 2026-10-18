import { z } from 'zod';
import type { MediumSummaryRequest } from '@/lib/validations/medium-summary';

/**
 * Saved social content (TASK-063, table social_content_generations,
 * migration 045). Client-safe: types and pure helpers only.
 *
 * Every platform of the table is declared here so the next generators
 * (Instagram, Reels, TikTok) plug into the same history; Medium (TASK-063)
 * and Facebook (TASK-068) have a generator and a page today.
 */

export const SOCIAL_CONTENT_PLATFORMS = ['medium', 'facebook', 'instagram', 'reels', 'tiktok'] as const;
export type SocialContentPlatform = (typeof SOCIAL_CONTENT_PLATFORMS)[number];

/** Platforms whose content can be generated and browsed today. */
export const ACTIVE_SOCIAL_CONTENT_PLATFORMS: readonly SocialContentPlatform[] = ['medium', 'facebook'];

export const SOCIAL_CONTENT_PLATFORM_LABELS: Record<SocialContentPlatform, string> = {
  medium: 'Medium',
  facebook: 'Facebook',
  instagram: 'Instagram',
  reels: 'Reels',
  tiktok: 'TikTok',
};

export const SOCIAL_CONTENT_SOURCE_TYPES = ['omniflow_article', 'external_wordpress_post', 'pinterest_generation'] as const;
export type SocialContentSourceType = (typeof SOCIAL_CONTENT_SOURCE_TYPES)[number];

export const SOCIAL_CONTENT_SOURCE_LABELS: Record<SocialContentSourceType, string> = {
  omniflow_article: 'OmniFlow article',
  external_wordpress_post: 'WordPress post',
  pinterest_generation: 'Pinterest generation',
};

export const SOCIAL_CONTENT_STATUSES = ['completed', 'failed'] as const;
export type SocialContentStatus = (typeof SOCIAL_CONTENT_STATUSES)[number];

export interface SocialContentGeneration {
  id: string;
  user_id: string;
  project_id: string;
  platform: SocialContentPlatform;
  status: SocialContentStatus;
  source_type: SocialContentSourceType;
  source_wordpress_generation_id: string | null;
  source_wordpress_site_id: string | null;
  source_wordpress_article_id: number | null;
  source_pinterest_generation_id: string | null;
  source_title: string | null;
  language: string | null;
  title: string;
  subtitle: string | null;
  content_markdown: string;
  content_html: string;
  word_count: number | null;
  image_url: string | null;
  image_alt: string | null;
  cta_url: string | null;
  // Facebook fields (TASK-068, migration 046) — absent before the migration, null for Medium.
  call_to_action?: string | null;
  first_comment_text?: string | null;
  link_placement?: FacebookLinkPlacement | null;
  content_stream_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type SocialContentGenerationInsert = Omit<SocialContentGeneration, 'id' | 'created_at' | 'updated_at'>;

// ---------------------------------------------------------------------------
// Facebook (TASK-068) — client-safe composition rules

/**
 * Where the article link goes in a Facebook post:
 * - first_comment: not in the post; posted as the Page's first comment.
 * - main_post: at the end of the post text.
 * - none: no link anywhere.
 * The link is always the validated WordPress permalink (cta_url), added by
 * code — never written by the model or typed by the user. Without a
 * permalink only `none` is possible.
 */
export const FACEBOOK_LINK_PLACEMENTS = ['first_comment', 'main_post', 'none'] as const;
export type FacebookLinkPlacement = (typeof FACEBOOK_LINK_PLACEMENTS)[number];

export const FACEBOOK_LINK_PLACEMENT_LABELS: Record<FacebookLinkPlacement, string> = {
  first_comment: 'First comment',
  main_post: 'Main post',
  none: 'No link',
};

export const FACEBOOK_LINK_PLACEMENT_HELP: Record<FacebookLinkPlacement, string> = {
  first_comment:
    'The post is published without a link, then the Page adds the article link as the first comment. This is an editorial choice: it does not guarantee more reach.',
  main_post: 'The article link is added at the end of the post text.',
  none: 'No link is published — neither in the post nor in a comment.',
};

/** Placements allowed for a piece of content: everything with a permalink, only `none` without. */
export function allowedLinkPlacements(ctaUrl: string | null): readonly FacebookLinkPlacement[] {
  return ctaUrl ? FACEBOOK_LINK_PLACEMENTS : ['none'];
}

export interface FacebookPostParts {
  post: string;
  callToAction: string | null;
  firstCommentText: string | null;
  linkPlacement: FacebookLinkPlacement;
  /** Validated permalink — null when the article has none. */
  url: string | null;
}

/** The exact text published as the Page post. */
export function composeFacebookPostMessage(parts: FacebookPostParts): string {
  const blocks = [parts.post.trim(), parts.callToAction?.trim() ?? ''];
  if (parts.linkPlacement === 'main_post' && parts.url) blocks.push(parts.url);
  return blocks.filter(Boolean).join('\n\n');
}

/** The exact first comment, or null when no comment is published. */
export function composeFacebookFirstComment(parts: FacebookPostParts): string | null {
  if (parts.linkPlacement !== 'first_comment' || !parts.url) return null;
  const lead = parts.firstCommentText?.trim();
  return lead ? `${lead}\n${parts.url}` : parts.url;
}

/** Composition parts of a saved Facebook row. */
export function facebookPartsFromRow(
  row: Pick<SocialContentGeneration, 'content_markdown' | 'call_to_action' | 'first_comment_text' | 'link_placement' | 'cta_url'>
): FacebookPostParts {
  const url = row.cta_url ?? null;
  const placement = row.link_placement && allowedLinkPlacements(url).includes(row.link_placement) ? row.link_placement : 'none';
  return {
    post: row.content_markdown,
    callToAction: row.call_to_action ?? null,
    firstCommentText: row.first_comment_text ?? null,
    linkPlacement: placement,
    url,
  };
}

/** Where a saved summary came from — enough to regenerate it and to show its source. */
export interface SocialContentSourceRef {
  sourceType: SocialContentSourceType;
  projectId: string;
  wordpressGenerationId: string | null;
  wordpressSiteId: string | null;
  wordpressPostId: number | null;
  pinterestGenerationId: string | null;
  sourceTitle: string | null;
}

export interface MediumSummaryForSave {
  title: string;
  subtitle: string;
  markdown: string;
  html: string;
  wordCount: number;
  imageUrl: string | null;
  imageAlt: string | null;
  ctaUrl: string | null;
  language: string;
}

/** The row saved for a Medium summary that passed its checks. */
export function mediumSummaryRow(userId: string, source: SocialContentSourceRef, result: MediumSummaryForSave): SocialContentGenerationInsert {
  return {
    user_id: userId,
    project_id: source.projectId,
    platform: 'medium',
    status: 'completed',
    source_type: source.sourceType,
    source_wordpress_generation_id: source.wordpressGenerationId,
    source_wordpress_site_id: source.wordpressSiteId,
    // A post id is only kept with its site (CHECK social_content_wp_article_needs_site).
    source_wordpress_article_id: source.wordpressSiteId ? source.wordpressPostId : null,
    source_pinterest_generation_id: source.pinterestGenerationId,
    source_title: source.sourceTitle,
    language: result.language,
    title: result.title,
    subtitle: result.subtitle || null,
    content_markdown: result.markdown,
    content_html: result.html,
    word_count: result.wordCount,
    image_url: result.imageUrl,
    image_alt: result.imageAlt,
    cta_url: result.ctaUrl,
  };
}

/**
 * The POST /api/social/medium-summary body that regenerates a saved
 * summary from the same source — null when its source no longer exists.
 */
export function regenerateRequestFor(
  row: Pick<
    SocialContentGeneration,
    'source_type' | 'source_wordpress_generation_id' | 'source_wordpress_site_id' | 'source_wordpress_article_id' | 'source_pinterest_generation_id'
  >
): MediumSummaryRequest | null {
  if (row.source_type === 'pinterest_generation') {
    return row.source_pinterest_generation_id ? { pinterestGenerationId: row.source_pinterest_generation_id } : null;
  }
  if (row.source_type === 'omniflow_article') {
    return row.source_wordpress_generation_id ? { wordpressArticleId: row.source_wordpress_generation_id } : null;
  }
  return row.source_wordpress_site_id && row.source_wordpress_article_id
    ? { wordpressPost: { siteId: row.source_wordpress_site_id, postId: row.source_wordpress_article_id } }
    : null;
}

/** Link to the source inside OmniFlow — null when it was deleted. */
export function sourceHref(
  row: Pick<
    SocialContentGeneration,
    'source_type' | 'source_wordpress_generation_id' | 'source_wordpress_site_id' | 'source_wordpress_article_id' | 'source_pinterest_generation_id'
  >
): string | null {
  if (row.source_type === 'pinterest_generation') {
    return row.source_pinterest_generation_id ? `/pinterest/${row.source_pinterest_generation_id}` : null;
  }
  if (row.source_type === 'omniflow_article') {
    return row.source_wordpress_generation_id ? `/wordpress/${row.source_wordpress_generation_id}` : null;
  }
  return row.source_wordpress_site_id && row.source_wordpress_article_id
    ? `/pinterest/from-wordpress?siteId=${row.source_wordpress_site_id}&postId=${row.source_wordpress_article_id}`
    : null;
}

/** Plain-text opening of the summary for the history list (no Markdown, no URL). */
export function contentPreview(markdown: string, max = 220): string {
  const text = markdown
    .replace(/^# .*$/m, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_>`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text;
}

// ---------------------------------------------------------------------------
// History filters (/medium query string)

export const SOCIAL_CONTENT_PERIODS = ['7d', '30d', '90d'] as const;
export type SocialContentPeriod = (typeof SOCIAL_CONTENT_PERIODS)[number];
export const SOCIAL_CONTENT_PERIOD_LABELS: Record<SocialContentPeriod, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};
const PERIOD_DAYS: Record<SocialContentPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };

export const SOCIAL_CONTENT_PAGE_SIZE = 20;

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' || value === 'all' ? undefined : value), schema.optional()).catch(undefined);

export const socialContentFiltersSchema = z.object({
  project: optional(z.string().uuid()),
  source: optional(z.enum(SOCIAL_CONTENT_SOURCE_TYPES)),
  period: optional(z.enum(SOCIAL_CONTENT_PERIODS)),
  status: optional(z.enum(SOCIAL_CONTENT_STATUSES)),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});

export type SocialContentFilters = z.infer<typeof socialContentFiltersSchema>;

/** Invalid values are ignored (never an error page). */
export function parseSocialContentFilters(params: Record<string, string | string[] | undefined>): SocialContentFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return socialContentFiltersSchema.parse(flat);
}

/** ISO lower bound of created_at for a period, relative to `now`. */
export function periodStart(period: SocialContentPeriod | undefined, now: Date = new Date()): string | null {
  if (!period) return null;
  return new Date(now.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Medium from a Pinterest generation (TASK-064)

export const NO_ARTICLE_FOR_MEDIUM_MESSAGE =
  'These Pins were created from a keyword, not from a WordPress article: there is no article to summarize for Medium.';

/**
 * True when a Pinterest generation was made from an article — an OmniFlow
 * article (migration 040) or an existing WordPress post (migration 044) —
 * so a Medium summary of that article can be generated from it.
 */
export function pinterestGenerationHasArticle(generation: {
  source_wordpress_generation_id?: string | null;
  source_type?: string | null;
  source_wordpress_site_id?: string | null;
  source_wordpress_post_id?: number | null;
}): boolean {
  if (generation.source_wordpress_generation_id) return true;
  return (
    generation.source_type === 'external_wordpress_post' &&
    Boolean(generation.source_wordpress_site_id) &&
    Boolean(generation.source_wordpress_post_id)
  );
}
