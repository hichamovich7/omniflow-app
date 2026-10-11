import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMissingMediaAssetsTable,
  MediaStoreError,
  type MediaAssetRow,
  type MediaAssetStore,
} from '@/lib/wordpress/media-reuse';
import type { WordPressMediaAsset } from '@/types/wordpress';

/**
 * wordpress_media_assets (migration 043) for one WordPress site — the
 * mapping behind media reuse (lib/wordpress/media-reuse.ts). The session
 * client is used: RLS limits rows to the user, and user_id / site id are
 * written explicitly. Every error becomes a MediaStoreError (unavailable when
 * the table does not exist yet), so the publish falls back to a plain upload.
 */

const TABLE = 'wordpress_media_assets';
const COLUMNS = 'source_asset_key, source_hash, wp_media_id, wp_media_url, wordpress_site_url, upload_started_at';

type Row = Pick<
  WordPressMediaAsset,
  'source_asset_key' | 'source_hash' | 'wp_media_id' | 'wp_media_url' | 'wordpress_site_url' | 'upload_started_at'
>;

function toRow(row: Row): MediaAssetRow {
  return {
    sourceAssetKey: row.source_asset_key,
    sourceHash: row.source_hash,
    wpMediaId: row.wp_media_id === null ? null : Number(row.wp_media_id),
    wpMediaUrl: row.wp_media_url,
    siteUrl: row.wordpress_site_url,
    uploadStartedAt: row.upload_started_at,
  };
}

function storeError(error: { code?: string; message?: string }): MediaStoreError {
  // Code only — never row values or URLs in the message.
  return new MediaStoreError(`wordpress_media_assets query failed (${error.code ?? 'unknown'})`, isMissingMediaAssetsTable(error));
}

export function createWordPressMediaAssetStore(
  supabase: SupabaseClient,
  site: { id: string; userId: string }
): MediaAssetStore {
  const rows = () => supabase.from(TABLE);

  return {
    async find(key) {
      const { data, error } = await rows()
        .select(COLUMNS)
        .eq('wordpress_site_id', site.id)
        .eq('source_asset_key', key)
        .maybeSingle();
      if (error) throw storeError(error);
      return data ? toRow(data as Row) : null;
    },

    async findByHash(hash) {
      const { data, error } = await rows()
        .select(COLUMNS)
        .eq('wordpress_site_id', site.id)
        .eq('source_hash', hash)
        .not('wp_media_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(3);
      if (error) throw storeError(error);
      return ((data ?? []) as Row[]).map(toRow);
    },

    async claim(key, siteUrl, startedAt) {
      const { error } = await rows().insert({
        user_id: site.userId,
        wordpress_site_id: site.id,
        wordpress_site_url: siteUrl,
        source_asset_key: key,
        upload_started_at: startedAt,
      });
      if (!error) return true;
      if (error.code === '23505') return false;
      throw storeError(error);
    },

    async takeOver(key, startedAt, staleBefore) {
      const { data, error } = await rows()
        .update({ upload_started_at: startedAt, updated_at: startedAt })
        .eq('wordpress_site_id', site.id)
        .eq('source_asset_key', key)
        .or(`upload_started_at.is.null,upload_started_at.lt.${staleBefore}`)
        .select('source_asset_key');
      if (error) throw storeError(error);
      return (data ?? []).length > 0;
    },

    async complete(key, startedAt, values) {
      const { data, error } = await rows()
        .update({
          wp_media_id: values.wpMediaId,
          wp_media_url: values.wpMediaUrl,
          source_hash: values.sourceHash,
          wordpress_site_url: values.siteUrl,
          upload_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('wordpress_site_id', site.id)
        .eq('source_asset_key', key)
        .eq('upload_started_at', startedAt)
        .select('upload_started_at');
      if (error) throw storeError(error);
      return (data ?? []).length > 0;
    },

    async release(key, startedAt) {
      // Our unfinished claim row goes; a row that already had an attachment keeps it.
      const removed = await rows()
        .delete()
        .eq('wordpress_site_id', site.id)
        .eq('source_asset_key', key)
        .eq('upload_started_at', startedAt)
        .is('wp_media_id', null);
      if (removed.error) throw storeError(removed.error);
      const freed = await rows()
        .update({ upload_started_at: null })
        .eq('wordpress_site_id', site.id)
        .eq('source_asset_key', key)
        .eq('upload_started_at', startedAt)
        .not('wp_media_id', 'is', null);
      if (freed.error) throw storeError(freed.error);
    },
  };
}
