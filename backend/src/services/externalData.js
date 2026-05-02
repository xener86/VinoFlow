// Phase 9 — External data sources.
// Stubs for Vivino, Wine-Searcher, and press notes.
//
// These services do not have free public APIs at the time of writing.
// The implementations below are scaffolds: they return either AI-generated
// estimates (using Claude/Gemini) or null. Replace with real API calls once
// you have access to a provider (Vivino partner API, Wine-Searcher paid API,
// Cellar Tracker scraping, etc.).

import { generateJson } from './aiService.js';

/**
 * Phase 9.1 — Cross-reference with community data.
 * Stub: ask the LLM what it knows about the wine's reputation.
 * Replace with Vivino / CellarTracker API call.
 */
export const fetchCommunityData = async (wine) => {
  const SYSTEM = `Tu connais les vins et leur réputation auprès des amateurs. Pour le vin demandé, donne ce que tu sais des notes communautaires moyennes (Vivino, CellarTracker), de la fenêtre de garde communément admise, et de la cote générale.

Si tu n'es pas sûr, mets confidence: "LOW" et indique-le.

Réponds en JSON:
{
  "estimated_community_rating": 4.2,
  "community_review_count": "around 1500",
  "estimated_aging_window_years": [3, 12],
  "general_reputation": "highly regarded|regarded|mixed|underwhelming",
  "confidence": "HIGH|MEDIUM|LOW",
  "notes": "..."
}

Ces données sont des estimations basées sur ta connaissance générale, pas des données live.`;
  try {
    const result = await generateJson('enrich', {
      system: SYSTEM,
      user: `${wine.producer || ''} ${wine.name} ${wine.cuvee || ''} ${wine.vintage || ''} (${wine.region || '?'})`,
    });
    return { source: 'AI_ESTIMATE', ...result };
  } catch (e) {
    return null;
  }
};

/**
 * Phase 9.2 — Estimated market value.
 * Stub: ask the LLM. Replace with Wine-Searcher API.
 */
export const fetchMarketValue = async (wine) => {
  const SYSTEM = `Donne une estimation du prix marché actuel d'un vin (en euros). Si tu ne connais pas, mets null. Considère que les prix marché varient selon l'état (en stock vs collection).

Réponds en JSON:
{
  "estimated_market_price_eur": 45,
  "price_range_eur": [35, 60],
  "confidence": "HIGH|MEDIUM|LOW",
  "notes": "..."
}`;
  try {
    const result = await generateJson('enrich', {
      system: SYSTEM,
      user: `${wine.producer || ''} ${wine.name} ${wine.cuvee || ''} ${wine.vintage || ''}`,
    });
    return { source: 'AI_ESTIMATE', ...result };
  } catch (e) {
    return null;
  }
};

/**
 * Phase 9.3 — Press scores (Parker, RVF, Wine Spectator, Decanter...).
 * Stub: ask the LLM. Replace with proper press scraping.
 */
export const fetchPressScores = async (wine) => {
  const SYSTEM = `Donne les notes presse connues pour ce vin (Parker, RVF, Wine Spectator, Decanter, Bettane & Desseauve). Si tu ne connais pas une note précise, ne l'invente pas — mets null.

Réponds en JSON:
{
  "scores": [
    { "publication": "Parker", "score": 94, "notation_max": 100, "year_reviewed": 2018 }
  ],
  "confidence": "HIGH|MEDIUM|LOW",
  "notes": "..."
}`;
  try {
    const result = await generateJson('enrich', {
      system: SYSTEM,
      user: `${wine.producer || ''} ${wine.name} ${wine.cuvee || ''} ${wine.vintage || ''}`,
    });
    return { source: 'AI_ESTIMATE', ...result };
  } catch (e) {
    return null;
  }
};
