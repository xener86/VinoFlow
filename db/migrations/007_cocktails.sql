-- 007 — Recettes de cocktails du Bar (jusqu'ici gardées dans le localStorage).
-- Idempotente ; appliquée au démarrage du backend (src/migrations.js).

-- id en text : le front fournit l'identifiant (UUID pour les créations IA,
-- `api-<idDrink>` pour les recettes importées de TheCocktailDB), ce qui rend
-- un nouvel enregistrement de la même recette idempotent (upsert par id).
CREATE TABLE IF NOT EXISTS cocktails (
    id text DEFAULT gen_random_uuid()::text PRIMARY KEY,
    name text NOT NULL,
    category text,
    base_spirit text,
    ingredients jsonb DEFAULT '[]'::jsonb NOT NULL,   -- [{name, amount, unit, optional}]
    instructions text[] DEFAULT '{}' NOT NULL,
    glass_type text,
    difficulty text,
    prep_time integer,
    image_url text,
    source text,                                      -- API | MANUAL | AI
    tags text[] DEFAULT '{}' NOT NULL,
    is_favorite boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cocktails_name ON cocktails (lower(name));
