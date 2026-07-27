-- ============================================
-- OmniFlow Migration 018
-- TASK-034: Niche Visual Conventions + Text Overlay Routing
-- ============================================

-- visual_format decides which IMAGE model a pin's generateImage() call
-- routes to (see lib/ai/services/image.ts) and how its prompt is built
-- (lib/ai/prompt-engine/engine.ts). Not a DB enum/CHECK — validated at the
-- Zod layer (lib/validations/pinterest.ts), same convention already used for
-- generations.status / generations.image_status in this schema.
ALTER TABLE pins ADD COLUMN visual_format text NOT NULL DEFAULT 'photo';

-- Only set when visual_format = 'text-overlay'. The short on-image hook text
-- (5-8 words), distinct from the pin's full title.
ALTER TABLE pins ADD COLUMN overlay_text text;
