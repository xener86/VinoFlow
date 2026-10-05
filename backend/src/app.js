// Application Express : middlewares + routeurs. Importée par server.js
// (bootstrap) et par les tests d'API (supertest), sans ouvrir de port.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { FRONTEND_URL } from './config.js';
import { authenticate } from './middleware/auth.js';
import { aiLimiter } from './middleware/rateLimits.js';
import { aiKeysFromHeaders } from './middleware/aiKeys.js';
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
import enrichmentRouter from './routes/enrichment.js';
import cocktailsRouter from './routes/cocktails.js';
import importRouter from './routes/import.js';

const app = express();

// nginx (frontend container) sits in front of the backend: trust exactly one
// hop so req.ip is the real client IP (rate limiting). Set TRUST_PROXY=2 if
// another reverse proxy (Traefik, Caddy…) sits in front of nginx.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
// HSTS : à poser sur le reverse proxy TLS (le backend ne voit que du HTTP).
app.use(helmet({ strictTransportSecurity: false }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
// POST /api/import (sauvegarde complète) a son propre parseur, plus large, monté
// après l'authentification : un anonyme ne peut pas envoyer 25 Mo.
const jsonParser = express.json({ limit: '1mb' });
app.use((req, res, next) => (req.path === '/api/import' ? next() : jsonParser(req, res, next)));

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
    '/api/enrichment/run',
  ],
  aiLimiter
);

// ========== AI keys per-request middleware ==========
// Clés IA envoyées par le navigateur (voir middleware/aiKeys.js).
app.use('/api', aiKeysFromHeaders);

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
app.use('/api', enrichmentRouter);
app.use('/api', cocktailsRouter);
app.use('/api', importRouter);

export default app;
