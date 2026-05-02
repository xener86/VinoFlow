// OCR & extraction from a wine label image (Phase 6.1).
// Uses Gemini Vision (multimodal). Receives a base64-encoded image and returns
// the structured wine fields it could detect.

import { GoogleGenAI } from '@google/genai';

const SYSTEM_PROMPT = `Tu es un expert en lecture d'étiquettes de vin. À partir d'une photo, extrais les informations factuelles et structure-les en JSON.

Si une information n'est pas lisible, mets null.

Réponds UNIQUEMENT en JSON, structure exacte:
{
  "producer": "...",
  "name": "...",
  "cuvee": "...",
  "vintage": 2018,
  "region": "...",
  "appellation": "...",
  "country": "France",
  "type": "RED|WHITE|ROSE|SPARKLING|DESSERT|FORTIFIED",
  "abv": 13.5,
  "format": "750ml",
  "grape_varieties": ["..."],
  "confidence": "HIGH|MEDIUM|LOW",
  "notes": "Mentions sur l'étiquette: bio, parcelle, vieilles vignes, ..."
}`;

let lazyClient = null;
const getClient = () => {
  if (!lazyClient) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    lazyClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return lazyClient;
};

/**
 * @param {string} base64 - base64-encoded image data (without data: prefix)
 * @param {string} mimeType - e.g. image/jpeg
 */
export const extractFromLabel = async (base64, mimeType = 'image/jpeg') => {
  const client = getClient();
  const response = await client.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: [{
      role: 'user',
      parts: [
        { text: SYSTEM_PROMPT },
        { inlineData: { mimeType, data: base64 } },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
    },
  });
  const text = response.text || '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`OCR JSON parse failed: ${e.message}`);
  }
};
