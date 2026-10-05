-- 006 — Enrichissement fiable : cascade de recherche web avec sources.
-- Idempotente ; appliquée au démarrage du backend (src/migrations.js).

-- Niveau atteint par la cascade, sources citées, calendrier de vérification.
ALTER TABLE wines ADD COLUMN IF NOT EXISTS enrichment_basis text;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS enrichment_sources jsonb;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS enriched_at timestamp with time zone;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS enrichment_next_check_at timestamp with time zone;
-- ok | needs_review (homonymes à départager) | error
ALTER TABLE wines ADD COLUMN IF NOT EXISTS enrichment_status text;
-- Candidats quand l'identification est ambiguë (homonymes, noms approchants)
ALTER TABLE wines ADD COLUMN IF NOT EXISTS enrichment_candidates jsonb;
-- Choix de l'utilisateur parmi les candidats (repris lors des recherches suivantes)
ALTER TABLE wines ADD COLUMN IF NOT EXISTS enrichment_hint text;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS enrichment_error text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wines_enrichment_basis_check') THEN
        ALTER TABLE wines ADD CONSTRAINT wines_enrichment_basis_check
            CHECK (enrichment_basis IS NULL OR enrichment_basis = ANY (ARRAY['EXACT', 'AUTRE_MILLESIME', 'PRODUCTEUR', 'APPELLATION', 'REGLES']));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wines_enrichment_status_check') THEN
        ALTER TABLE wines ADD CONSTRAINT wines_enrichment_status_check
            CHECK (enrichment_status IS NULL OR enrichment_status = ANY (ARRAY['ok', 'needs_review', 'error']));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wines_enrichment_next_check ON wines (enrichment_next_check_at);

-- Connaissances partagées par (producteur, cuvée) : une recherche sert à tous
-- les millésimes de la cuvée (style, cépages, garde typique, sources).
CREATE TABLE IF NOT EXISTS wine_knowledge (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    producer_key text NOT NULL,
    cuvee_key text NOT NULL,
    producer text,
    cuvee text,
    data jsonb NOT NULL,
    sources jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wine_knowledge_unique UNIQUE (producer_key, cuvee_key)
);

-- Historique des enrichissements : chaque modification de fiche avec sa valeur
-- précédente (corrections réversibles), le niveau atteint et le moteur utilisé.
CREATE TABLE IF NOT EXISTS enrichment_log (
    id bigserial PRIMARY KEY,
    wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    engine text NOT NULL,
    trigger text NOT NULL,
    ok boolean NOT NULL,
    basis text,
    changes jsonb,
    sources jsonb,
    error text,
    reverted_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_enrichment_log_wine ON enrichment_log (wine_id, created_at DESC);
