import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import { ALLOW_CLIENT_AI_KEYS, FRONTEND_URL } from './config.js';
import { pool } from './db.js';
import { authenticate } from './middleware/auth.js';
import { aiLimiter } from './middleware/rateLimits.js';
import { runWithRequestKeys } from './services/aiService.js';
import { extractCriteria } from './sommelier/llm1.js';
import { setCriteriaCache } from './sommelier/cache.js';
import authRouter from './routes/auth.js';
import winesRouter from './routes/wines.js';
import bottlesRouter from './routes/bottles.js';
import racksRouter from './routes/racks.js';
import spiritsRouter from './routes/spirits.js';
import tastingsRouter from './routes/tastings.js';
import historyRouter from './routes/history.js';
import wishlistRouter from './routes/wishlist.js';
import sommelierRouter from './routes/sommelier.js';
import cellarRouter from './routes/cellar.js';
import aiRouter from './routes/ai.js';

const app = express();
const port = process.env.PORT || 3100;

// nginx (frontend container) sits in front of the backend: trust exactly one
// hop so req.ip is the real client IP (rate limiting). Set TRUST_PROXY=2 if
// another reverse proxy (Traefik, Caddy…) sits in front of nginx.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
// HSTS : à poser sur le reverse proxy TLS (le backend ne voit que du HTTP).
app.use(helmet({ strictTransportSecurity: false }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', authRouter);

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

app.use('/api', winesRouter);

app.use('/api', bottlesRouter);

app.use('/api', racksRouter);

app.use('/api', spiritsRouter);

app.use('/api', tastingsRouter);

app.use('/api', historyRouter);

app.use('/api', wishlistRouter);

app.use('/api', sommelierRouter);

app.use('/api', cellarRouter);

app.use('/api', aiRouter);

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
