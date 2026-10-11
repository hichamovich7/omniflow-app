-- 043 — WordPress media reuse (TASK-FIX-060).
--
-- One row per (WordPress site, source image): the WordPress attachment an
-- OmniFlow image was uploaded as, so a retry, a republish, another article
-- or a rewritten version using the same image reuses it instead of sending
-- POST /wp/v2/media again.
--
-- source_asset_key: the storage-independent identity of the image
--   ("storage:<bucket>/<object path>", lib/wordpress/media-source.ts) — never
--   the public Supabase / CDN URL, never the bare file name, so a move to a
--   CDN or another object store keeps every mapping.
-- source_hash: SHA-256 (hex) of the image bytes, when known. Lets a copy of
--   the same file under another path (rewritten versions copy their images)
--   reuse the same attachment. Not unique.
-- wp_media_id / wp_media_url: the attachment. NULL while an upload holds the
--   row's claim (upload_started_at) — the first publish inserts the claim,
--   uploads, then fills them; a concurrent publish hitting the unique key
--   waits for them instead of uploading a second copy.
-- wordpress_site_url: normalized site URL the attachment was created on. The
--   connection can be edited to another site in place (same id); a row whose
--   URL differs from the connected site is never reused.
-- upload_started_at: when the upload currently holding the claim started;
--   NULL once done. Older than the publish lock's stale delay (90s) = a killed
--   request, and the claim may be taken over.
--
-- Nothing existing is modified: no backfill, no change to articles, images
-- or WordPress. Without this table the publish keeps uploading every image
-- (the code detects the missing table and logs a warning).

CREATE TABLE wordpress_media_assets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  wordpress_site_id   uuid NOT NULL REFERENCES wordpress_sites(id) ON DELETE CASCADE,
  wordpress_site_url  text NOT NULL,
  source_asset_key    text NOT NULL,
  source_hash         text,
  wp_media_id         bigint,
  wp_media_url        text,
  upload_started_at   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wordpress_media_assets_site_key_unique UNIQUE (wordpress_site_id, source_asset_key),
  CONSTRAINT wordpress_media_assets_media_id_positive CHECK (wp_media_id IS NULL OR wp_media_id > 0),
  -- A row is either a finished mapping or a claim in progress.
  CONSTRAINT wordpress_media_assets_media_or_claim CHECK (wp_media_id IS NOT NULL OR upload_started_at IS NOT NULL)
);

-- The unique constraint already indexes (wordpress_site_id, source_asset_key).
CREATE INDEX wordpress_media_assets_site_hash_idx
  ON wordpress_media_assets(wordpress_site_id, source_hash)
  WHERE source_hash IS NOT NULL;

-- RLS: user_id denormalized like wordpress_sites (migration 019); writes must
-- also target a site the user owns.
ALTER TABLE wordpress_media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own wordpress media assets"
  ON wordpress_media_assets FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND wordpress_site_id IN (SELECT id FROM wordpress_sites WHERE user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_media_assets TO authenticated;
