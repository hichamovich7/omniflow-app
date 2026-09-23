-- ============================================
-- OmniFlow Migration 032
-- Pinterest Board Section (optional sub-section within a Board)
-- ============================================

-- Optional free-text sub-section inside the pin's Board, exported to
-- Pinterest's CSV Bulk Upload as "Board/Section" in the existing
-- "Pinterest board" column (never a separate CSV column). Nullable, no
-- backfill, no default — existing pins are unaffected. No DB CHECK — length
-- and forbidden-character rules (no "/", "\", or line breaks, since "/" is
-- Pinterest's own board/section separator) are enforced at the Zod layer,
-- same convention as migrations 018/025/026/027.
ALTER TABLE pins ADD COLUMN board_section text;
