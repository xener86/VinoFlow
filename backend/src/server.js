import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import 'dotenv/config';
import { runPairing, suggestDishesForWine, pairMenu, explainPairing } from './sommelier/coordinator.js';
import { applyFeedback, getTasteProfile, upsertTasteProfile } from './sommelier/tasteProfile.js';
import { isProviderConfigured, getTaskDefaults, runWithRequestKeys } from './services/aiService.js';
import { enrichWine, aromasFromTastingNotes } from './sommelier/enrich.js';
import { computePeak, peakStatus } from './sommelier/peakCalculator.js';
import { extractFromLabel } from './sommelier/ocr.js';
import { computeBudget } from './sommelier/budget.js';
import { sendMail, renderMailHtml } from './services/mailService.js';
import { fetchCommunityData, fetchMarketValue, fetchPressScores } from './services/externalData.js';
import { updateMissingEmbeddings } from './sommelier/embeddings.js';
import { extractCriteria } from './sommelier/llm1.js';
import { setCriteriaCache } from './sommelier/cache.js';
import {
  drinkBeforeAlerts,
  anticipationForEvent,
  purchaseSuggestions,
} from './sommelier/proactive.js';
import {
  buildVerticalTasting,
  compareForDish,
  blindTasting,
  agingRecommendations,
  findDuplicates,
  cellarProjection,
} from './sommelier/advanced.js';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3100;

// Fail-fast: JWT_SECRET is mandatory. No silent fallback.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_me') {
  console.error('❌ JWT_SECRET is missing or insecure. Set JWT_SECRET to a long random string in your .env file.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// ========== Security settings ==========
// Modèle : VinoFlow est une cave de FOYER partagée. Tous les comptes voient et
// modifient les mêmes vins, bouteilles, casiers… (pas de multi-tenant). La
// sécurité repose donc sur le contrôle de QUI peut avoir un compte.
const ACCESS_TOKEN_TTL = '15m';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;
// Deux onglets qui rafraîchissent en même temps présentent le même refresh
// token : on tolère ce cas sur une courte fenêtre au lieu d'y voir un vol.
const REFRESH_REUSE_GRACE_MS = 60 * 1000;
const RESET_TOKEN_TTL_MINUTES = 60;
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 200;
const BCRYPT_COST = 12;
// Inscriptions fermées par défaut. Le tout premier compte reste toujours
// possible (bootstrap d'une installation neuve).
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
// Clés IA envoyées par le navigateur (en-têtes x-vinoflow-*-key) : acceptées
// en secours des variables d'environnement, sauf si désactivé.
const ALLOW_CLIENT_AI_KEYS = process.env.ALLOW_CLIENT_AI_KEYS !== 'false';

// CORS: restrict to the frontend origin. Defaults to localhost for dev.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5001';
// Public URL used in emails (password reset links).
const APP_URL = (process.env.APP_URL || FRONTEND_URL).replace(/\/+$/, '');

// nginx (frontend container) sits in front of the backend: trust exactly one
// hop so req.ip is the real client IP (rate limiting). Set TRUST_PROXY=2 if
// another reverse proxy (Traefik, Caddy…) sits in front of nginx.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
// HSTS : à poser sur le reverse proxy TLS (le backend ne voit que du HTTP).
app.use(helmet({ strictTransportSecurity: false }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Auth middleware: verifies JWT and attaches req.user
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ msg: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    // Les anciens JWT 30 j (sans typ) sont refusés : reconnexion obligatoire.
    if (payload.typ !== 'access') throw new Error('legacy token');
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ msg: 'Invalid or expired token' });
  }
};

// ========== Rate limiting ==========
const rateLimitHandler = (req, res, next, options) =>
  res.status(options.statusCode).json({ msg: 'Trop de tentatives, réessayez dans quelques minutes.' });

// Strict: login, signup, forgot/reset, change password (par IP).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Refresh / logout: appelés automatiquement par chaque onglet ouvert.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Routes IA coûteuses : par utilisateur (monté après authenticate).
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req.ip),
  // Les lectures /api/sommelier/* qui n'appellent pas de LLM (alertes,
  // profil de goût…) ne sont pas comptées. pair-stream, lui, est un GET coûteux.
  skip: (req) => req.method === 'GET' && req.baseUrl === '/api/sommelier' && req.path !== '/pair-stream',
  handler: (req, res, next, options) =>
    res.status(options.statusCode).json({ msg: 'Limite de requêtes IA atteinte, réessayez dans quelques minutes.' }),
});

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// Helper functions
const toCamelCase = (str) => str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

const convertKeysToCamelCase = (obj) => {
  if (Array.isArray(obj)) return obj.map(convertKeysToCamelCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      acc[toCamelCase(key)] = convertKeysToCamelCase(obj[key]);
      return acc;
    }, {});
  }
  return obj;
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== AUTH ENDPOINTS ==========

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const newOpaqueToken = () => crypto.randomBytes(32).toString('base64url');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Hash factice pour que login prenne le même temps que l'email existe ou non.
const DUMMY_HASH = bcrypt.hashSync('vinoflow-timing-equalizer', BCRYPT_COST);

const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`;
  }
  return null;
};

const countUsers = async (db = pool) => {
  const { rows } = await db.query('SELECT count(*)::int AS count FROM users');
  return rows[0].count;
};

const signAccessToken = (user) =>
  jwt.sign({ userId: user.id, email: user.email, typ: 'access' }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL, algorithm: 'HS256' });

// Crée un refresh token opaque ; seul son hash est stocké.
const insertRefreshToken = async (db, userId, familyId, userAgent) => {
  const token = newOpaqueToken();
  await db.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, now() + make_interval(days => $4), $5)`,
    [userId, familyId, sha256(token), REFRESH_TOKEN_TTL_DAYS, (userAgent || '').slice(0, 200)]
  );
  return token;
};

const sessionPayload = (user, refreshToken) => ({
  user: { id: user.id, email: user.email },
  access_token: signAccessToken(user),
  refresh_token: refreshToken,
  expires_in: ACCESS_TOKEN_TTL_SECONDS,
});

// Nouvelle session (nouvelle famille de refresh tokens).
const createSession = async (db, user, req) => {
  const refreshToken = await insertRefreshToken(db, user.id, crypto.randomUUID(), req.headers['user-agent']);
  return sessionPayload(user, refreshToken);
};

const revokeAllRefreshTokens = (db, userId) =>
  db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);

const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// Public: lets the login page know whether to show the signup form.
app.get('/api/auth/config', refreshLimiter, async (req, res) => {
  try {
    const users = await countUsers();
    res.json({
      signupEnabled: ALLOW_SIGNUP || users === 0,
      bootstrap: users === 0,
      passwordMinLength: PASSWORD_MIN_LENGTH,
    });
  } catch (error) {
    console.error('Auth config error:', error);
    res.status(500).json({ msg: 'Configuration indisponible' });
  }
});

