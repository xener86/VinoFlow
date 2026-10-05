-- 007 — Les chaînes « null » / « undefined » saisies ou renvoyées par l'IA
-- étaient stockées telles quelles (60 cuvées, 123 parcelles… sur une cave réelle)
-- et s'affichaient « Château Lagarde null ». On les remplace par NULL.
-- Idempotente ; appliquée au démarrage du backend (src/migrations.js).
DO $$
DECLARE
    col text;
BEGIN
    FOREACH col IN ARRAY ARRAY['cuvee', 'parcel', 'producer', 'region', 'appellation', 'country',
                               'format', 'sensory_description', 'tasting_notes', 'producer_history']
    LOOP
        EXECUTE format(
            'UPDATE wines SET %1$I = NULL WHERE lower(btrim(%1$I)) IN (''null'', ''undefined'', ''nan'')',
            col);
    END LOOP;
END $$;
