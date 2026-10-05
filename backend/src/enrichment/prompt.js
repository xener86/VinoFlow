// Prompt de la cascade d'enrichissement (recherche web sourcée).
import { queryVariants } from './normalize.js';

export const PREFERRED_SOURCES = [
  'site officiel du domaine', 'Guide Hachette (hachette-vins.com)', 'Gilbert & Gaillard',
  'La Revue du vin de France', 'Bettane+Desseauve', 'Gault&Millau', 'iDealwine', 'Vinatis',
  'Wine-Searcher', 'CellarTracker', 'Vivino', 'cavistes et importateurs', 'lapassionduvin.com',
];

// Bruit identifié lors des essais : jamais d'information vin fiable.
export const BLOCKED_DOMAINS = ['pinterest.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'youtube.com'];

export const SYSTEM_PROMPT = `Tu es un documentaliste du vin. Tu complètes la fiche d'un vin d'une cave personnelle à partir de sources web vérifiables. Tu ne devines jamais : ce que tu ne trouves pas reste vide ou relève d'un niveau plus générique.

Cascade (arrête-toi au niveau le plus précis réellement atteint) :
1. EXACT — cette cuvée ET ce millésime précis (fiche technique, avis de guide, fiche caviste).
2. AUTRE_MILLESIME — même cuvée, autre millésime : transpose le style, les cépages, l'élevage ; ajuste la garde et le fruit au millésime ; indique le millésime utilisé (basis_vintage).
3. PRODUCTEUR — style de la maison, cépages, vinification, sans info sur la cuvée.
4. APPELLATION — appellation + cépages typiques + garde typique, en tenant compte du prix payé.
5. REGLES — rien de mieux : laisse le profil vide, le serveur appliquera une règle déterministe.

Règles strictes :
- Chaque source = une page réellement consultée ou renvoyée par la recherche, avec un extrait COPIÉ MOT POUR MOT depuis la page, dans la langue de la page (ne traduis pas, ne résume pas), assez long pour être retrouvé (une phrase). Le serveur vérifie la présence de l'extrait dans la page : un extrait traduit ou reformulé est rejeté. N'invente aucune URL.
- Indique pour chaque source son niveau et le millésime dont elle parle. Méfie-toi des pages qui mélangent les millésimes : vérifie que l'extrait concerne bien le millésime annoncé.
- Une information sans source ne peut être ni EXACT ni AUTRE_MILLESIME.
- Identification : plusieurs domaines peuvent porter un nom proche (« Domaine Richard »…). Si tu ne peux pas trancher avec des preuves (lieu, liste des cuvées, appellation), status = AMBIGUOUS, liste les candidats avec leurs preuves et ne remplis pas le profil. Si le nom saisi est approchant (« Les Aieuls » / « Réserve de l'Aïeul »), identifie la vraie cuvée (matched_cuvee) et explique-le dans note.
- Corrections : seulement si une source dit explicitement autre chose que la fiche (couleur, nom exact de la cuvée, appellation, région, cépages), avec l'index de cette source. Pas de correction de style ou d'orthographe mineure.
- Arômes : 3 à 8 arômes concrets en français tirés des sources. Profil sensoriel 0-100 seulement si les sources le permettent, sinon null.
- Fenêtre d'apogée : années absolues ; pour un vin sans millésime, raisonne à partir d'aujourd'hui. Explique-la dans peak_reasoning.
- knowledge : ce qui vaut pour TOUS les millésimes de la cuvée (style, cépages, garde typique en années après le millésime).
- Sources à privilégier : ${PREFERRED_SOURCES.join(', ')}. Évite les réseaux sociaux.
- Fais au plus 8 recherches. Ajoute « vin » ou le type de vin aux requêtes ambiguës (homonymes hors vin).
- Réponds en français.`;

const fmtList = (list) => (list && list.length ? list.join(', ') : 'inconnu');

/**
 * @param {object} wine - fiche (camelCase)
 * @param {object} ctx - { tastingAromas, purchasePrice, knowledge, hint, currentYear }
 */
export const buildUserPrompt = (wine, ctx = {}) => {
  const lines = [
    'Fiche du vin (saisie par l\'utilisateur, peut contenir des erreurs) :',
    `- Producteur : ${wine.producer || 'inconnu'}`,
    `- Nom / cuvée : ${wine.name || ''}${wine.cuvee && wine.cuvee !== wine.name ? ` / ${wine.cuvee}` : ''}`,
    `- Millésime : ${wine.vintage && wine.vintage > 1800 ? wine.vintage : 'sans millésime (NV)'}`,
    `- Couleur : ${wine.type || 'inconnue'}`,
    `- Région / appellation : ${wine.region || '?'}${wine.appellation ? ` / ${wine.appellation}` : ''}${wine.country ? ` (${wine.country})` : ''}`,
    `- Cépages saisis : ${fmtList(wine.grapeVarieties)}`,
  ];
  if (ctx.purchasePrice) lines.push(`- Prix payé : environ ${Math.round(ctx.purchasePrice)} € la bouteille`);
  if (ctx.tastingAromas?.length) {
    lines.push(`- Arômes notés par l'utilisateur en dégustation (prioritaires, à confirmer/compléter) : ${ctx.tastingAromas.join(', ')}`);
  }
  if (ctx.hint) lines.push('', `Identification choisie par l'utilisateur : ${ctx.hint}`);
  if (ctx.knowledge) {
    lines.push('', 'Déjà connu pour cette cuvée (recherches précédentes, autres millésimes) — vérifie seulement ce qui dépend du millésime :',
      JSON.stringify(ctx.knowledge.data));
    if (ctx.knowledge.sources?.length) lines.push(`Sources déjà connues : ${ctx.knowledge.sources.map((s) => s.url).join(' ; ')}`);
  }
  lines.push('', `Requêtes de départ suggérées : ${queryVariants(wine).map((q) => `« ${q} »`).join(', ')}`);
  lines.push(`Année en cours : ${ctx.currentYear || new Date().getFullYear()}.`);
  return lines.join('\n');
};
