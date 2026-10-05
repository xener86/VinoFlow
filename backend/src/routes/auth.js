import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { JWT_SECRET, ACCESS_TOKEN_TTL, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS, REFRESH_REUSE_GRACE_MS, RESET_TOKEN_TTL_MINUTES, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, BCRYPT_COST, ALLOW_SIGNUP, APP_URL } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter, refreshLimiter } from '../middleware/rateLimits.js';
import { sendMail, renderMailHtml } from '../services/mailService.js';

const router = Router();

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


// Public: lets the login page know whether to show the signup form.
router.get('/auth/config', refreshLimiter, async (req, res) => {
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
router.post('/auth/signup', authLimiter, async (req, res) => {
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
router.post('/auth/login', authLimiter, async (req, res) => {
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
router.post('/auth/refresh', refreshLimiter, async (req, res) => {
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
router.post('/auth/logout', refreshLimiter, async (req, res) => {
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
router.post('/auth/password', authLimiter, authenticate, async (req, res) => {
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
router.post('/auth/forgot', authLimiter, (req, res) => {
  const { email } = req.body || {};
  res.json({ msg: 'Si un compte existe pour cet email, un lien de réinitialisation vient d’être envoyé.' });
  if (typeof email === 'string' && EMAIL_RE.test(email.trim())) {
    sendPasswordResetEmail(email.trim().toLowerCase()).catch((error) => {
      console.error('Forgot password error:', error);
    });
  }
});

// Reset password: jeton à usage unique, valable 1 h.
router.post('/auth/reset', authLimiter, async (req, res) => {
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

export default router;