// Signup
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ msg: 'Email invalide.' });
    }
    const pwdError = validatePassword(password);
    if (pwdError) return res.status(400).json({ msg: pwdError });

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const session = await withTransaction(async (client) => {
      // Sérialise les inscriptions : évite que deux "premiers" comptes passent
      // en même temps le contrôle de bootstrap.
      await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
      if (!ALLOW_SIGNUP && (await countUsers(client)) > 0) return null;

      const result = await client.query(
        `INSERT INTO users (email, password_hash, password_changed_at)
         VALUES ($1, $2, now())
         RETURNING id, email`,
        [email.trim().toLowerCase(), passwordHash]
      );
      return createSession(client, result.rows[0], req);
    });

    if (!session) {
      return res.status(403).json({ msg: "Les inscriptions sont fermées. Demandez à l'administrateur de la cave de vous créer un accès." });
    }
    res.status(201).json(session);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ msg: 'Un compte existe déjà avec cet email.' });
    }
    console.error('Signup error:', error);
    res.status(500).json({ msg: "Échec de l'inscription." });
  }
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ msg: 'Email et mot de passe requis.' });
    }

    const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(password.slice(0, PASSWORD_MAX_LENGTH), user ? user.password_hash : DUMMY_HASH);

    if (!user || !valid) {
      return res.status(401).json({ msg: 'Identifiants invalides.' });
    }

    // Remonte progressivement le coût bcrypt des anciens comptes (cost 10).
    if (bcrypt.getRounds(user.password_hash) < BCRYPT_COST) {
      const upgraded = await bcrypt.hash(password, BCRYPT_COST);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [upgraded, user.id]);
    }

    res.json(await createSession(pool, user, req));
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ msg: 'Échec de la connexion.' });
  }
});

// Refresh: échange un refresh token contre une nouvelle paire (rotation).
app.post('/api/auth/refresh', refreshLimiter, async (req, res) => {
  const { refresh_token: refreshToken } = req.body || {};
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return res.status(400).json({ msg: 'refresh_token requis.' });
  }
  try {
    const session = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at, u.email
           FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
          WHERE rt.token_hash = $1
          FOR UPDATE OF rt`,
        [sha256(refreshToken)]
      );
      const rt = rows[0];
      if (!rt) return null;

      if (rt.revoked_at) {
        // Jeton déjà consommé : hors fenêtre de grâce, on considère qu'il a
        // fuité et on coupe toute la session qui en descend.
        if (Date.now() - new Date(rt.revoked_at).getTime() > REFRESH_REUSE_GRACE_MS) {
          await client.query(
            'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
            [rt.family_id]
          );
          console.warn(`⚠️ Refresh token réutilisé pour l'utilisateur ${rt.user_id} — session révoquée.`);
        }
        return null;
      }
      if (new Date(rt.expires_at) <= new Date()) return null;

      await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [rt.id]);
      const next = await insertRefreshToken(client, rt.user_id, rt.family_id, req.headers['user-agent']);
      return sessionPayload({ id: rt.user_id, email: rt.email }, next);
    });

    if (!session) return res.status(401).json({ msg: 'Session expirée.' });
    res.json(session);
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ msg: 'Échec du rafraîchissement de session.' });
  }
});

// Logout: révoque la session (toute la famille du refresh token présenté).
app.post('/api/auth/logout', refreshLimiter, async (req, res) => {
  const { refresh_token: refreshToken } = req.body || {};
  try {
    if (typeof refreshToken === 'string' && refreshToken) {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
          WHERE revoked_at IS NULL
            AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
        [sha256(refreshToken)]
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ msg: 'Échec de la déconnexion.' });
  }
});

// Change password (connecté) : révoque toutes les sessions puis en rouvre une
// pour l'appareil courant.
app.post('/api/auth/password', authLimiter, authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ msg: 'Mot de passe actuel requis.' });
    }
    const pwdError = validatePassword(newPassword);
    if (pwdError) return res.status(400).json({ msg: pwdError });

    const { rows } = await pool.query('SELECT id, email, password_hash FROM users WHERE id = $1', [req.user.userId]);
    const user = rows[0];
    if (!user) return res.status(401).json({ msg: 'Unauthorized' });
    if (!(await bcrypt.compare(currentPassword.slice(0, PASSWORD_MAX_LENGTH), user.password_hash))) {
      return res.status(400).json({ msg: 'Mot de passe actuel incorrect.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    const session = await withTransaction(async (client) => {
      await client.query(
        'UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2',
        [passwordHash, user.id]
      );
      await revokeAllRefreshTokens(client, user.id);
      return createSession(client, user, req);
    });
    res.json(session);
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ msg: 'Échec du changement de mot de passe.' });
  }
});

const sendPasswordResetEmail = async (email) => {
  const { rows } = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user) return;

  const token = newOpaqueToken();
  await withTransaction(async (client) => {
    // Un seul lien valide à la fois.
    await client.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [user.id, sha256(token), RESET_TOKEN_TTL_MINUTES]
    );
  });

  // Jeton dans le fragment (#) : jamais envoyé au serveur ni dans le Referer.
  const link = `${APP_URL}/reset-password#token=${token}`;
  const intro = 'Une demande de réinitialisation du mot de passe de votre compte VinoFlow a été faite.';
  const validity = 'Ce lien est valable une heure et ne peut servir qu’une seule fois.';
  const ignore = 'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet email : votre mot de passe reste inchangé.';
  const { sent } = await sendMail({
    to: user.email,
    subject: 'Réinitialisation de votre mot de passe VinoFlow',
    text: `Bonjour,\n\n${intro}\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n${link}\n\n${validity}\n\n${ignore}\n\n— VinoFlow`,
    html: renderMailHtml({
      title: 'Réinitialisation du mot de passe',
      paragraphs: [intro],
      cta: { label: 'Choisir un nouveau mot de passe', url: link },
      footer: [validity, ignore],
    }),
  });
  if (!sent) console.log(`🔑 Lien de réinitialisation (email non envoyé) : ${link}`);
};

// Forgot password: réponse identique que l'email existe ou non ; le travail
// (lookup, jeton, envoi) se fait après la réponse pour ne rien trahir par le
// temps de réponse non plus.
app.post('/api/auth/forgot', authLimiter, (req, res) => {
  const { email } = req.body || {};
  res.json({ msg: 'Si un compte existe pour cet email, un lien de réinitialisation vient d’être envoyé.' });
  if (typeof email === 'string' && EMAIL_RE.test(email.trim())) {
    sendPasswordResetEmail(email.trim().toLowerCase()).catch((error) => {
      console.error('Forgot password error:', error);
    });
  }
});

