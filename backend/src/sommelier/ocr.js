// OCR & extraction from a wine label image (Phase 6.1).
// Tâche 'ocr' d'aiService : Gemini Flash (vision) par défaut, repli Claude
// Sonnet si Gemini n'est pas configuré ou échoue. Sortie structurée OCR_SCHEMA.

import { generateJson } from '../services/aiService.js';
import { OCR_SCHEMA } from './schemas.js';

const SYSTEM_PROMPT = `Tu es un expert en lecture d'étiquettes de vin. À partir d'une photo, extrais les informations factuelles visibles sur l'étiquette.

Si une information n'est pas lisible, mets null. N'invente rien : ce qui n'est pas écrit sur l'étiquette reste null.
- type : couleur/style du vin si déductible de l'étiquette (RED, WHITE, ROSE, SPARKLING, DESSERT, FORTIFIED)
- abv : degré d'alcool en % (ex: 13.5)
- format : contenance (ex: "750ml")
- confidence : HIGH si l'étiquette est nette et complète, LOW si elle est floue ou partielle
- notes : mentions utiles (bio, parcelle, vieilles vignes, élevage…)`;

/**
 * @param {string} base64 - base64-encoded image data (without data: prefix)
 * @param {string} mimeType - e.g. image/jpeg
 */
export const extractFromLabel = (base64, mimeType = 'image/jpeg') => generateJson('ocr', {
  system: SYSTEM_PROMPT,
  user: 'Extrais les informations de cette étiquette.',
  images: [{ mimeType, data: base64 }],
  schema: OCR_SCHEMA,
});
