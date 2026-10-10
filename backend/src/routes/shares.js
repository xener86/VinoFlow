import { Router } from 'express';
import { convertKeysToCamelCase } from '../utils/case.js';
import { ShareError, isUuid, validateDinner } from '../shares/validate.js';
import * as store from '../shares/store.js';

const router = Router();

// ========== PARTAGE PUBLIC — gestion (comptes du foyer) ==========
// La lecture publique est dans routes/publicShares.js, montée avant authenticate.

const created = (share) => ({ id: share.id, token: share.token, kind: share.kind, url: `/p/${share.token}` });

// Identifiant mal formé : même 404 JSON qu'un lien inconnu (pas de 404 HTML d'Express).
const NOT_FOUND = { error: 'Lien introuvable.' };
router.param('id', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json(NOT_FOUND)));

const fail = (res, error, fallback) => {
  if (error instanceof ShareError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

router.get('/shares', async (req, res) => {
  try {
    res.json(convertKeysToCamelCase(await store.listShares()));
  } catch (error) {
    fail(res, error, 'Impossible de lister les liens partagés.');
  }
});

router.get('/shares/:id', async (req, res) => {
  try {
    const share = await store.getShareForEditor(req.params.id);
    if (!share) return res.status(404).json({ error: 'Carte introuvable.' });
    res.json(convertKeysToCamelCase(share));
  } catch (error) {
    fail(res, error, 'Impossible de charger la carte.');
  }
});

router.post('/shares', async (req, res) => {
  try {
    const userId = req.user?.userId ?? null;
    const kind = req.body?.kind;
    if (kind === 'WINE') {
      if (!isUuid(req.body.wineId)) throw new ShareError(400, 'Vin invalide.');
      if (!(await store.wineExists(req.body.wineId))) return res.status(404).json({ error: 'Ce vin n’existe plus dans la cave.' });
      // Un seul lien actif par fiche : on le reprend plutôt que d'en créer un second.
      const result = await store.createOrReuseWineShare(req.body.wineId, userId);
      return res.status(result.created ? 201 : 200).json(created(result.share));
    }
    if (kind === 'DINNER') {
      return res.status(201).json(created(await store.createDinnerShare(validateDinner(req.body), userId)));
    }
    throw new ShareError(400, 'Type de partage inconnu (WINE ou DINNER).');
  } catch (error) {
    fail(res, error, 'La création du lien a échoué.');
  }
});

router.put('/shares/:id', async (req, res) => {
  try {
    res.json(created(await store.updateDinnerShare(req.params.id, validateDinner(req.body))));
  } catch (error) {
    fail(res, error, 'La modification de la carte a échoué.');
  }
});

router.post('/shares/:id/revoke', async (req, res) => {
  try {
    const revoked = await store.revokeShare(req.params.id);
    if (!revoked) return res.status(404).json(NOT_FOUND);
    res.json({ id: revoked.id, revokedAt: revoked.revoked_at });
  } catch (error) {
    fail(res, error, 'La révocation a échoué.');
  }
});

export default router;