// Reset password: jeton à usage unique, valable 1 h.
app.post('/api/auth/reset', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ msg: 'Lien invalide ou expiré.' });
    }
    const pwdError = validatePassword(password);
    if (pwdError) return res.status(400).json({ msg: pwdError });

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const ok = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, user_id FROM password_reset_tokens
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
          FOR UPDATE`,
        [sha256(token)]
      );
      const prt = rows[0];
      if (!prt) return false;
      await client.query(
        'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
        [prt.user_id]
      );
      await client.query(
        'UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2',
        [passwordHash, prt.user_id]
      );
      await revokeAllRefreshTokens(client, prt.user_id);
      return true;
    });

    if (!ok) return res.status(400).json({ msg: 'Lien invalide ou expiré.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ msg: 'Échec de la réinitialisation.' });
  }
});

// ========== Protected routes (require JWT) ==========
// All /api/* routes below this point require a valid JWT token.
app.use('/api', authenticate);

// Coûteuses en appels IA → limitées par utilisateur.
app.use(
  [
    '/api/sommelier',
    '/api/wines/enrich-aromas',
    '/api/wines/refresh-peaks',
    '/api/wines/bulk-set-peaks',
    '/api/wines/extract-from-image',
    '/api/wines/refresh-embeddings',
  ],
  aiLimiter
);

// ========== AI keys per-request middleware ==========
// Frontend can send the user's Settings keys via headers, so the backend can
// use them when env vars are not set (env vars always win). AsyncLocalStorage
// propagates them through the entire request chain without changing function
// signatures. Risque : ces clés vivent dans le localStorage du navigateur
// (exposées à toute XSS) et transitent à chaque requête — préférer les
// variables d'environnement, et ALLOW_CLIENT_AI_KEYS=false pour les refuser.
app.use('/api', (req, res, next) => {
  const keys = ALLOW_CLIENT_AI_KEYS
    ? {
        gemini: req.headers['x-vinoflow-gemini-key'] || null,
        claude: req.headers['x-vinoflow-claude-key'] || null,
      }
    : {};
  runWithRequestKeys(keys, () => next());
});

// ========== WINES ENDPOINTS ==========

app.get('/api/wines', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', b.id,
              'wine_id', b.wine_id,
              'location', b.location,
              'added_by_user_id', b.added_by_user_id,
              'purchase_date', b.purchase_date,
              'is_consumed', b.is_consumed,
              'consumed_date', b.consumed_date,
              'gifted_to', b.gifted_to,
              'gift_occasion', b.gift_occasion,
              'purchase_price', b.purchase_price,
              'created_at', b.created_at
            ) ORDER BY b.created_at
          ) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) as bottles
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `);
    const wines = convertKeysToCamelCase(result.rows).map(w => ({
      ...w,
      bottles: (w.bottles || []).map(b => {
        // Normalize legacy {"label": "..."} locations to plain strings
        if (b.location && typeof b.location === 'object' && 'label' in b.location && !('rackId' in b.location)) {
          b.location = b.location.label;
        }
        return b;
      })
    }));
    res.json(wines);
  } catch (error) {
    console.error('Error fetching wines:', error);
    res.status(500).json({ error: 'Failed to fetch wines' });
  }
});

app.get('/api/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT
        w.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', b.id,
              'wine_id', b.wine_id,
              'location', b.location,
              'added_by_user_id', b.added_by_user_id,
              'purchase_date', b.purchase_date,
              'is_consumed', b.is_consumed,
              'consumed_date', b.consumed_date,
              'gifted_to', b.gifted_to,
              'gift_occasion', b.gift_occasion,
              'purchase_price', b.purchase_price,
              'created_at', b.created_at
            ) ORDER BY b.created_at
          ) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) as bottles
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id
      WHERE w.id = $1
      GROUP BY w.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }
    
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error fetching wine:', error);
    res.status(500).json({ error: 'Failed to fetch wine' });
  }
});

app.post('/api/wines', async (req, res) => {
  try {
    const wine = req.body;
    const result = await pool.query(`
      INSERT INTO wines (
        name, cuvee, parcel, producer, vintage, region, country, type,
        grape_varieties, format, personal_notes, sensory_description,
        aroma_profile, tasting_notes, suggested_food_pairings,
        producer_history, enriched_by_ai, ai_confidence, is_favorite, sensory_profile
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `, [
      wine.name, wine.cuvee, wine.parcel, wine.producer, wine.vintage,
      wine.region, wine.country, wine.type, wine.grapeVarieties, wine.format,
      wine.personalNotes, wine.sensoryDescription, wine.aromaProfile,
      wine.tastingNotes, wine.suggestedFoodPairings, wine.producerHistory,
      wine.enrichedByAi, wine.aiConfidence, wine.isFavorite, wine.sensoryProfile
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating wine:', error);
    res.status(500).json({ error: 'Failed to create wine' });
  }
});

app.put('/api/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', async (req, res) => {
  try {
    const { id } = req.params;
    const wine = req.body;
    const result = await pool.query(`
      UPDATE wines SET
        name = $1, cuvee = $2, parcel = $3, producer = $4, vintage = $5,
        region = $6, country = $7, type = $8, grape_varieties = $9, format = $10,
        personal_notes = $11, sensory_description = $12, aroma_profile = $13,
        tasting_notes = $14, suggested_food_pairings = $15, producer_history = $16,
        enriched_by_ai = $17, ai_confidence = $18, is_favorite = $19,
        sensory_profile = $20, updated_at = NOW()
      WHERE id = $21
      RETURNING *
    `, [
      wine.name, wine.cuvee, wine.parcel, wine.producer, wine.vintage,
      wine.region, wine.country, wine.type, wine.grapeVarieties, wine.format,
      wine.personalNotes, wine.sensoryDescription, wine.aromaProfile,
      wine.tastingNotes, wine.suggestedFoodPairings, wine.producerHistory,
      wine.enrichedByAi, wine.aiConfidence, wine.isFavorite, wine.sensoryProfile, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }
    
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating wine:', error);
    res.status(500).json({ error: 'Failed to update wine' });
  }
});

app.delete('/api/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM wines WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting wine:', error);
    res.status(500).json({ error: 'Failed to delete wine' });
  }
});

// ========== BOTTLES ENDPOINTS ==========

app.get('/api/bottles', async (req, res) => {
  try {
    const { wineId } = req.query;
    const query = wineId
      ? 'SELECT * FROM bottles WHERE wine_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM bottles ORDER BY created_at DESC';
    const params = wineId ? [wineId] : [];
    const result = await pool.query(query, params);
    const bottles = convertKeysToCamelCase(result.rows).map(b => {
      // Normalize legacy {"label": "..."} locations to plain strings
      if (b.location && typeof b.location === 'object' && 'label' in b.location && !('rackId' in b.location)) {
        b.location = b.location.label;
      }
      return b;
    });
    res.json(bottles);
  } catch (error) {
    console.error('Error fetching bottles:', error);
    res.status(500).json({ error: 'Failed to fetch bottles' });
  }
});

