/**
 * Storage-independent identity of an OmniFlow image (TASK-FIX-060).
 *
 * The WordPress media mapping (migration 043) is keyed by the image's
 * immutable object — bucket + object path — never by its public URL, which
 * changes when the files move from Supabase Storage to a CDN or another
 * object store. Every image path OmniFlow writes is versioned or unique per
 * generation (`<user>/<generation>/<MARKER>.png`, pin image versions), so a
 * path always names the same bytes.
 *
 * Public URLs of an object, all resolving to the same key:
 *   Supabase  https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *             (also /object/sign/…, /object/authenticated/…, /render/image/public/…)
 *   CDN       <baseUrl>/<path> for a declared `{ baseUrl, bucket }` origin
 *
 * Any other URL (an image outside OmniFlow storage) falls back to its host +
 * path, without the query string (signatures, cache busters). The URL to
 * download from stays the stored one: CDN URLs handed to WordPress or
 * Pinterest must be public, stable and without short expiry.
 */

export interface CdnOrigin {
  /** Public base URL serving the bucket's objects, e.g. https://cdn.example.com/wp-images */
  baseUrl: string;
  /** Bucket whose object paths follow the base URL. */
  bucket: string;
}

export interface SourceAssetOptions {
  cdnOrigins?: CdnOrigin[];
}

export interface SourceAsset {
  /** Mapping key: `storage:<bucket>/<path>` or `url:<host><path>`. */
  key: string;
  /** Where the bytes are downloaded from (unchanged stored URL). */
  url: string;
}

const SUPABASE_OBJECT_PATH = /^\/storage\/v1\/(?:object\/(?:public|sign|authenticated)|render\/image\/(?:public|sign|authenticated))\/([^/]+)\/(.+)$/;

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function storageKey(bucket: string, path: string): string | null {
  const objectPath = decodePath(path).replace(/^\/+/, '');
  if (!bucket || !objectPath || objectPath.split('/').some((part) => part === '..')) return null;
  return `storage:${decodePath(bucket)}/${objectPath}`;
}

function fromCdn(url: URL, origins: CdnOrigin[]): string | null {
  for (const origin of origins) {
    let base: URL;
    try {
      base = new URL(origin.baseUrl);
    } catch {
      continue;
    }
    const basePath = base.pathname.replace(/\/+$/, '');
    if (url.host.toLowerCase() !== base.host.toLowerCase()) continue;
    if (!url.pathname.startsWith(`${basePath}/`)) continue;
    const key = storageKey(origin.bucket, url.pathname.slice(basePath.length + 1));
    if (key) return key;
  }
  return null;
}

/** The stable mapping key of an image URL, or null when the URL is not usable. Pure. */
export function resolveSourceAssetKey(imageUrl: string, options: SourceAssetOptions = {}): string | null {
  let url: URL;
  try {
    url = new URL(imageUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const cdnKey = fromCdn(url, options.cdnOrigins ?? []);
  if (cdnKey) return cdnKey;

  const supabase = SUPABASE_OBJECT_PATH.exec(url.pathname);
  if (supabase) {
    const key = storageKey(supabase[1], supabase[2]);
    if (key) return key;
  }

  return `url:${url.host.toLowerCase()}${url.pathname}`;
}

/** The single place an image URL becomes a source asset — publish, retries and rewritten versions alike. */
export function resolveSourceAsset(imageUrl: string, options: SourceAssetOptions = {}): SourceAsset | null {
  const key = resolveSourceAssetKey(imageUrl, options);
  return key ? { key, url: imageUrl.trim() } : null;
}
