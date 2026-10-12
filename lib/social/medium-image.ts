import type { ArticleSectionKind, WordPressArticleContext } from '@/lib/wordpress/article-context';
import { normalizeForMatch, stripUrls } from '@/lib/wordpress/article-context';
import { buildFeaturedImageAltText, isGenericAltText } from '@/lib/wordpress/image-alt-text';

/**
 * The Medium summary's image (TASK-062). Only an image really present in the
 * article is used — its featured image first, else the most relevant
 * internal image — and only through its exact public HTTPS URL on the
 * article's own site (or, for an OmniFlow article, OmniFlow's public
 * storage). No image is generated, downloaded, copied or re-hosted, and no
 * URL is ever built or guessed.
 */

export const NO_IMAGE_WARNING =
  'No public image of the article could be used (none found, or none hosted on the article’s site over HTTPS). The summary has no image: add one yourself in Medium if you want.';

const ALT_MAX_LENGTH = 125;

export interface MediumImageCandidate {
  /** Exactly as found in the article. */
  url: string;
  alt: string;
  caption: string;
  origin: 'featured' | 'internal';
  /** Heading subject of the section the image is in (internal images only). */
  sectionSubject: string | null;
  sectionKind: ArticleSectionKind | null;
}

export interface MediumImage {
  url: string;
  alt: string;
  origin: 'featured' | 'internal';
  /** `article`: the image's own alt / caption; `generated`: built from the verified heading or title. */
  altSource: 'article' | 'generated';
}

/** Featured image then internal images of a context, in document order. */
export function imageCandidatesFromContext(context: WordPressArticleContext): MediumImageCandidate[] {
  const featured: MediumImageCandidate[] = context.featuredImage
    ? [{ ...context.featuredImage, origin: 'featured', sectionSubject: null, sectionKind: null }]
    : [];
  const internal = context.sections.flatMap((section) =>
    section.images.map<MediumImageCandidate>((image) => ({
      url: image.url,
      alt: image.alt,
      caption: image.caption,
      origin: 'internal',
      sectionSubject: section.kind === 'intro' ? null : section.subject,
      sectionKind: section.kind,
    }))
  );
  return [...featured, ...internal];
}

function hostOf(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export interface MediumImageHosts {
  /** Bare hosts (no `www.`) whose subdomains are accepted too. */
  hosts: string[];
  /** Supabase Storage host: only its `/object/public/` paths are public. */
  supabaseHost: string | null;
}

/**
 * The hosts an image may come from: the connected WordPress site, plus
 * OmniFlow's public storage (Supabase, R2) for an OmniFlow article — its
 * images live there before (or without) publication.
 */
export function mediumImageHosts(
  siteUrl: string | null,
  includeOmniflowStorage: boolean,
  env: Record<string, string | undefined> = process.env
): MediumImageHosts {
  const supabaseHost = includeOmniflowStorage ? hostOf(env.NEXT_PUBLIC_SUPABASE_URL) : null;
  const hosts = [hostOf(siteUrl), supabaseHost, includeOmniflowStorage ? hostOf(env.R2_PUBLIC_URL) : null].filter(
    (host): host is string => Boolean(host)
  );
  return { hosts: [...new Set(hosts)], supabaseHost };
}

const IP_HOST = /^(\d{1,3}\.){3}\d{1,3}$|^\[.*\]$|:/;
const LOCAL_HOST = /^localhost$|\.(localhost|local|internal|lan|home|corp|intranet)$/;
const SIGNED_PARAM = /^(token|signature|sig|expires|x-amz-[a-z-]+|x-goog-[a-z-]+)$/i;

/**
 * A public image: HTTPS, no credentials, a real domain (no IP / local host),
 * not a signed or expiring URL, on an allowed host; Supabase Storage only
 * under `/storage/v1/object/public/`.
 */
export function isPublicArticleImageUrl(value: string, allowed: MediumImageHosts): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (IP_HOST.test(host) || LOCAL_HOST.test(host)) return false;
  if ([...url.searchParams.keys()].some((key) => SIGNED_PARAM.test(key))) return false;
  const bare = host.replace(/^www\./, '');
  const match = allowed.hosts.find((allowedHost) => bare === allowedHost || bare.endsWith(`.${allowedHost}`));
  if (!match) return false;
  if (match === allowed.supabaseHost && !url.pathname.startsWith('/storage/v1/object/public/')) return false;
  return true;
}

function usableAlt(value: string): string | null {
  const text = stripUrls(value).replace(/\s+/g, ' ').trim();
  return text && !isGenericAltText(text) ? text : null;
}

function clip(value: string): string {
  if (value.length <= ALT_MAX_LENGTH) return value;
  const cut = value.slice(0, ALT_MAX_LENGTH);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).trimEnd();
}

function relevance(candidate: MediumImageCandidate, titleWords: Set<string>): number {
  let score = 0;
  if (usableAlt(candidate.alt)) score += 3;
  if (usableAlt(candidate.caption)) score += 1;
  if (candidate.sectionKind === 'subject') score += 2;
  else if (candidate.sectionKind === 'intro') score += 1;
  const words = normalizeForMatch(`${candidate.alt} ${candidate.sectionSubject ?? ''}`).trim().split(' ');
  score += Math.min(new Set(words.filter((word) => word.length > 3 && titleWords.has(word))).size, 3);
  return score;
}

/**
 * Featured image first (first valid one), else the internal image with the
 * best relevance (descriptive alt, real subject section, words of the title;
 * ties → earliest). Null when no candidate passes the URL checks.
 */
export function selectMediumImage(candidates: readonly MediumImageCandidate[], allowed: MediumImageHosts, title: string): MediumImage | null {
  const valid = candidates.filter((candidate) => isPublicArticleImageUrl(candidate.url, allowed));
  let chosen = valid.find((candidate) => candidate.origin === 'featured') ?? null;
  if (!chosen) {
    const titleWords = new Set(normalizeForMatch(title).trim().split(' ').filter((word) => word.length > 3));
    let best = -1;
    for (const candidate of valid) {
      const score = relevance(candidate, titleWords);
      if (score > best) {
        best = score;
        chosen = candidate;
      }
    }
  }
  if (!chosen) return null;

  const own = usableAlt(chosen.alt) ?? usableAlt(chosen.caption);
  const generated =
    buildFeaturedImageAltText({ title: chosen.sectionSubject ?? title, keyword: chosen.sectionSubject ? title : null }) ?? stripUrls(title);
  return {
    url: chosen.url.trim(),
    alt: clip(own ?? generated),
    origin: chosen.origin,
    altSource: own ? 'article' : 'generated',
  };
}
