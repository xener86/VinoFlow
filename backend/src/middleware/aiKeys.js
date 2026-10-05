import { ALLOW_CLIENT_AI_KEYS } from '../config.js';
import { runWithRequestKeys } from '../services/aiService.js';

// ========== AI keys per-request middleware ==========
// Frontend can send the user's Settings keys via headers, so the backend can
// use them when env vars are not set (env vars always win). AsyncLocalStorage
// propagates them through the entire request chain without changing function
// signatures. Risque : ces clés vivent dans le localStorage du navigateur
// (exposées à toute XSS) et transitent à chaque requête — préférer les
// variables d'environnement, et ALLOW_CLIENT_AI_KEYS=false pour les refuser.
export const aiKeysFromHeaders = (req, res, next) => {
  const keys = ALLOW_CLIENT_AI_KEYS
    ? {
        gemini: req.headers['x-vinoflow-gemini-key'] || null,
        claude: req.headers['x-vinoflow-claude-key'] || null,
      }
    : {};
  runWithRequestKeys(keys, () => next());
};
