import { Router } from 'express';
import { isShareToken } from '../shares/token.js';
import { loadPublicShare } from '../shares/store.js';
import { toPublicShare } from '../shares/publicView.js';

const router = Router();

// ========== PARTAGE PUBLIC — lecture sans compte ==========
// Seule route de l'API ouverte sans JWT (montée avant authenticate, derrière
// publicLimiter). Lecture seule ; la réponse passe par la liste blanche de
// toPublicShare. Inconnu, mal formé ou révoqué : même 404.
const GONE = { error: 'Ce lien n’est plus actif.' };

router.get('/public/shares/:token', async (req, res) => {
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  try {
    if (!isShareToken(req.params.token)) return res.status(404).json(GONE);
    const loaded = await loadPublicShare(req.params.token);
    if (!loaded) return res.status(404).json(GONE);
    return res.json(toPublicShare(loaded.share, loaded.items, loaded.wines, loaded.tastings));
  } catch (error) {
    console.error('Public share error:', error);
    return res.status(500).json({ error: 'Impossible de charger ce partage.' });
  }
});

export default router;
