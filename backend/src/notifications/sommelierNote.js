// « Le mot du sommelier » de la newsletter : court éditorial rédigé par l'IA à
// partir des seuls vins de la cave. Facultatif : sans clé, en erreur ou trop
// lent, la newsletter part sans.
import { generateJson, isProviderConfigured } from '../services/aiService.js';
import { NEWSLETTER_NOTE_SCHEMA } from '../sommelier/schemas.js';
import { classifyWine, rank } from './classify.js';
import { wineLabel, periodTitle } from './format.js';

const SYSTEM = `Tu es le sommelier d'une cave particulière. Tu rédiges en français un court
éditorial pour la newsletter de la cave : quoi ouvrir ce mois-ci et pourquoi, un accord de saison
avec ce qui est en cave. Ton chaleureux et précis, 80 mots au plus pour l'intro, sans guillemets.
Règles : ne cite QUE des vins de la liste fournie, par leur id dans "picks" (3 au plus) ;
privilégie les vins dont l'état est DEPASSEE ou SE_REFERME ; si "accordsDuMois" n'est pas vide,
tu peux y faire une brève allusion ; n'invente ni vin, ni note, ni prix.`;

export const isNoteAvailable = () => isProviderConfigured('claude') || isProviderConfigured('gemini');

export const buildNoteInput = (inventory, { settings, now, tz, accords = [] }) => {
  const rows = inventory
    .map((wine) => ({ wine, c: classifyWine(wine, { horizonMonths: settings.horizonMonths, now, tz }) }))
    .filter(({ c }) => c)
    .sort((a, b) => rank(b.c.state) - rank(a.c.state) || a.c.monthsLeft - b.c.monthsLeft)
    .slice(0, 80);
  return {
    mois: periodTitle({ newsletterFrequency: 'monthly' }, now, tz),
    vins: rows.map(({ wine, c }) => ({
      id: wine.id,
      nom: wineLabel(wine),
      type: wine.type || null,
      region: wine.region || null,
      etat: c.state,
      apogee: `${c.peakStart}-${c.peakEnd}`,
      stock: wine.inventoryCount,
    })),
    accordsDuMois: accords.map((a) => `${a.dish} × ${a.wine}`),
  };
};

export const sanitizeNote = (raw, winesById) => {
  if (!raw || typeof raw.intro !== 'string' || !raw.intro.trim()) return null;
  const picks = (Array.isArray(raw.picks) ? raw.picks : [])
    .filter((p) => p && winesById.has(p.wineId))
    .slice(0, 3)
    .map((p) => ({ wine: winesById.get(p.wineId), reason: String(p.reason || '').trim() }));
  return {
    intro: raw.intro.trim(),
    picks,
    seasonalPairing: raw.seasonalPairing ? String(raw.seasonalPairing).trim() : null,
    closing: raw.closing ? String(raw.closing).trim() : null,
  };
};

export const generateSommelierNote = async ({ inventory, settings, now, tz, accords = [], timeoutMs = 30_000 }) => {
  if (!isNoteAvailable()) return null;
  const input = buildNoteInput(inventory, { settings, now, tz, accords });
  if (input.vins.length === 0) return null;
  let timer;
  try {
    const raw = await Promise.race([
      generateJson('newsletter', { system: SYSTEM, user: JSON.stringify(input), schema: NEWSLETTER_NOTE_SCHEMA }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('délai dépassé')), timeoutMs); }),
    ]);
    return sanitizeNote(raw, new Map(inventory.map((w) => [w.id, w])));
  } catch (error) {
    console.warn('[notifications] mot du sommelier indisponible :', error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
};
