-- 005 — Journal des appels IA et modèle d'embedding.
-- Idempotente ; appliquée au démarrage du backend (src/migrations.js).

-- Un enregistrement par appel (ou par requête d'un lot Batch), pour chiffrer
-- le coût par tâche et par modèle (GET /api/ai/usage).
CREATE TABLE IF NOT EXISTS ai_calls (
    id bigserial PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    ok boolean NOT NULL,
    latency_ms integer,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cache_read_tokens integer DEFAULT 0 NOT NULL,
    cache_write_tokens integer DEFAULT 0 NOT NULL,
    web_searches integer DEFAULT 0 NOT NULL,
    cost_usd numeric(12, 6),
    batch boolean DEFAULT false NOT NULL,
    error text
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_created_at ON ai_calls (created_at);

-- Modèle ayant produit wines.embedding : les vecteurs de text-embedding-004
-- sont incompatibles avec gemini-embedding-001 et doivent être recalculés.
ALTER TABLE wines ADD COLUMN IF NOT EXISTS embedding_model text;
