// Passerelle MenuFlow à la demande : état de la liaison, accord du soir, autre idée.
import { Router } from 'express';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { isNoteAvailable } from '../notifications/sommelierNote.js';
import { loadLocations } from '../notifications/newsletter.js';
import { notifyTz } from '../notifications/schedule.js';
import { isMenuflowConfigured } from '../menuflow/client.js';
import { menuflowStatus, loadTonight, suggestFor, pushDay, openedByDay } from '../menuflow/sync.js';

const router = Router();

const tonightResponse = async (row, { inventory, tz }) => {
  if (!row) return { configured: true, dinner: null, suggested: null, opened: [] };
  const byId = new Map(inventory.map((w) => [w.id, w]));
  const locations = await loadLocations();
  const w = row.suggestedWineId && row.suggestedForTitle === row.dishTitle ? byId.get(row.suggestedWineId) : null;
  const opened = (await openedByDay(row.dinnerDate, tz)).get(row.dinnerDate) || [];
  return {
    configured: true,
    dinner: { date: row.dinnerDate, title: row.dishTitle, verdicts: row.verdicts || [] },
    suggested: w ? {
      wineId: w.id,
      wine: [w.name, w.cuvee].filter(Boolean).join(' '),
      vintage: w.vintage ?? null,
      reason: row.suggestionReason || null,
      location: locations.get(w.id) || null,
    } : null,
    opened: opened.map((o) => ({ wineId: o.wineId, wine: o.wineName, vintage: o.wineVintage ?? null })),
  };
};

router.get('/menuflow/status', (req, res) => res.json(menuflowStatus()));

router.get('/menuflow/tonight', async (req, res) => {
  if (!isMenuflowConfigured()) return res.json({ configured: false });
  try {
    const tz = notifyTz();
    // ?remote=0 : base seule, pour ne pas faire attendre la confirmation d'ouverture si MenuFlow ne répond pas.
    const remote = req.query.remote !== '0';
    res.json(await tonightResponse(await loadTonight({ tz, remote }), { inventory: await loadInventory(), tz }));
  } catch (error) {
    console.error('menuflow tonight error:', error);
    res.status(502).json({ error: `MenuFlow indisponible : ${error.message}` });
  }
});

router.post('/menuflow/tonight/resuggest', async (req, res) => {
  if (!isMenuflowConfigured()) return res.status(404).json({ error: 'MenuFlow n’est pas relié' });
  if (!isNoteAvailable()) return res.status(409).json({ error: 'IA non configurée sur le serveur' });
  try {
    const tz = notifyTz();
    const row = await loadTonight({ tz });
    if (!row) return res.status(404).json({ error: 'Pas de dîner planifié ce soir' });
    const inventory = await loadInventory();
    const inventoryById = new Map(inventory.map((w) => [w.id, w]));
    const exclude = row.suggestedWineId ? [row.suggestedWineId] : [];
    await suggestFor(row, { inventoryById, exclude });
    await pushDay(row, {
      inventoryById,
      openedByDay: await openedByDay(row.dinnerDate, tz),
      locations: await loadLocations(),
      appUrl: APP_URL,
    }).catch((error) => console.error('[menuflow] envoi après « autre idée » :', error.message));
    res.json(await tonightResponse(row, { inventory, tz }));
  } catch (error) {
    console.error('menuflow resuggest error:', error);
    res.status(500).json({ error: 'Nouvelle suggestion impossible' });
  }
});

export default router;
