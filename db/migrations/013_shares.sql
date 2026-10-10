-- Partage public : fiche vin ou carte des vins d'un dîner, par lien sans compte.
-- Le jeton (256 bits, base64url) est la seule clé d'accès ; révocation définitive.
CREATE TABLE IF NOT EXISTS shares (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    token text NOT NULL UNIQUE,
    kind text NOT NULL CHECK (kind IN ('WINE', 'DINNER')),
    wine_id uuid REFERENCES wines(id) ON DELETE CASCADE,
    title text,
    dinner_date date,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    view_count integer NOT NULL DEFAULT 0,
    last_viewed_at timestamp with time zone,
    CHECK ((kind = 'WINE' AND wine_id IS NOT NULL) OR (kind = 'DINNER' AND title IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS share_items (
    share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    position integer NOT NULL,
    wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
    dish text,
    PRIMARY KEY (share_id, position)
);

CREATE INDEX IF NOT EXISTS idx_shares_wine ON shares (wine_id) WHERE revoked_at IS NULL;
