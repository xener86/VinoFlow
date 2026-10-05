-- Cote des vins dans le temps : un point par vérification (recherche web sourcée)
-- ou par saisie manuelle. L'investi et la valeur de la cave se recalculent à
-- partir des bouteilles ; seules les cotes sont historisées.

CREATE TABLE IF NOT EXISTS wine_valuations (
  id bigserial PRIMARY KEY,
  wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  valued_at timestamptz NOT NULL DEFAULT now(),
  price_eur numeric(10,2) NOT NULL CHECK (price_eur > 0),
  low_eur numeric(10,2),
  high_eur numeric(10,2),
  basis text NOT NULL CHECK (basis IN ('EXACT', 'AUTRE_MILLESIME', 'USER')),
  basis_vintage integer,
  sources jsonb NOT NULL DEFAULT '[]',
  engine text,
  note text
);

CREATE INDEX IF NOT EXISTS wine_valuations_wine_idx ON wine_valuations (wine_id, valued_at DESC);

ALTER TABLE wines ADD COLUMN IF NOT EXISTS valuation_next_check_at timestamptz;
-- OK (cote enregistrée) | NONE (aucun prix vérifié) | ERROR (échec du moteur)
ALTER TABLE wines ADD COLUMN IF NOT EXISTS valuation_status text;
