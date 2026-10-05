import 'dotenv/config';

// Configuration lue depuis l'environnement, partagée par les modules du backend.

// Fail-fast: JWT_SECRET is mandatory. No silent fallback.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_me') {
  console.error('❌ JWT_SECRET is missing or insecure. Set JWT_SECRET to a long random string in your .env file.');
  process.exit(1);
}
export const JWT_SECRET = process.env.JWT_SECRET;

// ========== Security settings ==========
// Modèle : VinoFlow est une cave de FOYER partagée. Tous les comptes voient et
// modifient les mêmes vins, bouteilles, casiers… (pas de multi-tenant). La
// sécurité repose donc sur le contrôle de QUI peut avoir un compte.
export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
// Deux onglets qui rafraîchissent en même temps présentent le même refresh
// token : on tolère ce cas sur une courte fenêtre au lieu d'y voir un vol.
export const REFRESH_REUSE_GRACE_MS = 60 * 1000;
export const RESET_TOKEN_TTL_MINUTES = 60;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;
export const BCRYPT_COST = 12;
// Inscriptions fermées par défaut. Le tout premier compte reste toujours
// possible (bootstrap d'une installation neuve).
export const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
// Clés IA envoyées par le navigateur (en-têtes x-vinoflow-*-key) : acceptées
// en secours des variables d'environnement, sauf si désactivé.
export const ALLOW_CLIENT_AI_KEYS = process.env.ALLOW_CLIENT_AI_KEYS !== 'false';

// CORS: restrict to the frontend origin. Defaults to localhost for dev.
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5001';
// Public URL used in emails (password reset links).
export const APP_URL = (process.env.APP_URL || FRONTEND_URL).replace(/\/+$/, '');
