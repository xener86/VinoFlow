-- Migration 003: Per-wine drinking peak window (AI-computed).
-- The naive vintage+5 / +5 formula in peakWindow.ts is wrong for prestigious /
-- long-aging wines (Margaux 1983, Vin Jaune, Sauternes...). This stores a
-- proper peak window per wine, computed via LLM based on producer, appellation,
-- vintage quality, wine style.

BEGIN;

ALTER TABLE wines ADD COLUMN IF NOT EXISTS peak_start integer;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS peak_end integer;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS peak_source text;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS peak_confidence text;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS peak_computed_at timestamp with time zone;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS peak_reasoning text;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS peak_verified_by uuid;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wines_peak_source_check') THEN
        ALTER TABLE wines ADD CONSTRAINT wines_peak_source_check
            CHECK (peak_source IS NULL OR peak_source = ANY (ARRAY['AI', 'USER', 'COMMUNITY']));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wines_peak_confidence_check') THEN
        ALTER TABLE wines ADD CONSTRAINT wines_peak_confidence_check
            CHECK (peak_confidence IS NULL OR peak_confidence = ANY (ARRAY['HIGH', 'MEDIUM', 'LOW']));
    END IF;
END $$;

COMMIT;
