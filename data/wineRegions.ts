// ── Department code → Wine Region ────────────────────────────────────
export const DEPT_TO_WINE_REGION: Record<string, string> = {
  // Bordeaux
  '33': 'Bordeaux',
  // Bourgogne
  '21': 'Bourgogne', '71': 'Bourgogne', '89': 'Bourgogne', '58': 'Bourgogne',
  // Beaujolais
  '69': 'Beaujolais',
  // Vallée du Rhône
  '26': 'Vallée du Rhône', '07': 'Vallée du Rhône', '84': 'Vallée du Rhône', '30': 'Vallée du Rhône',
  // Loire
  '44': 'Loire', '49': 'Loire', '37': 'Loire', '41': 'Loire', '18': 'Loire', '45': 'Loire', '72': 'Loire',
  // Alsace
  '67': 'Alsace', '68': 'Alsace',
  // Champagne
  '51': 'Champagne', '10': 'Champagne', '02': 'Champagne',
  // Languedoc
  '34': 'Languedoc', '11': 'Languedoc',
  // Roussillon
  '66': 'Roussillon',
  // Provence
  '83': 'Provence', '13': 'Provence', '06': 'Provence', '04': 'Provence',
  // Sud-Ouest
  '32': 'Sud-Ouest', '24': 'Sud-Ouest', '46': 'Sud-Ouest', '47': 'Sud-Ouest',
  '64': 'Sud-Ouest', '31': 'Sud-Ouest', '81': 'Sud-Ouest', '82': 'Sud-Ouest',
  '12': 'Sud-Ouest', '65': 'Sud-Ouest', '40': 'Sud-Ouest',
  // Jura
  '39': 'Jura',
  // Savoie
  '73': 'Savoie', '74': 'Savoie',
  // Corse
  '2A': 'Corse', '2B': 'Corse',
};

