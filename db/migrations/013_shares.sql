-- Partage public : lien vers une fiche vin (kind = WINE) ou vers la carte des
-- vins d'un dîner composée à la main (kind = DINNER, lignes dans share_items).
-- Jeton 256 bits en base64url (43 caractères) ; révocation définitive ;
-- compteur d'ouvertures. Supprimer un vin supprime son lien de fiche et le
-- retire des cartes (cascade).
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
CREATE INDEX IF NOT EXISTS shares_wine_id_idx ON shares (wine_id);

CREATE TABLE IF NOT EXISTS share_items (
    share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    position integer NOT NULL,
    wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
    dish text,
    PRIMARY KEY (share_id, position)
);
CREATE INDEX IF NOT EXISTS share_items_wine_id_idx ON share_items (wine_id);
