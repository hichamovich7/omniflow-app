-- ============================================
-- OmniFlow Migration 051
-- TASK-101 (extension) + TASK-103 (relevant scope): a new Facebook draft
-- from an existing image of the same article
-- ============================================
-- (049 is reserved for TASK-078 Phase B; 050 is applied and never modified.)
--
-- "Create new post with this image": a NEW row in social_content_generations
-- (same article source columns as the draft it comes from, its own text, CTA
-- and first comment written for the image's visual angle). The image is
-- reused by reference — no image call, no file copy; the original variant
-- row stays on its original draft (never moved, never deleted).
--
-- Article → drafts → publications stay distinct: several drafts of the same
-- article may each be published on the same Page (UNIQUE (draft, Page) of
-- migration 046 is unchanged), while retrying one draft never posts twice.
--
-- New columns on social_content_generations:
--   derived_from_generation_id  the draft whose image was reused (history)
--   origin_image_variant_id     the reused variant (NULL = the WordPress image)
--   visual_angle                the angle the text was written for
--   creation_request_id         idempotency key of the creation request:
--                               a repeated request (double click, retry)
--                               returns the draft already created
--
-- A trigger checks that every referenced draft / variant (including
-- selected_image_variant_id from 050) belongs to the row's owner — RLS of
-- the referenced tables also applies inside it (SECURITY INVOKER).
--
-- Additive only. Rollback at the end.

ALTER TABLE social_content_generations
  ADD COLUMN derived_from_generation_id uuid REFERENCES social_content_generations(id) ON DELETE SET NULL,
  ADD COLUMN origin_image_variant_id uuid REFERENCES social_content_image_variants(id) ON DELETE SET NULL,
  ADD COLUMN visual_angle text,
  ADD COLUMN creation_request_id uuid,
  ADD CONSTRAINT social_content_visual_angle_check
    CHECK (visual_angle IS NULL OR visual_angle IN ('wordpress', 'hero', 'lifestyle', 'detail'));

CREATE UNIQUE INDEX social_content_generations_creation_request_key
  ON social_content_generations (user_id, creation_request_id)
  WHERE creation_request_id IS NOT NULL;

CREATE INDEX social_content_generations_derived_from_idx
  ON social_content_generations (derived_from_generation_id)
  WHERE derived_from_generation_id IS NOT NULL;

-- Ownership of the referenced draft / variants (defense in depth: the
-- routes check it too). Runs only when one of these columns is set or
-- changed, so ordinary edits are unaffected.
CREATE OR REPLACE FUNCTION check_social_content_image_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.derived_from_generation_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.derived_from_generation_id IS DISTINCT FROM OLD.derived_from_generation_id)
     AND NOT EXISTS (
       SELECT 1 FROM social_content_generations g
       WHERE g.id = NEW.derived_from_generation_id AND g.user_id = NEW.user_id AND g.platform = 'facebook'
     ) THEN
    RAISE EXCEPTION 'derived_from_generation_id must be a Facebook draft of the same user' USING ERRCODE = '42501';
  END IF;

  IF NEW.origin_image_variant_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.origin_image_variant_id IS DISTINCT FROM OLD.origin_image_variant_id)
     AND NOT EXISTS (
       SELECT 1 FROM social_content_image_variants v
       WHERE v.id = NEW.origin_image_variant_id AND v.user_id = NEW.user_id
     ) THEN
    RAISE EXCEPTION 'origin_image_variant_id must be an image variant of the same user' USING ERRCODE = '42501';
  END IF;

  IF NEW.selected_image_variant_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.selected_image_variant_id IS DISTINCT FROM OLD.selected_image_variant_id)
     AND NOT EXISTS (
       SELECT 1 FROM social_content_image_variants v
       WHERE v.id = NEW.selected_image_variant_id AND v.user_id = NEW.user_id
     ) THEN
    RAISE EXCEPTION 'selected_image_variant_id must be an image variant of the same user' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_social_content_image_refs
  BEFORE INSERT OR UPDATE OF derived_from_generation_id, origin_image_variant_id, selected_image_variant_id
  ON social_content_generations
  FOR EACH ROW EXECUTE FUNCTION check_social_content_image_refs();

-- ============================================
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS check_social_content_image_refs ON social_content_generations;
--   DROP FUNCTION IF EXISTS check_social_content_image_refs();
--   DROP INDEX IF EXISTS social_content_generations_derived_from_idx;
--   DROP INDEX IF EXISTS social_content_generations_creation_request_key;
--   ALTER TABLE social_content_generations
--     DROP CONSTRAINT IF EXISTS social_content_visual_angle_check,
--     DROP COLUMN IF EXISTS creation_request_id,
--     DROP COLUMN IF EXISTS visual_angle,
--     DROP COLUMN IF EXISTS origin_image_variant_id,
--     DROP COLUMN IF EXISTS derived_from_generation_id;
-- Derived drafts stay as ordinary drafts (their text and image_url are kept).
-- ============================================