// ── Appellation keywords → Wine Region ──────────────────────────────
// Normalisé (lowercase, sans accents) pour matching fuzzy
export const APPELLATION_KEYWORDS: [string, string][] = [
  // Bordeaux
  ['saint-emilion', 'Bordeaux'], ['st-emilion', 'Bordeaux'], ['pauillac', 'Bordeaux'],
  ['margaux', 'Bordeaux'], ['medoc', 'Bordeaux'], ['haut-medoc', 'Bordeaux'],
  ['saint-julien', 'Bordeaux'], ['saint-estephe', 'Bordeaux'], ['pomerol', 'Bordeaux'],
  ['pessac-leognan', 'Bordeaux'], ['pessac', 'Bordeaux'], ['leognan', 'Bordeaux'],
  ['graves', 'Bordeaux'], ['sauternes', 'Bordeaux'], ['barsac', 'Bordeaux'],
  ['entre-deux-mers', 'Bordeaux'], ['fronsac', 'Bordeaux'], ['castillon', 'Bordeaux'],
  ['lalande-de-pomerol', 'Bordeaux'], ['lalande', 'Bordeaux'],
  ['moulis', 'Bordeaux'], ['listrac', 'Bordeaux'],
  ['blaye', 'Bordeaux'], ['bourg', 'Bordeaux'],
  ['cotes de bordeaux', 'Bordeaux'], ['bordeaux superieur', 'Bordeaux'], ['bordeaux', 'Bordeaux'],
  ['lussac', 'Bordeaux'], ['montagne', 'Bordeaux'], ['puisseguin', 'Bordeaux'],
  ['canon-fronsac', 'Bordeaux'], ['cotes de francs', 'Bordeaux'],
  // Bourgogne
  ['chablis', 'Bourgogne'], ['gevrey-chambertin', 'Bourgogne'], ['chambertin', 'Bourgogne'],
  ['nuits-saint-georges', 'Bourgogne'], ['nuits saint georges', 'Bourgogne'],
  ['vosne-romanee', 'Bourgogne'], ['romanee-conti', 'Bourgogne'],
  ['pommard', 'Bourgogne'], ['volnay', 'Bourgogne'],
  ['meursault', 'Bourgogne'], ['puligny-montrachet', 'Bourgogne'], ['montrachet', 'Bourgogne'],
  ['chassagne', 'Bourgogne'], ['corton', 'Bourgogne'], ['beaune', 'Bourgogne'],
  ['savigny', 'Bourgogne'], ['mercurey', 'Bourgogne'], ['givry', 'Bourgogne'],
  ['rully', 'Bourgogne'], ['montagny', 'Bourgogne'],
  ['macon', 'Bourgogne'], ['pouilly-fuisse', 'Bourgogne'], ['saint-veran', 'Bourgogne'],
  ['bourgogne', 'Bourgogne'], ['irancy', 'Bourgogne'], ['marsannay', 'Bourgogne'],
  ['fixin', 'Bourgogne'], ['morey-saint-denis', 'Bourgogne'],
  ['chambolle-musigny', 'Bourgogne'], ['musigny', 'Bourgogne'],
  ['vougeot', 'Bourgogne'], ['clos de vougeot', 'Bourgogne'],
  ['echezeaux', 'Bourgogne'], ['richebourg', 'Bourgogne'],
  ['la tache', 'Bourgogne'], ['bonnes-mares', 'Bourgogne'],
  ['aloxe-corton', 'Bourgogne'], ['pernand-vergelesses', 'Bourgogne'],
  ['auxey-duresses', 'Bourgogne'], ['monthelie', 'Bourgogne'],
  ['saint-romain', 'Bourgogne'], ['santenay', 'Bourgogne'],
  ['maranges', 'Bourgogne'], ['saint-aubin', 'Bourgogne'],
  ['cote de nuits', 'Bourgogne'], ['cote de beaune', 'Bourgogne'],
  ['cote chalonnaise', 'Bourgogne'], ['hautes-cotes', 'Bourgogne'],
  // Rhône
  ['chateauneuf-du-pape', 'Vallée du Rhône'], ['chateauneuf', 'Vallée du Rhône'],
  ['hermitage', 'Vallée du Rhône'], ['crozes-hermitage', 'Vallée du Rhône'],
  ['cote-rotie', 'Vallée du Rhône'], ['cote rotie', 'Vallée du Rhône'],
  ['saint-joseph', 'Vallée du Rhône'], ['cornas', 'Vallée du Rhône'],
  ['gigondas', 'Vallée du Rhône'], ['vacqueyras', 'Vallée du Rhône'],
  ['rasteau', 'Vallée du Rhône'], ['cairanne', 'Vallée du Rhône'],
  ['beaumes-de-venise', 'Vallée du Rhône'], ['cotes-du-rhone', 'Vallée du Rhône'],
  ['cotes du rhone', 'Vallée du Rhône'], ['ventoux', 'Vallée du Rhône'],
  ['luberon', 'Vallée du Rhône'], ['lirac', 'Vallée du Rhône'],
  ['tavel', 'Vallée du Rhône'], ['vinsobres', 'Vallée du Rhône'],
  ['condrieu', 'Vallée du Rhône'], ['chateau-grillet', 'Vallée du Rhône'],
  ['saint-peray', 'Vallée du Rhône'], ['costieres de nimes', 'Vallée du Rhône'],
  ['clairette de die', 'Vallée du Rhône'], ['rhone', 'Vallée du Rhône'],
  // Loire
  ['sancerre', 'Loire'], ['pouilly-fume', 'Loire'], ['pouilly fume', 'Loire'],
  ['vouvray', 'Loire'], ['chinon', 'Loire'], ['bourgueil', 'Loire'],
  ['saint-nicolas-de-bourgueil', 'Loire'], ['muscadet', 'Loire'],
  ['anjou', 'Loire'], ['saumur', 'Loire'], ['saumur-champigny', 'Loire'],
  ['savennieres', 'Loire'], ['quarts de chaume', 'Loire'],
  ['bonnezeaux', 'Loire'], ['coteaux du layon', 'Loire'],
  ['montlouis', 'Loire'], ['touraine', 'Loire'],
  ['menetou-salon', 'Loire'], ['quincy', 'Loire'], ['reuilly', 'Loire'],
  ['cheverny', 'Loire'], ['val de loire', 'Loire'],
  ['cremant de loire', 'Loire'], ['jasnieres', 'Loire'], ['loire', 'Loire'],
  // Alsace
  ['alsace', 'Alsace'], ['cremant d\'alsace', 'Alsace'],
  // Champagne
  ['champagne', 'Champagne'],
  // Beaujolais
  ['beaujolais', 'Beaujolais'], ['beaujolais-villages', 'Beaujolais'],
  ['morgon', 'Beaujolais'], ['fleurie', 'Beaujolais'],
  ['moulin-a-vent', 'Beaujolais'], ['chiroubles', 'Beaujolais'],
  ['brouilly', 'Beaujolais'], ['cote de brouilly', 'Beaujolais'],
  ['julienas', 'Beaujolais'], ['chenas', 'Beaujolais'],
  ['saint-amour', 'Beaujolais'], ['regnie', 'Beaujolais'],
  // Languedoc
  ['languedoc', 'Languedoc'], ['pic saint-loup', 'Languedoc'], ['pic-saint-loup', 'Languedoc'],
  ['faugeres', 'Languedoc'], ['saint-chinian', 'Languedoc'],
  ['minervois', 'Languedoc'], ['corbieres', 'Languedoc'], ['fitou', 'Languedoc'],
  ['la clape', 'Languedoc'], ['terrasses du larzac', 'Languedoc'],
  ['pezenas', 'Languedoc'], ['limoux', 'Languedoc'], ['cabardes', 'Languedoc'],
  // Roussillon
  ['roussillon', 'Roussillon'], ['cotes du roussillon', 'Roussillon'],
  ['collioure', 'Roussillon'], ['banyuls', 'Roussillon'], ['maury', 'Roussillon'],
  ['rivesaltes', 'Roussillon'],
  // Provence
  ['provence', 'Provence'], ['cotes de provence', 'Provence'],
  ['bandol', 'Provence'], ['cassis', 'Provence'], ['bellet', 'Provence'],
  ['palette', 'Provence'], ['coteaux d\'aix', 'Provence'],
  ['coteaux varois', 'Provence'], ['les baux', 'Provence'],
  // Sud-Ouest
  ['bergerac', 'Sud-Ouest'], ['monbazillac', 'Sud-Ouest'], ['cahors', 'Sud-Ouest'],
  ['madiran', 'Sud-Ouest'], ['jurancon', 'Sud-Ouest'], ['gaillac', 'Sud-Ouest'],
  ['fronton', 'Sud-Ouest'], ['buzet', 'Sud-Ouest'], ['irouleguy', 'Sud-Ouest'],
  ['marcillac', 'Sud-Ouest'], ['cotes de duras', 'Sud-Ouest'],
  ['pacherenc', 'Sud-Ouest'], ['tursan', 'Sud-Ouest'], ['pecharmant', 'Sud-Ouest'],
  ['cotes de gascogne', 'Sud-Ouest'], ['montravel', 'Sud-Ouest'],
  ['sud-ouest', 'Sud-Ouest'],
  // Jura
  ['jura', 'Jura'], ['arbois', 'Jura'], ['chateau-chalon', 'Jura'],
  ['cotes du jura', 'Jura'], ['cremant du jura', 'Jura'], ['vin jaune', 'Jura'],
  // Savoie
  ['savoie', 'Savoie'], ['vin de savoie', 'Savoie'], ['seyssel', 'Savoie'], ['bugey', 'Savoie'],
  // Corse
  ['corse', 'Corse'], ['patrimonio', 'Corse'], ['ajaccio', 'Corse'], ['muscat du cap corse', 'Corse'],
];

