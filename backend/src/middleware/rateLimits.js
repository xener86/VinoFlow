import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

// ========== Rate limiting ==========
const rateLimitHandler = (req, res, next, options) =>
  res.status(options.statusCode).json({ msg: 'Trop de tentatives, réessayez dans quelques minutes.' });

// Strict: login, signup, forgot/reset, change password (par IP).
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Refresh / logout: appelés automatiquement par chaque onglet ouvert.
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Routes IA coûteuses : par utilisateur (monté après authenticate).
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req.ip),
  // Les lectures GET /api/sommelier/* n'appellent pas de LLM (alertes, profil
  // de goût…) : elles ne sont pas comptées.
  skip: (req) => req.method === 'GET' && req.baseUrl === '/api/sommelier',
  handler: (req, res, next, options) =>
    res.status(options.statusCode).json({ msg: 'Limite de requêtes IA atteinte, réessayez dans quelques minutes.' }),
});
