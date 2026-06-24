-- ============================================
-- OmniFlow Migration 004
-- Add image generation support
-- ============================================

-- Track image generation status per generation
ALTER TABLE public.generations
  ADD COLUMN image_status text NOT NULL DEFAULT 'none';

-- Create storage bucket for generated images
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-images', 'generated-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload generated images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'generated-images');

-- Allow authenticated users to delete their images
CREATE POLICY "Authenticated users can delete generated images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'generated-images');

-- Allow public read access
CREATE POLICY "Public can view generated images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'generated-images');
