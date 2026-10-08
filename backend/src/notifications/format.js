// Libellés partagés par les alertes, la newsletter, le mot du sommelier et la passerelle MenuFlow.
import { notifyTz } from './schedule.js';

const present = (v) => v !== null && v !== undefined && v !== '';

export const wineName = (wine) => [wine.name, wine.cuvee].filter(present).join(' ');
export const wineLabel = (wine) => [wine.name, wine.cuvee, wine.vintage].filter(present).join(' ');

export const stateLabel = ({ state, peakStart, peakEnd, estimated }) => {
  const base = {
    GARDE: `en garde jusqu’en ${peakStart}`,
    PRET: `en apogée ${peakStart}–${peakEnd}`,
    SE_REFERME: `à boire avant fin ${peakEnd}`,
    DEPASSEE: `apogée dépassée (fin ${peakEnd})`,
  }[state];
  return estimated ? `${base} (estimée)` : base;
};

export const windowBadge = ({ state, monthsLeft, peakEnd }) => {
  if (state === 'DEPASSEE') return { text: 'PASSÉ', tone: 'passe' };
  if (monthsLeft <= 6) return { text: `${monthsLeft} MOIS`, tone: 'bientot' };
  return { text: `FIN ${peakEnd}`, tone: 'neutre' };
};

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const euros = (n) => EUR.format(Number(n) || 0);

export const periodTitle = (settings, now, tz = notifyTz()) => {
  if (settings.newsletterFrequency === 'weekly') {
    return `semaine du ${new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(now)}`;
  }
  return new Intl.DateTimeFormat('fr-FR', { timeZone: tz, month: 'long', year: 'numeric' }).format(now);
};

export const dayMonth = (date, tz = notifyTz()) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(new Date(date));
