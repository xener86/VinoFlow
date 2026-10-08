-- Notifications : alertes « à boire avant » et newsletter, réglées par compte.
-- La cave reste commune ; seules les préférences et l'état des alertes sont par utilisateur.

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  gotify_enabled boolean NOT NULL DEFAULT false,
  gotify_url text,
  gotify_token text,
  alerts_enabled boolean NOT NULL DEFAULT true,
  alert_ready boolean NOT NULL DEFAULT true,
  alert_closing boolean NOT NULL DEFAULT true,
  alert_past boolean NOT NULL DEFAULT true,
  horizon_months smallint NOT NULL DEFAULT 12 CHECK (horizon_months BETWEEN 1 AND 60),
  newsletter_frequency text NOT NULL DEFAULT 'monthly' CHECK (newsletter_frequency IN ('off', 'weekly', 'monthly')),
  newsletter_weekday smallint NOT NULL DEFAULT 1 CHECK (newsletter_weekday BETWEEN 1 AND 7),
  newsletter_hour smallint NOT NULL DEFAULT 9 CHECK (newsletter_hour BETWEEN 0 AND 23),
  newsletter_ai boolean NOT NULL DEFAULT true,
  last_newsletter_at timestamptz,
  alerts_seeded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wine_alert_state (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('GARDE', 'PRET', 'SE_REFERME', 'DEPASSEE')),
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, wine_id)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('alert', 'newsletter', 'test')),
  channel text NOT NULL CHECK (channel IN ('gotify', 'email')),
  ok boolean NOT NULL,
  error text,
  summary text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_log_user_sent_idx ON notification_log (user_id, sent_at DESC);
