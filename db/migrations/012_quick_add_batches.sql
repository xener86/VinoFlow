-- Ajout rapide : rafales déjà enregistrées. Un renvoi du même batchId (réponse
-- perdue sur un réseau de salon) renvoie le compte-rendu sans rien recréer.
CREATE TABLE IF NOT EXISTS quick_add_batches (
    id uuid PRIMARY KEY,
    user_id character varying(255),
    result jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
