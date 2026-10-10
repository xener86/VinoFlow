-- Partage public : un seul lien actif par fiche vin, tenu en base (la route
-- reprend déjà le lien existant sous verrou ; l'index rend l'invariant vrai
-- quel que soit le chemin d'écriture).
CREATE UNIQUE INDEX IF NOT EXISTS shares_active_wine_idx ON shares (wine_id) WHERE kind = 'WINE' AND revoked_at IS NULL;
