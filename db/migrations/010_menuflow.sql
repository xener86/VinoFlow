-- Passerelle MenuFlow : un dîner par date (lu dans MenuFlow), le vin conseillé par VinoFlow
-- et l'empreinte de ce qui a été poussé ; rattachement des sorties du journal aux dîners.

CREATE TABLE IF NOT EXISTS dinner_pairings (
  dinner_date date PRIMARY KEY,
  menuflow_dinner_id integer,
  dish_title text NOT NULL,
  verdicts jsonb NOT NULL DEFAULT '[]',
  suggested_wine_id uuid REFERENCES wines(id) ON DELETE SET NULL,
  suggestion_reason text,
  suggested_for_title text,
  suggested_at timestamptz,
  pushed_hash text,
  pushed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- null = rattachement automatique au dîner du jour ; true = confirmé ; false = décoché.
ALTER TABLE journal ADD COLUMN IF NOT EXISTS for_dinner boolean;
