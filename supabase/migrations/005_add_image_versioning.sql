-- ============================================
-- OmniFlow Migration 005
-- TASK-021: Image Versioning & Regeneration
-- ============================================

-- 1. Create pin_images table
CREATE TABLE pin_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id       uuid NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  url          text NOT NULL,
  is_active    boolean NOT NULL DEFAULT false,
  version      integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX pin_images_pin_id_idx ON pin_images(pin_id);
CREATE INDEX pin_images_active_idx ON pin_images(pin_id) WHERE is_active = true;

-- 3. Unique constraint: only one active image per pin
CREATE UNIQUE INDEX pin_images_one_active_per_pin
  ON pin_images(pin_id) WHERE is_active = true;

-- 4. Unique constraint: version number unique per pin
CREATE UNIQUE INDEX pin_images_pin_version_unique
  ON pin_images(pin_id, version);

-- 5. RLS
ALTER TABLE pin_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own pin images"
  ON pin_images FOR ALL
  USING (
    pin_id IN (
      SELECT p.id FROM pins p
      JOIN generations g ON p.generation_id = g.id
      WHERE g.user_id = auth.uid()
    )
  );

-- 6. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_images TO authenticated;

-- 7. Migrate existing images to pin_images table
INSERT INTO pin_images (pin_id, storage_path, url, is_active, version)
SELECT
  p.id,
  g.user_id || '/' || p.id || '.png',
  p.media_url,
  true,
  1
FROM pins p
JOIN generations g ON p.generation_id = g.id
WHERE p.media_url IS NOT NULL;
