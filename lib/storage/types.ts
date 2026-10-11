/**
 * Media storage abstraction (TASK-049). Server-side only: never import from
 * Client Components — the R2 provider holds credentials.
 */

export const MEDIA_STORAGE_PROVIDERS = ['supabase', 'r2'] as const;
export type MediaStorageProviderName = (typeof MEDIA_STORAGE_PROVIDERS)[number];

/** Supabase buckets the public media pipeline writes to (unchanged since migrations 004 / 012). */
export type SupabaseMediaBucket = 'generated-images' | 'wordpress-images';

export interface MediaUploadInput {
  /** Object key / path inside the provider's bucket. */
  key: string;
  body: Buffer;
  contentType: string;
  /** Supabase only: forwarded as-is when set (R2 PUT always overwrites). */
  upsert?: boolean;
}

export interface StoredMedia {
  provider: MediaStorageProviderName;
  key: string;
  publicUrl: string;
}

export interface MediaStorage {
  readonly provider: MediaStorageProviderName;
  /** Throws a MediaStorageError when the object could not be stored — never returns a broken URL. */
  upload(input: MediaUploadInput): Promise<StoredMedia>;
  read(key: string): Promise<Buffer>;
  remove(keys: string[]): Promise<void>;
  /** Full keys of the objects directly under `prefix` (a folder, without trailing slash). */
  list(prefix: string): Promise<string[]>;
  publicUrl(key: string): string;
}

export class MediaStorageError extends Error {
  constructor(
    message: string,
    readonly provider: MediaStorageProviderName,
    readonly code: 'config' | 'upload' | 'read' | 'remove' | 'list' | 'key' = 'upload'
  ) {
    super(message);
    this.name = 'MediaStorageError';
  }
}