// ── Region name aliases (for direct region field matching) ──────────
export const REGION_ALIASES: Record<string, string> = {
  'rhône': 'Vallée du Rhône',
  'rhone': 'Vallée du Rhône',
  'vallee du rhone': 'Vallée du Rhône',
  'vallée du rhône': 'Vallée du Rhône',
  'val de loire': 'Loire',
  'languedoc-roussillon': 'Languedoc',
  'sud ouest': 'Sud-Ouest',
};

// Canonical wine region names
export const WINE_REGIONS = [
  'Bordeaux', 'Bourgogne', 'Vallée du Rhône', 'Loire', 'Alsace',
  'Champagne', 'Beaujolais', 'Languedoc', 'Roussillon', 'Provence',
  'Sud-Ouest', 'Jura', 'Savoie', 'Corse',
] as const;

// ── Région → base fill color (rich muted palette) ──────────────────
export const REGION_FILL: Record<string, string> = {
  'Bordeaux':         '#7f1d1d',
  'Bourgogne':        '#991b1b',
  'Vallée du Rhône':  '#c2410c',
  'Loire':            '#15803d',
  'Alsace':           '#a16207',
  'Champagne':        '#ca8a04',
  'Beaujolais':       '#be123c',
  'Languedoc':        '#9a3412',
  'Roussillon':       '#92400e',
  'Provence':         '#db2777',
  'Sud-Ouest':        '#78350f',
  'Jura':             '#4d7c0f',
  'Savoie':           '#0369a1',
  'Corse':            '#3f6212',
};

// ── Normalizer ─────────────────────────────────────────────────────
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/**
 * Resolve a wine's region using both region field and appellation.
 * Returns a canonical wine region name or null.
 */
export function resolveWineRegion(region?: string, appellation?: string): string | null {
  // 1) Direct match on region field
  if (region) {
    const nr = norm(region);
    // Exact match
    if (WINE_REGIONS.includes(region as any)) return region;
    // Alias match
    for (const [alias, canonical] of Object.entries(REGION_ALIASES)) {
      if (nr === norm(alias)) return canonical;
    }
    // Fuzzy: check if region matches any keyword
    for (const [kw, wr] of APPELLATION_KEYWORDS) {
      if (nr === norm(kw) || nr.includes(norm(kw)) || norm(kw).includes(nr)) return wr;
    }
  }

  // 2) Match on appellation
  if (appellation) {
    const na = norm(appellation);
    for (const [kw, wr] of APPELLATION_KEYWORDS) {
      if (na === norm(kw) || na.includes(norm(kw)) || norm(kw).includes(na)) return wr;
    }
  }

  return null;
}
