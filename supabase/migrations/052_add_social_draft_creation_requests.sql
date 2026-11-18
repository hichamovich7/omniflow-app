-- ============================================
-- OmniFlow Migration 052
-- TASK-101 extension / TASK-103: atomic reservation of a
-- "Create new post with this image" request
-- ============================================
-- (049 reserved for TASK-078 Phase B; 050 and 051 are applied and never
-- modified.)
--
-- A request id is reserved here BEFORE the quota is counted and before any
-- AI call: the PRIMARY KEY (user_id, request_id) makes the reservation
-- atomic, so two identical requests at the same time produce at most one
-- billed text generation and one draft. The second one gets an explicit
-- "still in progress" answer (or the finished draft once it exists).
--
--   pending    the request is running (taken over only once stale, or after failed)
--   completed  generation_id = the draft it created
--   failed     the request stopped (quota refused, AI or save error) — the
--              same id may be retried
--
-- Nothing here is shown to the person or sent to Facebook. Additive only.

CREATE TABLE social_draft_creation_requests (
  user_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_id            uuid NOT NULL,
  parent_generation_id  uuid NOT NULL REFERENCES social_content_generations(id) ON DELETE CASCADE,
  variant_id            uuid REFERENCES social_content_image_variants(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  generation_id         uuid REFERENCES social_content_generations(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id),
  CONSTRAINT social_draft_request_completed_needs_draft CHECK (status <> 'completed' OR generation_id IS NOT NULL)
);

CREATE INDEX social_draft_creation_requests_parent_idx ON social_draft_creation_requests (parent_generation_id);

-- RLS — the caller's own requests; the parent draft (and the generated
-- draft) must be the caller's own Facebook rows.
ALTER TABLE social_draft_creation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own draft creation requests"
  ON social_draft_creation_requests FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM social_content_generations g
      WHERE g.id = parent_generation_id AND g.user_id = auth.uid() AND g.platform = 'facebook'
    )
    AND (
      generation_id IS NULL
      OR EXISTS (SELECT 1 FROM social_content_generations g WHERE g.id = generation_id AND g.user_id = auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.social_draft_creation_requests TO authenticated;

-- ============================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS social_draft_creation_requests;
-- ============================================