app.post('/api/bottles', async (req, res) => {
  try {
    const bottle = req.body;
    
    // Store string locations as JSON strings (not objects like {"label": "..."})
    let locationValue = bottle.location;
    if (!locationValue) locationValue = 'Non trié';
    const locationJson = typeof locationValue === 'string'
      ? JSON.stringify(locationValue)   // e.g. '"Non trié"' — valid jsonb string
      : JSON.stringify(locationValue);  // e.g. '{"rackId":"...","x":0,"y":0}'

    const result = await pool.query(`
      INSERT INTO bottles (wine_id, location, added_by_user_id, purchase_date, is_consumed, purchase_price)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      bottle.wineId ?? bottle.wine_id,
      locationJson,
      bottle.addedByUserId ?? bottle.added_by_user_id,
      bottle.purchaseDate ?? bottle.purchase_date,
      bottle.isConsumed ?? bottle.is_consumed ?? false,
      bottle.purchasePrice ?? bottle.purchase_price ?? null
    ]);
    
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating bottle:', error);
    res.status(500).json({ error: 'Failed to create bottle' });
  }
});

app.put('/api/bottles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build a dynamic partial UPDATE based on which fields the client sent.
    // This lets clients explicitly set fields to null (clearing them) while
    // leaving untouched fields alone.
    const fields = [];
    const values = [id];
    let i = 2;
    const add = (col, val) => { fields.push(`${col} = $${i++}`); values.push(val); };

    if ('location' in updates) {
      const locValue = updates.location ?? 'Non trié';
      add('location', JSON.stringify(locValue));
    }
    if ('isConsumed' in updates) add('is_consumed', updates.isConsumed);
    if ('consumedDate' in updates) add('consumed_date', updates.consumedDate);
    if ('giftedTo' in updates) add('gifted_to', updates.giftedTo);
    if ('giftOccasion' in updates) add('gift_occasion', updates.giftOccasion);
    if ('purchasePrice' in updates) add('purchase_price', updates.purchasePrice);

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const result = await pool.query(
      `UPDATE bottles SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bottle not found' });
    }
    
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating bottle:', error);
    res.status(500).json({ error: 'Failed to update bottle' });
  }
});

app.delete('/api/bottles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM bottles WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bottle not found' });
    }
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting bottle:', error);
    res.status(500).json({ error: 'Failed to delete bottle' });
  }
});

// ========== RACKS ENDPOINTS ==========

app.get('/api/racks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM racks ORDER BY sort_order ASC, created_at ASC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching racks:', error);
    res.status(500).json({ error: 'Failed to fetch racks' });
  }
});

app.post('/api/racks', async (req, res) => {
  try {
    const rack = req.body;
    const result = await pool.query(`
      INSERT INTO racks (name, width, height, type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [rack.name, rack.width, rack.height, rack.type]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating rack:', error);
    res.status(500).json({ error: 'Failed to create rack' });
  }
});

app.put('/api/racks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [id];
    let i = 2;
    const add = (col, val) => { fields.push(`${col} = $${i++}`); values.push(val); };
    if ('name' in updates) add('name', updates.name);
    if ('width' in updates) add('width', updates.width);
    if ('height' in updates) add('height', updates.height);
    if ('type' in updates) add('type', updates.type);
    if ('sortOrder' in updates) add('sort_order', updates.sortOrder);

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const result = await pool.query(
      `UPDATE racks SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rack not found' });
    }
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating rack:', error);
    res.status(500).json({ error: 'Failed to update rack' });
  }
});

app.post('/api/racks/reorder', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rackIds } = req.body;
    if (!Array.isArray(rackIds)) {
      return res.status(400).json({ error: 'rackIds must be an array' });
    }
    await client.query('BEGIN');
    for (let i = 0; i < rackIds.length; i++) {
      await client.query('UPDATE racks SET sort_order = $1 WHERE id = $2', [i, rackIds[i]]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reordering racks:', error);
    res.status(500).json({ error: 'Failed to reorder racks' });
  } finally {
    client.release();
  }
});

app.delete('/api/racks/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    // Migrate bottles from this rack to "Non trié" before deleting
    await client.query(
      `UPDATE bottles SET location = '"Non trié"'::jsonb WHERE location->>'rackId' = $1 AND is_consumed = false`,
      [id]
    );
    const result = await client.query('DELETE FROM racks WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rack not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true, id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting rack:', error);
    res.status(500).json({ error: 'Failed to delete rack' });
  } finally {
    client.release();
  }
});

// ========== SPIRITS ENDPOINTS ==========

app.get('/api/spirits', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM spirits ORDER BY added_at DESC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching spirits:', error);
    res.status(500).json({ error: 'Failed to fetch spirits' });
  }
});

app.get('/api/spirits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM spirits WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spirit not found' });
    }
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error fetching spirit:', error);
    res.status(500).json({ error: 'Failed to fetch spirit' });
  }
});

app.post('/api/spirits', async (req, res) => {
  try {
    const spirit = req.body;
    const result = await pool.query(`
      INSERT INTO spirits (
        name, category, distillery, region, country, age, cask_type, abv, format,
        description, producer_history, tasting_notes, aroma_profile,
        suggested_cocktails, culinary_pairings, enriched_by_ai, is_opened,
        inventory_level, is_luxury
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      spirit.name, spirit.category, spirit.distillery, spirit.region, spirit.country,
      spirit.age, spirit.caskType, spirit.abv, spirit.format, spirit.description,
      spirit.producerHistory, spirit.tastingNotes, spirit.aromaProfile,
      spirit.suggestedCocktails, spirit.culinaryPairings, spirit.enrichedByAi,
      spirit.isOpened, spirit.inventoryLevel, spirit.isLuxury
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating spirit:', error);
    res.status(500).json({ error: 'Failed to create spirit' });
  }
});

app.put('/api/spirits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const spirit = req.body;
    const result = await pool.query(`
      UPDATE spirits SET
        name = $1, category = $2, distillery = $3, region = $4, country = $5,
        age = $6, cask_type = $7, abv = $8, format = $9, description = $10,
        producer_history = $11, tasting_notes = $12, aroma_profile = $13,
        suggested_cocktails = $14, culinary_pairings = $15, enriched_by_ai = $16,
        is_opened = $17, inventory_level = $18, is_luxury = $19
      WHERE id = $20
      RETURNING *
    `, [
      spirit.name, spirit.category, spirit.distillery, spirit.region, spirit.country,
      spirit.age, spirit.caskType, spirit.abv, spirit.format, spirit.description,
      spirit.producerHistory, spirit.tastingNotes, spirit.aromaProfile,
      spirit.suggestedCocktails, spirit.culinaryPairings, spirit.enrichedByAi,
      spirit.isOpened, spirit.inventoryLevel, spirit.isLuxury, id
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spirit not found' });
    }
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating spirit:', error);
    res.status(500).json({ error: 'Failed to update spirit' });
  }
});

app.delete('/api/spirits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM spirits WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spirit not found' });
    }
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting spirit:', error);
    res.status(500).json({ error: 'Failed to delete spirit' });
  }
});

// ========== TASTING NOTES ENDPOINTS ==========

app.get('/api/tasting-notes', async (req, res) => {
  try {
    const { wineId } = req.query;
    const query = wineId
      ? 'SELECT * FROM tasting_notes WHERE wine_id = $1 ORDER BY date DESC'
      : 'SELECT * FROM tasting_notes ORDER BY date DESC';
    const params = wineId ? [wineId] : [];
    const result = await pool.query(query, params);
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching tasting notes:', error);
    res.status(500).json({ error: 'Failed to fetch tasting notes' });
  }
});

app.post('/api/tasting-notes', async (req, res) => {
  try {
    const note = req.body;
    const result = await pool.query(`
      INSERT INTO tasting_notes (
        wine_id, date, overall_rating, visual_notes, nose_notes, palate_notes,
        general_notes, occasion, companions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      note.wineId, note.date || new Date().toISOString(),
      note.overallRating ?? null,
      note.visualNotes ?? null,
      note.noseNotes ?? null,
      note.palateNotes ?? null,
      note.generalNotes ?? null,
      note.occasion ?? null,
      note.companions ?? null
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating tasting note:', error);
    res.status(500).json({ error: 'Failed to create tasting note' });
  }
});

app.delete('/api/tasting-notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tasting_notes WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tasting note not found' });
    }
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting tasting note:', error);
    res.status(500).json({ error: 'Failed to delete tasting note' });
  }
});

