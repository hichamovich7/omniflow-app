import {
  MEDIA_STORAGE_PROVIDERS,
  MediaStorageError,
  type MediaStorageProviderName,
} from './types';

/**
 * Provider selection and R2 configuration (TASK-049). Read from server env
 * only — none of these variables may use the NEXT_PUBLIC_ prefix. Error
 * messages name missing variables, never their values.
 */

export type StorageEnv = Record<string, string | undefined>;

export interface R2Config {
  endpoint: string;
  bucket: string;
  publicUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** `MEDIA_STORAGE_PROVIDER`; unset or empty → `supabase` (behavior before TASK-049). */
export function getMediaStorageProvider(env: StorageEnv = process.env): MediaStorageProviderName {
  const raw = env.MEDIA_STORAGE_PROVIDER?.trim().toLowerCase();
  if (!raw) return 'supabase';
  if ((MEDIA_STORAGE_PROVIDERS as readonly string[]).includes(raw)) return raw as MediaStorageProviderName;
  throw new MediaStorageError(
    `Invalid MEDIA_STORAGE_PROVIDER: expected one of ${MEDIA_STORAGE_PROVIDERS.join(', ')}`,
    'supabase',
    'config'
  );
}

function httpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** Validated R2 settings, or a MediaStorageError listing what is missing / invalid. */
export function readR2Config(env: StorageEnv = process.env): R2Config {
  const value = (name: string) => env[name]?.trim() ?? '';
  const required = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_PUBLIC_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
  const missing = required.filter((name) => !value(name));
  if (missing.length > 0) {
    throw new MediaStorageError(`R2 storage is not configured: missing ${missing.join(', ')}`, 'r2', 'config');
  }

  const endpoint = httpsUrl(value('R2_ENDPOINT'));
  const publicUrl = httpsUrl(value('R2_PUBLIC_URL'));
  const invalid = [!endpoint && 'R2_ENDPOINT', !publicUrl && 'R2_PUBLIC_URL'].filter(Boolean);
  if (invalid.length > 0 || !endpoint || !publicUrl) {
    throw new MediaStorageError(`R2 storage is misconfigured: ${invalid.join(', ')} must be an https URL`, 'r2', 'config');
  }

  return {
    endpoint,
    bucket: value('R2_BUCKET'),
    publicUrl,
    region: value('R2_REGION') || 'auto',
    accessKeyId: value('R2_ACCESS_KEY_ID'),
    secretAccessKey: value('R2_SECRET_ACCESS_KEY'),
  };
}

/** True when every R2 variable is present and valid (cleanup of R2 objects written earlier). */
export function isR2Configured(env: StorageEnv = process.env): boolean {
  try {
    readR2Config(env);
    return true;
  } catch {
    return false;
  }
}
