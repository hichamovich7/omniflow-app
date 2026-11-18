-- ============================================
-- OmniFlow Migration 050
-- TASK-101: Facebook image variants for one draft
-- ============================================
-- (049 is reserved for TASK-078 Phase B — not used here.)
--
-- social_content_generations.image_url stays THE selected image (what
-- "Publish now" and "Schedule" send). New columns:
--   source_image_url / source_image_alt  the WordPress article image the draft
--                                        was created with, kept apart so the
--                                        person can always go back to it
--   selected_image_variant_id            the variant currently in image_url,
--                                        NULL = the WordPress image (or none)
-- Existing drafts keep their current image: image_url is not touched; the
-- source columns are filled from it for Facebook rows (backfill below), and
-- for rows created later they are filled the first time a variant is chosen.
--
-- social_content_image_variants: the generated alternatives (successful ones
-- only), linked to their draft and owner. Generating never changes the
-- draft's image; only an explicit selection does. Nothing here is sent to
-- Facebook or WordPress.
--
-- reserve_trial_usage(): atomic all-or-nothing reservation of N units of the
-- trial cap (1 unit per image call launched), so two concurrent requests can
-- never go past the cap together.
--
-- Additive only. Rollback at the end.

ALTER TABLE social_content_generations
  ADD COLUMN source_image_url text,
  ADD COLUMN source_image_alt text,
  ADD CONSTRAINT social_content_source_image_url_https CHECK (source_image_url IS NULL OR source_image_url ~* '^https://');

-- Existing Facebook drafts: their current image is the WordPress one (no variant existed before).
UPDATE social_content_generations
SET source_image_url = image_url, source_image_alt = image_alt
WHERE platform = 'facebook' AND source_image_url IS NULL;

CREATE TABLE social_content_image_variants (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  social_content_generation_id  uuid NOT NULL REFERENCES social_content_generations(id) ON DELETE CASCADE,
  -- One "Generate image variants" request = one batch of 1 to 3 images.
  batch_id                      uuid NOT NULL,
  position                      smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  angle                         text NOT NULL,
  prompt                        text NOT NULL,
  image_url                     text NOT NULL CHECK (image_url ~* '^https://'),
  image_alt                     text,
  storage_key                   text NOT NULL,
  media_profile                 text NOT NULL DEFAULT 'facebook-feed-portrait',
  width                         integer CHECK (width IS NULL OR width > 0),
  height                        integer CHECK (height IS NULL OR height > 0),
  image_model                   text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, position)
);

CREATE INDEX social_content_image_variants_generation_idx
  ON social_content_image_variants (social_content_generation_id, created_at DESC);
CREATE INDEX social_content_image_variants_user_idx ON social_content_image_variants (user_id);

ALTER TABLE social_content_generations
  ADD COLUMN selected_image_variant_id uuid REFERENCES social_content_image_variants(id) ON DELETE SET NULL;

-- RLS — the caller's own rows; WITH CHECK also requires the draft to be the
-- caller's own Facebook draft (a direct PostgREST call cannot attach a
-- variant to another user's or a non-Facebook row). The route checks are
-- defense in depth. No UPDATE: a variant never changes once stored.
ALTER TABLE social_content_image_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own image variants"
  ON social_content_image_variants FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own image variants"
  ON social_content_image_variants FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM social_content_generations g
      WHERE g.id = social_content_generation_id AND g.user_id = auth.uid() AND g.platform = 'facebook'
    )
  );

CREATE POLICY "Users delete own image variants"
  ON social_content_image_variants FOR DELETE
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.social_content_image_variants TO authenticated;

-- Atomic reservation of p_units trial units (all or nothing). Returns the new
-- total, or NULL when the reservation would go past p_limit (nothing is
-- counted then). A single UPDATE ... WHERE: concurrent calls for the same
-- user are serialized on the row and the WHERE is re-checked, so two
-- requests can never exceed the cap together. Not SECURITY DEFINER — runs
-- under the caller's RLS ("Users access own profile"), like
-- increment_trial_usage (migration 023).
CREATE OR REPLACE FUNCTION reserve_trial_usage(p_user_id uuid, p_units integer, p_limit integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_count integer;
BEGIN
  IF p_units IS NULL OR p_units < 1 OR p_units > 3 THEN
    RAISE EXCEPTION 'p_units must be between 1 and 3';
  END IF;

  UPDATE profiles
  SET total_generations_used = total_generations_used + p_units
  WHERE id = p_user_id AND total_generations_used + p_units <= p_limit
  RETURNING total_generations_used INTO new_count;

  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_trial_usage(uuid, integer, integer) TO authenticated;

-- ============================================
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS reserve_trial_usage(uuid, integer, integer);
--   ALTER TABLE social_content_generations DROP COLUMN IF EXISTS selected_image_variant_id;
--   DROP TABLE IF EXISTS social_content_image_variants;
--   ALTER TABLE social_content_generations
--     DROP CONSTRAINT IF EXISTS social_content_source_image_url_https,
--     DROP COLUMN IF EXISTS source_image_alt,
--     DROP COLUMN IF EXISTS source_image_url;
-- Restore first any draft whose image_url is a variant:
--   UPDATE social_content_generations SET image_url = source_image_url, image_alt = source_image_alt
--   WHERE selected_image_variant_id IS NOT NULL;
-- ============================================
