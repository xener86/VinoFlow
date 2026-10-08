// Planning des newsletters, en heure locale (NOTIFY_TZ, Europe/Paris par défaut).
// Les comparaisons se font sur des clés « YYYY-MM-DDTHH » en heure locale : pas
// de conversion vers UTC, donc pas de piège au changement d'heure.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d, h) => `${y}-${pad(m)}-${pad(d)}T${pad(h)}`;

export const notifyTz = () => process.env.NOTIFY_TZ || 'Europe/Paris';

/** Date → composantes en heure locale du fuseau (weekday ISO : 1 = lundi). */
export const zonedParts = (date, tz = notifyTz()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, weekday: WEEKDAYS[parts.weekday] };
};

const partsKey = (p) => key(p.year, p.month, p.day, p.hour);

/** Dernière échéance passée (clé locale) : le 1er du mois ou le jour choisi, à l'heure choisie. */
export const currentOccurrence = (settings, now, tz = notifyTz()) => {
  const p = zonedParts(now, tz);
  const hour = settings.newsletterHour;
  if (settings.newsletterFrequency === 'monthly') {
    let { year, month } = p;
    if (partsKey(p) < key(year, month, 1, hour)) {
      month -= 1;
      if (month === 0) { month = 12; year -= 1; }
    }
    return key(year, month, 1, hour);
  }
  let back = (p.weekday - settings.newsletterWeekday + 7) % 7;
  if (back === 0 && p.hour < hour) back = 7;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day) - back * DAY_MS);
  return key(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour);
};

export const isNewsletterDue = (settings, now, tz = notifyTz()) => {
  if (settings.newsletterFrequency === 'off') return false;
  if (!settings.lastNewsletterAt) return true;
  return partsKey(zonedParts(new Date(settings.lastNewsletterAt), tz)) < currentOccurrence(settings, now, tz);
};

/** Début de la période couverte : la dernière newsletter, au plus 31 jours (7 en hebdo) en arrière. */
export const periodStart = (settings, now) => {
  const floor = new Date(now.getTime() - (settings.newsletterFrequency === 'weekly' ? 7 : 31) * DAY_MS);
  const last = settings.lastNewsletterAt ? new Date(settings.lastNewsletterAt) : null;
  return last && last > floor ? last : floor;
};