// ========== HISTORY/JOURNAL ENDPOINTS ==========

app.get('/api/history', async (req, res) => {
  try {
    const { wineId } = req.query;
    let query = 'SELECT * FROM journal';
    const params = [];
    if (wineId) {
      query += ' WHERE wine_id = $1';
      params.push(wineId);
    }
    query += ' ORDER BY date DESC';
    const result = await pool.query(query, params);
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.post('/api/history', async (req, res) => {
  try {
    const entry = req.body;
    // ID is always server-generated (gen_random_uuid default) to prevent
    // clients from spoofing or colliding IDs.
    const result = await pool.query(`
      INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, description, from_location, to_location, recipient, occasion, note, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      entry.date || new Date().toISOString(),
      entry.type || 'NOTE',
      entry.wineId || entry.wine_id || null,
      entry.wineName || entry.wine_name || 'Vin inconnu',
      entry.wineVintage || entry.wine_vintage || null,
      entry.quantity || null,
      entry.description || null,
      entry.fromLocation || entry.from_location || null,
      entry.toLocation || entry.to_location || null,
      entry.recipient || null,
      entry.occasion || null,
      entry.note || null,
      entry.userId || entry.user_id || null
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating history:', error);
    res.status(500).json({ error: 'Failed to create history entry' });
  }
});

// ========== WISHLIST ENDPOINTS ==========

app.get('/api/wishlist', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM wishlist ORDER BY added_at DESC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

app.post('/api/wishlist', async (req, res) => {
  try {
    const item = req.body;
    const result = await pool.query(`
      INSERT INTO wishlist (name, producer, region, appellation, type, vintage, notes, source, estimated_price, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      item.name, item.producer || null, item.region || null, item.appellation || null,
      item.type || null, item.vintage || null, item.notes || null, item.source || null,
      item.estimatedPrice ?? item.estimated_price ?? null, item.priority || 'MEDIUM'
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating wishlist item:', error);
    res.status(500).json({ error: 'Failed to create wishlist item' });
  }
});

app.delete('/api/wishlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM wishlist WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting wishlist item:', error);
    res.status(500).json({ error: 'Failed to delete wishlist item' });
  }
});

// ========== SOMMELIER V2 ENDPOINTS ==========

// Helper: load full inventory for a user
const loadInventory = async () => {
  const result = await pool.query(`
    SELECT
      w.*,
      COALESCE(
        (SELECT count(*) FROM bottles b WHERE b.wine_id = w.id AND b.is_consumed = false),
        0
      )::int AS inventory_count
    FROM wines w
    ORDER BY w.created_at DESC
  `);
  return convertKeysToCamelCase(result.rows);
};

// Run the full pairing pipeline (LLM1 → rules → score → LLM2)
app.post('/api/sommelier/pair', async (req, res) => {
  try {
    const { dish, context, skipCache } = req.body;
    if (!dish) return res.status(400).json({ error: 'dish is required' });

    const inventory = await loadInventory();
    const userId = req.user?.userId;

    // Load few-shot from feedback (limited to recent 30 entries)
    let userFeedback = [];
    if (userId) {
      const fb = await pool.query(`
        SELECT pf.dish, pf.rating, pf.category, w.name || ' ' || COALESCE(w.vintage::text, '') AS wine_label
          FROM pairing_feedback pf
          LEFT JOIN wines w ON w.id = pf.wine_id
         WHERE pf.user_id = $1
         ORDER BY pf.created_at DESC
         LIMIT 30
      `, [userId]);
      userFeedback = fb.rows;
    }

    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;

    const result = await runPairing({
      pool,
      inventory,
      dish,
      context: context || {},
      userId,
      userFeedback,
      tasteProfile,
      skipCache: Boolean(skipCache),
    });

    res.json(result);
  } catch (error) {
    console.error('Sommelier pair error:', error);
    res.status(500).json({ error: 'Failed to compute pairing', details: error.message });
  }
});

// Record user feedback on a sommelier suggestion
app.post('/api/sommelier/feedback', async (req, res) => {
  try {
    const { wineId, dish, rating, category, criteria, context } = req.body;
    if (!dish || !rating || !['UP', 'DOWN'].includes(rating)) {
      return res.status(400).json({ error: 'dish and rating (UP|DOWN) are required' });
    }

    const userId = req.user?.userId;
    await pool.query(`
      INSERT INTO pairing_feedback (user_id, wine_id, dish, rating, category, criteria_json, context_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId, wineId || null, dish, rating, category || null, criteria || null, context || null]);

    // Update taste profile (Phase 2.10)
    if (userId && wineId) {
      const wineRes = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
      if (wineRes.rows.length > 0) {
        const wine = convertKeysToCamelCase(wineRes.rows[0]);
        const current = await getTasteProfile(pool, userId);
        const next = applyFeedback(current, wine, rating);
        await upsertTasteProfile(pool, userId, next);
      }
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Sommelier feedback error:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

// Phase 7.1 — Reverse pairing: vin → plats
app.post('/api/sommelier/reverse-pair', async (req, res) => {
  try {
    const { wineId } = req.body;
    if (!wineId) return res.status(400).json({ error: 'wineId required' });
    const wineRes = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
    if (wineRes.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(wineRes.rows[0]);
    const result = await suggestDishesForWine(wine);
    res.json(result);
  } catch (error) {
    console.error('Reverse pair error:', error);
    res.status(500).json({ error: 'Failed to compute reverse pairing' });
  }
});

// Phase 7.2 — Multi-course menu pairing
app.post('/api/sommelier/menu', async (req, res) => {
  try {
    const { dishes, context } = req.body;
    if (!Array.isArray(dishes) || dishes.length === 0) {
      return res.status(400).json({ error: 'dishes must be a non-empty array' });
    }
    const userId = req.user?.userId;
    const inventory = await loadInventory();
    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;
    const result = await pairMenu({ pool, inventory, dishes, userId, userFeedback: [], tasteProfile });
    res.json(result);
  } catch (error) {
    console.error('Menu pair error:', error);
    res.status(500).json({ error: 'Failed to pair menu' });
  }
});

// Phase 13.1 — Mode "explique-moi" pour un accord
app.post('/api/sommelier/explain', async (req, res) => {
  try {
    const { dish, wineId, criteria } = req.body;
    if (!dish || !wineId) return res.status(400).json({ error: 'dish and wineId required' });
    const wineRes = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
    if (wineRes.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(wineRes.rows[0]);
    const explanation = await explainPairing(dish, wine, criteria);
    res.json({ explanation });
  } catch (error) {
    console.error('Explain pairing error:', error);
    res.status(500).json({ error: 'Failed to explain pairing' });
  }
});

// ────────────────────────────────────────────
// Phase 8 — Proactive features
// ────────────────────────────────────────────

app.get('/api/sommelier/alerts/drink-before', async (req, res) => {
  try {
    const horizon = parseInt(req.query.horizonMonths) || 12;
    const inventory = await loadInventory();
    const alerts = drinkBeforeAlerts(inventory, { horizonMonths: horizon });
    res.json({ count: alerts.length, alerts });
  } catch (error) {
    console.error('drink-before error:', error);
    res.status(500).json({ error: 'Failed to compute alerts' });
  }
});

app.post('/api/sommelier/anticipation', async (req, res) => {
  try {
    const { eventDate, limit } = req.body;
    if (!eventDate) return res.status(400).json({ error: 'eventDate required' });
    const inventory = await loadInventory();
    const result = anticipationForEvent(inventory, eventDate, { limit: limit ?? 5 });
    res.json({ event: eventDate, count: result.length, suggestions: result });
  } catch (error) {
    console.error('anticipation error:', error);
    res.status(500).json({ error: 'Failed to compute anticipation' });
  }
});

app.get('/api/sommelier/purchase-suggestions', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const journal = (await pool.query('SELECT * FROM journal ORDER BY date DESC LIMIT 500')).rows;
    const suggestions = purchaseSuggestions(inventory, convertKeysToCamelCase(journal));
    res.json({ count: suggestions.length, suggestions });
  } catch (error) {
    console.error('purchase-suggestions error:', error);
    res.status(500).json({ error: 'Failed to compute purchase suggestions' });
  }
});

// ────────────────────────────────────────────
// Phase 10 — Advanced pairing modes
// ────────────────────────────────────────────

app.post('/api/sommelier/vertical', async (req, res) => {
  try {
    const { producer } = req.body;
    if (!producer) return res.status(400).json({ error: 'producer required' });
    const inventory = await loadInventory();
    const result = buildVerticalTasting(inventory, producer);
    res.json(result);
  } catch (error) {
    console.error('vertical error:', error);
    res.status(500).json({ error: 'Failed to build vertical' });
  }
});

app.post('/api/sommelier/compare', async (req, res) => {
  try {
    const { dish, wineAId, wineBId } = req.body;
    if (!dish || !wineAId || !wineBId) {
      return res.status(400).json({ error: 'dish, wineAId, wineBId required' });
    }
    const r = await pool.query('SELECT * FROM wines WHERE id = ANY($1)', [[wineAId, wineBId]]);
    if (r.rows.length !== 2) return res.status(404).json({ error: 'Wines not found' });
    const wineA = convertKeysToCamelCase(r.rows.find(w => w.id === wineAId));
    const wineB = convertKeysToCamelCase(r.rows.find(w => w.id === wineBId));
    const result = await compareForDish(dish, wineA, wineB);
    res.json(result);
  } catch (error) {
    console.error('compare error:', error);
    res.status(500).json({ error: 'Failed to compare wines' });
  }
});

app.get('/api/sommelier/blind', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const result = blindTasting(inventory);
    if (!result) return res.status(404).json({ error: 'No wine in cave' });
    res.json(result);
  } catch (error) {
    console.error('blind error:', error);
    res.status(500).json({ error: 'Failed to start blind tasting' });
  }
});

// ────────────────────────────────────────────
// Phase 11 — Wine lifecycle
// ────────────────────────────────────────────

app.get('/api/wines/aging-recommendations', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const recs = agingRecommendations(inventory);
    res.json({ count: recs.length, recommendations: recs });
  } catch (error) {
    console.error('aging-recommendations error:', error);
    res.status(500).json({ error: 'Failed to compute aging recommendations' });
  }
});

app.get('/api/wines/duplicates', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const dupes = findDuplicates(inventory);
    res.json({ count: dupes.length, groups: dupes });
  } catch (error) {
    console.error('duplicates error:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

app.get('/api/cellar/projection', async (req, res) => {
  try {
    const yearsAhead = parseInt(req.query.yearsAhead) || 5;
    const inventory = await loadInventory();
    const journal = (await pool.query('SELECT * FROM journal ORDER BY date DESC LIMIT 500')).rows;
    const result = cellarProjection(inventory, convertKeysToCamelCase(journal), { yearsAhead });
    res.json(result);
  } catch (error) {
    console.error('projection error:', error);
    res.status(500).json({ error: 'Failed to compute projection' });
  }
});

// Phase per-wine peak — compute drinking peak windows in batch
// Body: { onlyMissing: boolean, limit: number, force: boolean }
app.post('/api/wines/refresh-peaks', async (req, res) => {
  try {
    const { onlyMissing = true, limit = 50, force = false } = req.body || {};
    const userId = req.user?.userId;

    const filter = (onlyMissing && !force) ? `WHERE peak_start IS NULL OR peak_end IS NULL` : '';
    const result = await pool.query(`SELECT * FROM wines ${filter} ORDER BY created_at DESC LIMIT $1`, [limit]);
    const wines = convertKeysToCamelCase(result.rows);

    const updated = [];
    const failed = [];

    for (const wine of wines) {
      try {
        const peak = await computePeak(wine);
        if (!peak) continue;
        await pool.query(`
          UPDATE wines SET
            peak_start = $1,
            peak_end = $2,
            peak_source = 'AI',
            peak_confidence = $3,
            peak_reasoning = $4,
            peak_computed_at = now(),
            updated_at = now()
          WHERE id = $5
        `, [peak.peakStart, peak.peakEnd, peak.confidence, peak.reasoning, wine.id]);
        updated.push({
          id: wine.id,
          name: wine.name,
          vintage: wine.vintage,
          peak_start: peak.peakStart,
          peak_end: peak.peakEnd,
          confidence: peak.confidence,
        });
      } catch (err) {
        console.error(`Peak failed for ${wine.id}:`, err.message);
        failed.push({ id: wine.id, name: wine.name, error: err.message });
      }
    }

    res.json({
      processed: wines.length,
      updated: updated.length,
      failed: failed.length,
      results: updated,
      errors: failed,
    });
  } catch (error) {
    console.error('Refresh peaks error:', error);
    res.status(500).json({ error: 'Failed to refresh peaks', details: error.message });
  }
});

// Bulk peak update — accepts an array of {wineId, peakStart, peakEnd, reasoning}.
// Designed for Claude (in the chat) to set all wines' peaks at once based on
// its own knowledge, instead of having the backend call an LLM.
// source defaults to 'AI' but caller can pass 'USER' for manual reviews.
app.post('/api/wines/bulk-set-peaks', async (req, res) => {
  try {
    const { updates, source = 'AI', confidence = 'HIGH' } = req.body || {};
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates must be an array' });
    }
    const userId = req.user?.userId;
    let success = 0;
    const errors = [];
    for (const u of updates) {
      if (!u.wineId || !Number.isInteger(u.peakStart) || !Number.isInteger(u.peakEnd) || u.peakEnd < u.peakStart) {
        errors.push({ wineId: u.wineId, error: 'Invalid payload' });
        continue;
      }
      try {
        const result = await pool.query(`
          UPDATE wines SET
            peak_start = $1, peak_end = $2,
            peak_source = $3, peak_confidence = $4,
            peak_reasoning = $5,
            peak_verified_by = $6,
            peak_computed_at = now(),
            updated_at = now()
          WHERE id = $7
          RETURNING id
        `, [u.peakStart, u.peakEnd, source, u.confidence || confidence, u.reasoning || null, userId || null, u.wineId]);
        if (result.rowCount > 0) success++;
        else errors.push({ wineId: u.wineId, error: 'Wine not found' });
      } catch (err) {
        errors.push({ wineId: u.wineId, error: err.message });
      }
    }
    res.json({ processed: updates.length, success, failed: errors.length, errors });
  } catch (error) {
    console.error('Bulk peaks error:', error);
    res.status(500).json({ error: 'Bulk update failed', details: error.message });
  }
});

// Manual peak override (USER source)
app.put('/api/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/peak', async (req, res) => {
  try {
    const { id } = req.params;
    const { peakStart, peakEnd, reasoning } = req.body || {};
    if (!Number.isInteger(peakStart) || !Number.isInteger(peakEnd) || peakEnd < peakStart) {
      return res.status(400).json({ error: 'peakStart and peakEnd must be integers with end >= start' });
    }
    const result = await pool.query(`
      UPDATE wines SET
        peak_start = $1,
        peak_end = $2,
        peak_source = 'USER',
        peak_confidence = 'HIGH',
        peak_reasoning = $3,
        peak_computed_at = now(),
        updated_at = now()
      WHERE id = $4
      RETURNING *
    `, [peakStart, peakEnd, reasoning || null, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Update peak error:', error);
    res.status(500).json({ error: 'Failed to update peak' });
  }
});

// Phase 13.3 — Budget tracking
app.get('/api/cellar/budget', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const inventory = await loadInventory();
    // Inventory needs bottles attached for budget; fetch them
    const bottlesRes = await pool.query('SELECT * FROM bottles');
    const bottles = convertKeysToCamelCase(bottlesRes.rows);
    const enriched = inventory.map(w => ({ ...w, bottles: bottles.filter(b => b.wineId === w.id) }));
    const journal = (await pool.query('SELECT * FROM journal ORDER BY date DESC LIMIT 500')).rows;
    const result = computeBudget(enriched, convertKeysToCamelCase(journal), { monthsBack: months });
    res.json(result);
  } catch (error) {
    console.error('budget error:', error);
    res.status(500).json({ error: 'Failed to compute budget' });
  }
});

// Phase 9 — External data (stubs that use AI estimates today, replace with real APIs)
app.get('/api/wines/:id/external/community', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM wines WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(r.rows[0]);
    const data = await fetchCommunityData(wine);
    res.json(data || { source: 'NONE', error: 'No data available' });
  } catch (error) {
    console.error('community error:', error);
    res.status(500).json({ error: 'Failed to fetch community data' });
  }
});

app.get('/api/wines/:id/external/market-value', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM wines WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(r.rows[0]);
    const data = await fetchMarketValue(wine);
    res.json(data || { source: 'NONE' });
  } catch (error) {
    console.error('market-value error:', error);
    res.status(500).json({ error: 'Failed to fetch market value' });
  }
});

app.get('/api/wines/:id/external/press', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM wines WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(r.rows[0]);
    const data = await fetchPressScores(wine);
    res.json(data || { source: 'NONE' });
  } catch (error) {
    console.error('press error:', error);
    res.status(500).json({ error: 'Failed to fetch press scores' });
  }
});

// Phase 5 — pgvector embeddings management
app.post('/api/wines/refresh-embeddings', async (req, res) => {
  try {
    const limit = parseInt(req.body?.limit) || 100;
    const result = await updateMissingEmbeddings(pool, { limit });
    res.json(result);
  } catch (error) {
    console.error('refresh-embeddings error:', error);
    res.status(500).json({ error: 'Failed to refresh embeddings', details: error.message });
  }
});

// Phase 4.3 — Streaming sommelier (Server-Sent Events)
// Sends partial events: criteria → candidates → picks
app.get('/api/sommelier/pair-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const dish = req.query.dish;
    if (!dish) {
      send('error', { message: 'dish required' });
      return res.end();
    }
    send('status', { phase: 'extract-criteria' });

    const criteria = await extractCriteria(dish, {});
    send('criteria', criteria);

    send('status', { phase: 'matching' });
    const inventory = await loadInventory();
    const userId = req.user?.userId;
    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;

    const result = await runPairing({
      pool, inventory, dish, context: {}, userId, userFeedback: [], tasteProfile, skipCache: false,
    });

    send('candidates', result.candidates);
    send('picks', result.picks);
    send('done', { fromCache: result.fromCache, cave_size: result.cave_size });
  } catch (error) {
    send('error', { message: error.message });
  } finally {
    res.end();
  }
});

// Phase 6.1 — OCR: extract wine info from a label image
// Body: { image: "base64...", mimeType: "image/jpeg" }
app.post('/api/wines/extract-from-image', async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) required' });
    const extracted = await extractFromLabel(image, mimeType || 'image/jpeg');
    res.json(extracted);
  } catch (error) {
    console.error('OCR error:', error);
    res.status(500).json({ error: 'Failed to extract from image', details: error.message });
  }
});

// Get current user's taste profile
app.get('/api/sommelier/taste-profile', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const profile = await getTasteProfile(pool, userId);
    res.json(profile || null);
  } catch (error) {
    console.error('Get taste-profile error:', error);
    res.status(500).json({ error: 'Failed to fetch taste profile' });
  }
});

// Discover which AI providers are configured (used by frontend Settings)
app.get('/api/ai/providers', async (req, res) => {
  res.json({
    providers: {
      gemini: isProviderConfigured('gemini'),
      claude: isProviderConfigured('claude'),
    },
    defaults: getTaskDefaults(),
  });
});

// Phase 3.1 - Enrich aromas in batch (vins sans profil)
// Body: { onlyMissing: boolean, useConsensus: boolean, limit: number }
app.post('/api/wines/enrich-aromas', async (req, res) => {
  try {
    const { onlyMissing = true, useConsensus = false, limit = 50 } = req.body || {};
    const userId = req.user?.userId;

    const filter = onlyMissing
      ? `WHERE aroma_profile IS NULL OR array_length(aroma_profile, 1) IS NULL OR array_length(aroma_profile, 1) < 3 OR aroma_source IS NULL`
      : '';
    const result = await pool.query(`SELECT * FROM wines ${filter} ORDER BY created_at DESC LIMIT $1`, [limit]);
    const wines = convertKeysToCamelCase(result.rows);

    const enriched = [];
    const failed = [];

    for (const wine of wines) {
      try {
        const profile = await enrichWine(wine, { useConsensus });
        await pool.query(`
          UPDATE wines SET
            aroma_profile = $1,
            aroma_source = $2,
            aroma_confidence = $3,
            aroma_provider = $4,
            aroma_verified_at = CASE WHEN $2 = 'CONSENSUS' THEN now() ELSE aroma_verified_at END,
            updated_at = now()
          WHERE id = $5
        `, [
          profile.aromas,
          profile.source,
          profile.confidence,
          (profile.providers || []).join(',') || 'gemini',
          wine.id,
        ]);
        enriched.push({ id: wine.id, name: wine.name, aromas: profile.aromas, confidence: profile.confidence });
      } catch (err) {
        console.error(`Enrich failed for ${wine.id}:`, err.message);
        failed.push({ id: wine.id, name: wine.name, error: err.message });
      }
    }

    res.json({
      processed: wines.length,
      enriched: enriched.length,
      failed: failed.length,
      results: enriched,
      errors: failed,
    });
  } catch (error) {
    console.error('Batch enrich error:', error);
    res.status(500).json({ error: 'Failed to enrich aromas', details: error.message });
  }
});

// Phase 3.4 - Audit dashboard: vins suspects (profils faibles ou vides)
app.get('/api/wines/audit', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, name, producer, vintage, region, type,
        aroma_profile, aroma_source, aroma_confidence, aroma_verified_at, updated_at
      FROM wines
      WHERE
        aroma_profile IS NULL
        OR array_length(aroma_profile, 1) IS NULL
        OR array_length(aroma_profile, 1) < 3
        OR aroma_source IS NULL
        OR (aroma_source = 'AI' AND aroma_confidence = 'LOW')
        OR (aroma_source = 'AI' AND updated_at < now() - interval '12 months')
      ORDER BY
        CASE WHEN aroma_profile IS NULL THEN 0 ELSE 1 END,
        CASE WHEN aroma_confidence = 'LOW' THEN 0 WHEN aroma_confidence = 'MEDIUM' THEN 1 ELSE 2 END,
        updated_at ASC
      LIMIT 100
    `);
    res.json({
      count: result.rowCount,
      wines: convertKeysToCamelCase(result.rows),
    });
  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ error: 'Failed to run audit' });
  }
});

