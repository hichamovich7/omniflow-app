import type { R2Config } from './config';
import { encodeKeyPath, S3RequestError, type S3ObjectClient } from './s3-client';
import { MediaStorageError, type MediaStorage } from './types';

/**
 * Cloudflare R2 provider (TASK-049) — public bucket served by R2_PUBLIC_URL.
 * Never store private files here (Pinterest `.source` photos stay on Supabase).
 * A failed upload throws: no fallback to Supabase, no URL returned.
 */
export function createR2MediaStorage(config: Pick<R2Config, 'publicUrl'>, client: S3ObjectClient): MediaStorage {
  const fail = (code: 'upload' | 'read' | 'remove' | 'list', err: unknown): never => {
    const reason = err instanceof S3RequestError ? err.message : `R2 ${code} failed`;
    throw new MediaStorageError(reason, 'r2', code);
  };
  const publicUrl = (key: string) => `${config.publicUrl}/${encodeKeyPath(key)}`;

  return {
    provider: 'r2',
    publicUrl,
    async upload({ key, body, contentType }) {
      try {
        await client.putObject({ key, body, contentType });
      } catch (err) {
        fail('upload', err);
      }
      return { provider: 'r2', key, publicUrl: publicUrl(key) };
    },
    async read(key) {
      try {
        return await client.getObject(key);
      } catch (err) {
        return fail('read', err);
      }
    },
    async remove(keys) {
      for (const key of keys) {
        try {
          await client.deleteObject(key);
        } catch (err) {
          fail('remove', err);
        }
      }
    },
    async list(prefix) {
      try {
        return await client.listObjects(`${prefix.replace(/\/+$/, '')}/`);
      } catch (err) {
        return fail('list', err);
      }
    },
  };
}
