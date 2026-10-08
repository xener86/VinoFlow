// Classification des vins par état de garde et détection des transitions à
// signaler (fonctions pures). Les apogées sont des années : la fenêtre se
// termine le 31/12 de peakEnd, en heure locale.
import { getPeakWindow } from '../sommelier/peakWindow.js';
import { zonedParts } from './schedule.js';

export const STATES = ['GARDE', 'PRET', 'SE_REFERME', 'DEPASSEE'];
export const rank = (state) => STATES.indexOf(state);

const TRIGGERS = { PRET: 'alertReady', SE_REFERME: 'alertClosing', DEPASSEE: 'alertPast' };

export const classifyWine = (wine, { horizonMonths = 12, now = new Date(), tz } = {}) => {
  if ((wine.inventoryCount ?? 0) <= 0) return null;
  const peak = getPeakWindow(wine);
  if (!peak) return null;
  const estimated = !((wine.peakStart ?? wine.peak_start) && (wine.peakEnd ?? wine.peak_end));
  const { year, month } = zonedParts(now, tz);
  // Mois restants, mois courant inclus, jusqu'au 31/12 de peakEnd.
  const monthsLeft = (peak.peakEnd - year) * 12 + (12 - month) + 1;
  let state = 'GARDE';
  if (year > peak.peakEnd) state = 'DEPASSEE';
  else if (monthsLeft <= horizonMonths) state = 'SE_REFERME';
  else if (year >= peak.peakStart) state = 'PRET';
  return { state, peakStart: peak.peakStart, peakEnd: peak.peakEnd, monthsLeft, estimated };
};

/**
 * Compare l'état courant de chaque vin à l'état déjà connu de l'utilisateur.
 * Premier passage (alertsSeededAt nul) : on enregistre sans notifier.
 */
export const detectTransitions = ({ stored, wines, settings, now, tz }) => {
  const notify = [];
  const upserts = [];
  const deletes = [];
  const seen = new Set();
  const seeding = !settings.alertsSeededAt;
  for (const wine of wines) {
    const c = classifyWine(wine, { horizonMonths: settings.horizonMonths, now, tz });
    if (!c) continue;
    seen.add(wine.id);
    const previous = stored.get(wine.id);
    if (previous === c.state) continue;
    upserts.push({ wineId: wine.id, state: c.state });
    if (seeding || !settings.alertsEnabled) continue;
    const from = previous ?? 'GARDE';
    if (rank(c.state) > rank(from) && settings[TRIGGERS[c.state]]) {
      notify.push({ wine, from, to: c.state, ...c });
    }
  }
  for (const wineId of stored.keys()) if (!seen.has(wineId)) deletes.push(wineId);
  return { notify, upserts, deletes };
};
