import type { SupabaseClient } from '@supabase/supabase-js';
import { MediaStorageError, type MediaStorage, type SupabaseMediaBucket } from './types';

/**
 * Supabase Storage provider (TASK-049) — the exact calls the pipeline made
 * before the abstraction: same bucket, same path, same upload options.
 */
export function createSupabaseMediaStorage(supabase: SupabaseClient, bucket: SupabaseMediaBucket): MediaStorage {
  const from = () => supabase.storage.from(bucket);
  const publicUrl = (key: string) => from().getPublicUrl(key).data.publicUrl;

  return {
    provider: 'supabase',
    publicUrl,
    async upload({ key, body, contentType, upsert }) {
      const { error } = await from().upload(key, body, {
        contentType,
        ...(upsert !== undefined ? { upsert } : {}),
      });
      if (error) throw new MediaStorageError(error.message, 'supabase', 'upload');
      return { provider: 'supabase', key, publicUrl: publicUrl(key) };
    },
    async read(key) {
      const { data, error } = await from().download(key);
      if (error || !data) throw new MediaStorageError(error?.message ?? 'Object not found', 'supabase', 'read');
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(keys) {
      if (keys.length === 0) return;
      const { error } = await from().remove(keys);
      if (error) throw new MediaStorageError(error.message, 'supabase', 'remove');
    },
    async list(prefix) {
      const folder = prefix.replace(/\/+$/, '');
      const { data, error } = await from().list(folder);
      if (error) throw new MediaStorageError(error.message, 'supabase', 'list');
      return (data ?? []).map((file) => `${folder}/${file.name}`);
    },
  };
}
