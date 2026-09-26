-- ============================================
-- OmniFlow Migration 037
-- TASK-FIX-046: WordPress Quality Report V1 persistence
-- ============================================

-- The Quality Gate V1 report computed after every WordPress generation
-- (lib/wordpress/quality-check.ts): { status, qualityIssues, warnings,
-- checks: [{ key, status, message }] }. Informational only — never blocks
-- review, export or publishing. Nullable: generations created before this
-- migration (or whose report could not be saved) keep NULL. The shape is
-- validated in the application layer (Zod, lib/wordpress/quality-report.ts),
-- same convention as the other wordpress_generations columns.
-- Additive only: no backfill, no index, no RLS change (the existing
-- "Users access own wordpress generations" policy already covers the row).
ALTER TABLE wordpress_generations ADD COLUMN quality_report jsonb;
