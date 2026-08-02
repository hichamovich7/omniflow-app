-- ============================================
-- OmniFlow Migration 021
-- TASK-013: storage bucket for user-uploaded reference images
-- ============================================

-- Same shape as the generated-images / wordpress-images buckets (migrations
-- 004 / 012): public bucket, broad authenticated INSERT/DELETE, public SELECT.
-- Per-user scoping is a path convention enforced by the upload route
-- (app/api/pinterest/reference-image/route.ts uploads under `${user.id}/...`),
-- not a storage-level RLS policy — consistent with every existing bucket in
-- this project, none of which path-scope via auth.uid() either.
INSERT INTO storage.buckets (id, name, public)
VALUES ('reference-images', 'reference-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload reference images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'reference-images');

CREATE POLICY "Authenticated users can delete reference images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'reference-images');

CREATE POLICY "Public can view reference images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'reference-images');
