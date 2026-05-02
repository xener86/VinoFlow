-- Migration 001: Sommelier v2 schema additions
-- Apply to existing databases that were created before sommelier v2.
-- Idempotent: safe to run multiple times.

BEGIN;

-- 1. Add aroma profile metadata columns to wines
ALTER TABLE wines ADD COLUMN IF NOT EXISTS aroma_confidence text;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS aroma_source text;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS aroma_verified_at timestamp with time zone;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS aroma_verified_by uuid;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS aroma_provider text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wines_aroma_confidence_check') THEN
        ALTER TABLE wines ADD CONSTRAINT wines_aroma_confidence_check
            CHECK (aroma_confidence IS NULL OR aroma_confidence = ANY (ARRAY['HIGH', 'MEDIUM', 'LOW']));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wines_aroma_source_check') THEN
        ALTER TABLE wines ADD CONSTRAINT wines_aroma_source_check
            CHECK (aroma_source IS NULL OR aroma_source = ANY (ARRAY['AI', 'USER', 'TASTING', 'COMMUNITY', 'CONSENSUS']));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wines_aroma_confidence ON wines (aroma_confidence);

-- Backfill: wines with an existing aroma_profile but no metadata get tagged as AI/MEDIUM
UPDATE wines
   SET aroma_source = 'AI', aroma_confidence = 'MEDIUM'
 WHERE aroma_profile IS NOT NULL
   AND array_length(aroma_profile, 1) > 0
   AND aroma_source IS NULL;

-- 2. Pairing feedback table
CREATE TABLE IF NOT EXISTS pairing_feedback (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid,
    wine_id uuid REFERENCES wines(id) ON DELETE SET NULL,
    dish text NOT NULL,
    rating text NOT NULL,
    category text,
    criteria_json jsonb,
    context_json jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pairing_feedback_rating_check CHECK (rating = ANY (ARRAY['UP', 'DOWN']))
);

CREATE INDEX IF NOT EXISTS idx_pairing_feedback_user ON pairing_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_pairing_feedback_wine ON pairing_feedback (wine_id);
CREATE INDEX IF NOT EXISTS idx_pairing_feedback_dish ON pairing_feedback (dish);

-- 3. Pairing cache
CREATE TABLE IF NOT EXISTS pairing_cache (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    dish_normalized text NOT NULL,
    cave_hash text,
    user_id uuid,
    payload jsonb NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pairing_cache_lookup ON pairing_cache (dish_normalized, cave_hash, user_id);
CREATE INDEX IF NOT EXISTS idx_pairing_cache_expiry ON pairing_cache (expires_at);

-- 4. Taste profile
CREATE TABLE IF NOT EXISTS taste_profile (
    user_id uuid PRIMARY KEY,
    profile_json jsonb NOT NULL,
    feedback_count integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);

COMMIT;
