-- 004 — Sécurité de l'authentification
-- Refresh tokens opaques (rotation + révocation) et jetons de réinitialisation
-- de mot de passe. Seuls les hash SHA-256 des jetons sont stockés.
-- Idempotent : peut être rejoué sans risque sur une base existante.
--
-- Base existante :
--   docker compose exec -T db psql -U vinoflow vinoflow < db/migrations/004_auth_tokens.sql

-- Horodatage du dernier changement de mot de passe (traçabilité).
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamp with time zone;

-- ──────────────────────────────────────────
-- Refresh tokens
-- ──────────────────────────────────────────
-- Un "family_id" regroupe la chaîne de rotations issue d'une même connexion.
-- Si un jeton déjà consommé est présenté à nouveau (vol probable), toute la
-- famille est révoquée.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id uuid NOT NULL,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    user_agent text
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id);

-- ──────────────────────────────────────────
-- Password reset tokens (usage unique, 1 h)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);
