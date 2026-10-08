// Vérification des sources citées par la cascade : le serveur télécharge
// chaque page et cherche l'extrait annoncé. Un modèle peut se tromper de
// millésime ou résumer au lieu de citer ; seule une citation retrouvée compte.
//
// Statuts : verified (extrait retrouvé), not_found (page lue, extrait absent),
// unreachable (page inaccessible : réseau, 403, page générée en JavaScript…).

const FETCH_TIMEOUT_MS = 12000;
const MAX_BYTES = 1_500_000;

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const decodeEntities = (s) => s
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'")
  .replace(/&laquo;|&raquo;/gi, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&[a-z]+;/gi, ' ');

/** Texte comparable : minuscules, sans accents ; toute ponctuation (guillemets,
 * apostrophes typographiques…) devient une espace. */
export const normalizeText = (s) => stripAccents(decodeEntities(String(s || '')).toLowerCase())
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .replace(/[^a-z0-9%]+/g, ' ')
  .trim();

export const htmlToText = (html) => String(html)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ');

/**
 * L'extrait figure-t-il dans le texte ? Exact après normalisation, ou au moins
 * 85 % de ses fenêtres de 6 mots (tolère coupures, puces, mise en forme).
 */
export const excerptMatches = (excerpt, pageText) => {
  const ex = normalizeText(excerpt);
  const page = normalizeText(pageText);
  if (!ex || ex.split(' ').length < 4) return false;
  if (page.includes(ex)) return true;
  const words = ex.split(' ');
  const size = 6;
  if (words.length < size) return false;
  let hits = 0;
  let total = 0;
  for (let i = 0; i + size <= words.length; i += 2) {
    total++;
    if (page.includes(words.slice(i, i + size).join(' '))) hits++;
  }
  return total > 0 && hits / total >= 0.85;
};

/**
 * Variante stricte (passe « cote ») : l'extrait doit figurer tel quel après
 * normalisation, borné aux mots — « 45 00 » ne correspond pas à « 145 00 », et
 * une longue citation au montant modifié n'est pas acceptée.
 */
export const strictExcerptMatches = (excerpt, pageText) => {
  const ex = normalizeText(excerpt);
  if (!ex || ex.split(' ').length < 4) return false;
  return ` ${normalizeText(pageText)} `.includes(` ${ex} `);
};

const defaultFetch = async (url) => {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': 'Mozilla/5.0 (VinoFlow source check)',
      'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      'Accept-Language': 'fr,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.subarray(0, MAX_BYTES).toString('utf8');
};

/**
 * @param {Array<{url, excerpt}>} sources
 * @returns {Promise<Array<source & {check: 'verified'|'not_found'|'unreachable', domain}>>}
 */
export const verifySources = async (sources, { fetchPage = defaultFetch, strict = false } = {}) => {
  const matches = strict ? strictExcerptMatches : excerptMatches;
  const cache = new Map();
  return Promise.all(sources.map(async (source) => {
    let domain = null;
    try {
      domain = new URL(source.url).hostname.replace(/^www\./, '');
    } catch {
      return { ...source, domain, check: 'not_found' };
    }
    try {
      if (!cache.has(source.url)) cache.set(source.url, fetchPage(source.url).then(htmlToText));
      const text = await cache.get(source.url);
      return { ...source, domain, check: matches(source.excerpt, text) ? 'verified' : 'not_found' };
    } catch {
      return { ...source, domain, check: 'unreachable' };
    }
  }));
};

/**
 * Un niveau sourcé est acquis avec une source vérifiée, ou à défaut deux
 * sources inaccessibles de domaines différents (sites en JavaScript).
 * Une source dont l'extrait est introuvable n'appuie rien.
 */
export const levelSupported = (sources, level) => {
  const atLevel = sources.filter((s) => s.level === level);
  if (atLevel.some((s) => s.check === 'verified')) return true;
  const unreachableDomains = new Set(atLevel.filter((s) => s.check === 'unreachable').map((s) => s.domain));
  return unreachableDomains.size >= 2;
};