// Phase 3.3 - Re-derive aroma profile from tasting notes (closes the loop)
app.post('/api/wines/:id/refresh-from-tastings', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const notesRes = await pool.query('SELECT * FROM tasting_notes WHERE wine_id = $1 ORDER BY date DESC', [id]);
    const aromas = aromasFromTastingNotes(convertKeysToCamelCase(notesRes.rows));
    if (aromas.length < 3) {
      return res.status(400).json({ error: 'Not enough aromas in tasting notes (need ≥3)', found: aromas.length });
    }
    const result = await pool.query(`
      UPDATE wines SET
        aroma_profile = $1,
        aroma_source = 'TASTING',
        aroma_confidence = 'HIGH',
        aroma_verified_at = now(),
        aroma_verified_by = $2,
        updated_at = now()
      WHERE id = $3
      RETURNING *
    `, [aromas, userId || null, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    res.json({ wine: convertKeysToCamelCase(result.rows[0]), aromas });
  } catch (error) {
    console.error('Refresh-from-tastings error:', error);
    res.status(500).json({ error: 'Failed to refresh from tastings' });
  }
});

// Update aroma profile manually (Phase 1.4 - validation UI)
app.put('/api/wines/:id/aroma-profile', async (req, res) => {
  try {
    const { id } = req.params;
    const { aromaProfile, source, confidence } = req.body;
    if (!Array.isArray(aromaProfile)) {
      return res.status(400).json({ error: 'aromaProfile must be an array' });
    }
    const userId = req.user?.userId;
    const result = await pool.query(`
      UPDATE wines SET
        aroma_profile = $1,
        aroma_source = $2,
        aroma_confidence = $3,
        aroma_verified_at = now(),
        aroma_verified_by = $4,
        updated_at = now()
      WHERE id = $5
      RETURNING *
    `, [
      aromaProfile,
      source || 'USER',
      confidence || 'HIGH',
      userId || null,
      id,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Update aroma-profile error:', error);
    res.status(500).json({ error: 'Failed to update aroma profile' });
  }
});

// Phase 4.4 — Pre-warming common dishes at startup.
// Pre-computes LLM1 criteria for the 50 most common dishes so the very first
// pairing request is fast.
const COMMON_DISHES = [
  'poulet rôti', 'saumon grillé', 'sushis', 'fromage de chèvre', 'fromage à pâte dure',
  'magret de canard', 'côte de bœuf', 'agneau de pré-salé', 'cassoulet', 'choucroute',
  'bouillabaisse', 'risotto aux champignons', 'pâtes carbonara', 'pizza margherita', 'fondue savoyarde',
  'raclette', 'plateau de charcuterie', 'huîtres', 'tartare de bœuf', 'curry de poulet',
  'bo bun', 'pad thaï', 'paella', 'tagine d\'agneau', 'couscous',
  'tajine de poisson', 'apéritif léger', 'apéritif charcuterie', 'foie gras', 'comté',
  'roquefort', 'tarte au citron', 'tarte tatin', 'fondant chocolat', 'crème brûlée',
  'salade de chèvre chaud', 'pissaladière', 'quiche lorraine', 'blanquette de veau', 'navarin d\'agneau',
  'pintade rôtie', 'lapin moutarde', 'gigot d\'agneau', 'magret au miel', 'truite aux amandes',
  'lotte au safran', 'cabillaud beurre blanc', 'sole meunière', 'noix de saint-jacques', 'risotto truffe',
];

const prewarmCommonDishes = async () => {
  if (process.env.VINOFLOW_PREWARM !== 'true') return;
  console.log('🔥 Pre-warming pairing cache for common dishes...');
  let warmed = 0;
  for (const dish of COMMON_DISHES) {
    try {
      const criteria = await extractCriteria(dish, {});
      await setCriteriaCache(pool, dish, criteria);
      warmed++;
    } catch (e) {
      // Skip silently — likely no API key
    }
    // Avoid hammering the API
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`🔥 Pre-warmed ${warmed}/${COMMON_DISHES.length} dishes`);
};

// Start server
app.listen(port, () => {
  console.log(`🍷 VinoFlow Backend running on port ${port}`);
  // Run pre-warming in background after server is up
  setTimeout(() => { prewarmCommonDishes().catch(() => {}); }, 5000);
});
