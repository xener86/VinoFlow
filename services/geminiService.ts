import { GoogleGenAI, Schema, Type } from "@google/genai";
import { Wine, Spirit, CocktailRecipe, SommelierRecommendation, EveningPlan, CellarGapAnalysis, AIProvider } from '../types';
import { getAIConfig } from './storageService';

// --- JSON SCHEMAS ---
const wineSchemaStructure = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ["RED", "WHITE", "ROSE", "SPARKLING", "DESSERT", "FORTIFIED"] },
    grapeVarieties: { type: Type.ARRAY, items: { type: Type.STRING } },
    sensoryDescription: { type: Type.STRING },
    aromaProfile: { type: Type.ARRAY, items: { type: Type.STRING } },
    tastingNotes: { type: Type.STRING },
    suggestedFoodPairings: { type: Type.ARRAY, items: { type: Type.STRING } },
    producerHistory: { type: Type.STRING },
    region: { type: Type.STRING },
    country: { type: Type.STRING },
    producer: { type: Type.STRING },
    name: { type: Type.STRING }, 
    cuvee: { type: Type.STRING, description: "Nom spécifique de la cuvée" },
    parcel: { type: Type.STRING, description: "Lieu-dit, Climat ou Parcelle spécifique" },
    vintage: { type: Type.INTEGER },
    confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
    sensoryProfile: {
      type: Type.OBJECT,
      properties: {
        body: { type: Type.INTEGER },
        acidity: { type: Type.INTEGER },
        tannin: { type: Type.INTEGER },
        sweetness: { type: Type.INTEGER },
        alcohol: { type: Type.INTEGER },
        flavors: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["body", "acidity", "tannin", "sweetness", "alcohol", "flavors"]
    }
  },
  required: ["type", "grapeVarieties", "sensoryDescription", "sensoryProfile", "region", "country", "producer", "name", "vintage", "confidence"]
};

// --- AI ADAPTER INTERFACE ---
interface AIAdapter {
  enrichWine(name: string, vintage: number, hint?: string, imageBase64?: string): Promise<Partial<Wine> | null>;
  enrichSpirit(name: string, hint?: string): Promise<Partial<Spirit> | null>;
  createCustomCocktail(ingredients: string[], query: string): Promise<Partial<CocktailRecipe> | null>;
  generateEducationalContent(itemName: string): Promise<string>;
  getSommelierRecommendations(inventory: Wine[], context: Record<string, unknown>): Promise<SommelierRecommendation[]>;
  getPairingAdvice(query: string, mode: string, inventory: Wine[]): Promise<string>;
  planEvening(context: Record<string, unknown>, wines: Wine[], spirits: Spirit[]): Promise<EveningPlan | null>;
  chatWithSommelier(history: Array<{ role: string; text: string }>, message: string): Promise<string>;
  analyzeCellarForWineFair(inventory: Wine[]): Promise<CellarGapAnalysis | null>;
  optimizeCellarStorage(boxWines: Array<{ id: string; name: string }>, shelfWines: Array<{ id: string; name: string }>): Promise<Array<{ bottleId: string; reason: string }>>;
}

// --- GEMINI ADAPTER ---
class GeminiAdapter implements AIAdapter {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private async generateJSON(prompt: string | unknown[], schema: Schema): Promise<unknown> {
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt as string,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.3
        }
      });
      return response.text ? JSON.parse(response.text) : null;
    } catch (e) {
      console.error("Gemini Error", e);
      return null;
    }
  }

  async enrichWine(name: string, vintage: number, hint?: string, imageBase64?: string) {
    let contents: unknown;
    
    if (imageBase64) {
      contents = [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { text: "Tu es expert en vin et OCR. Analyse cette étiquette. Extrais TOUS les détails en français." }
      ];
    } else {
      contents = `Analyse ce vin : "${name}" (${vintage}) ${hint || ''}. Retourne un JSON complet EN FRANÇAIS.`;
    }

    const res = await this.generateJSON(contents as string, wineSchemaStructure as Schema) as Record<string, unknown> | null;
    if (res) return { ...res, enrichedByAI: true, format: '750ml', personalNotes: [], aiConfidence: res.confidence || 'MEDIUM' } as Partial<Wine>;
    return null;
  }

  async enrichSpirit(name: string, hint?: string) {
    const schema = {
      type: Type.OBJECT,
      properties: {
        category: { type: Type.STRING },
        distillery: { type: Type.STRING },
        region: { type: Type.STRING },
        country: { type: Type.STRING },
        abv: { type: Type.NUMBER },
        format: { type: Type.INTEGER },
        description: { type: Type.STRING },
        producerHistory: { type: Type.STRING },
        tastingNotes: { type: Type.STRING },
        aromaProfile: { type: Type.ARRAY, items: { type: Type.STRING } },
        suggestedCocktails: { type: Type.ARRAY, items: { type: Type.STRING } },
        culinaryPairings: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["category", "description"]
    } as Schema;
    
    const prompt = `Analyse ce spiritueux : "${name}" ${hint || ''}. Retourne JSON français complet.`;
    const res = await this.generateJSON(prompt, schema) as Record<string, unknown> | null;
    if (res) return { ...res, enrichedByAI: true, addedAt: new Date().toISOString() } as Partial<Spirit>;
    return null;
  }

  async createCustomCocktail(ingredients: string[], query: string) {
    const prompt = `Mixologue. Stock: ${ingredients.join(',')}. Demande: "${query}". Crée recette JSON.`;
    const schema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING },
        ingredients: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, amount: { type: Type.NUMBER }, unit: { type: Type.STRING }, optional: { type: Type.BOOLEAN } } } },
        instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
        glassType: { type: Type.STRING },
        difficulty: { type: Type.STRING }
      }
    } as Schema;
    const res = await this.generateJSON(prompt, schema) as Record<string, unknown> | null;
    if (res) return { ...res, category: 'MODERN', prepTime: 5, source: 'AI', isFavorite: false, tags: ['AI'] } as Partial<CocktailRecipe>;
    return null;
  }

  async generateEducationalContent(itemName: string): Promise<string> {
    try {
      const r = await this.client.models.generateContent({ 
        model: 'gemini-2.5-flash', 
        contents: `Anecdote courte sur "${itemName}" en français.`
      });
      return r.text || "";
    } catch {
      return "";
    }
  }

  async getSommelierRecommendations(inventory: Wine[], context: Record<string, unknown>) {
    if (inventory.length === 0) return [];
    const invStr = inventory.map(w => `ID:${w.id} ${w.name} ${w.cuvee || ''}`).join('\n');
    const prompt = `Sommelier. Contexte: ${JSON.stringify(context)}. Vins: ${invStr}. JSON Array de 3 recs.`;
    const schema = { 
      type: Type.ARRAY, 
      items: { 
        type: Type.OBJECT, 
        properties: { 
          wineId: { type: Type.STRING }, 
          score: { type: Type.INTEGER }, 
          reasoning: { type: Type.STRING }, 
          servingTemp: { type: Type.STRING }, 
          decanting: { type: Type.BOOLEAN }, 
          foodPairingMatch: { type: Type.STRING }
        },
        required: ["wineId", "score", "reasoning"]
      } 
    } as Schema;
    const res = await this.generateJSON(prompt, schema);
    return (res as SommelierRecommendation[]) || [];
  }

  async getPairingAdvice(query: string, mode: string, inventory: Wine[]) {
    const prompt = `Sommelier. Mode: ${mode}. Query: "${query}". Inventory: ${inventory.map(w => w.name).join(', ')}. Short MD response.`;
    try {
      const r = await this.client.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      return r.text || "";
    } catch {
      return "";
    }
  }

  async planEvening(context: Record<string, unknown>, wines: Wine[], spirits: Spirit[]) {
    const prompt = `Soirée Plan. Context: ${JSON.stringify(context)}. Vins: ${wines.map(w => w.name).join(',')}. Spiritueux: ${spirits.map(s => s.name).join(',')}. JSON only.`;
    const schema = {
      type: Type.OBJECT,
      properties: {
        theme: { type: Type.STRING },
        aperitif: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, name: { type: Type.STRING }, description: { type: Type.STRING }, pairingSnack: { type: Type.STRING } } },
        mainCourse: { type: Type.OBJECT, properties: { dishName: { type: Type.STRING }, wineName: { type: Type.STRING }, pairingReason: { type: Type.STRING } } },
        digestif: { type: Type.OBJECT, properties: { spiritName: { type: Type.STRING }, description: { type: Type.STRING } } }
      }
    } as Schema;
    return this.generateJSON(prompt, schema) as Promise<EveningPlan | null>;
  }

  async chatWithSommelier(history: Array<{ role: string; text: string }>, message: string) {
    const prompt = `Sommelier expert français. Historique: ${JSON.stringify(history)}. Question: ${message}`;
    try {
      const r = await this.client.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      return r.text || "";
    } catch {
      return "";
    }
  }

  async analyzeCellarForWineFair(inventory: Wine[]) {
    const prompt = `Expert Achat Vin. Analyse cave: ${inventory.map(w => `${w.region} ${w.type} ${w.vintage}`).join(',')}. JSON Checklist achat.`;
    const schema = {
      type: Type.OBJECT,
      properties: {
        generalAnalysis: { type: Type.STRING },
        gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
        suggestions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { region: { type: Type.STRING }, type: { type: Type.STRING }, priority: { type: Type.STRING }, reason: { type: Type.STRING }, budgetRecommendation: { type: Type.STRING }, specificTarget: { type: Type.STRING } } } }
      },
      required: ["generalAnalysis", "gaps", "suggestions"]
    } as Schema;
    const res = await this.generateJSON(prompt, schema) as CellarGapAnalysis | null;
    if (res?.suggestions) {
      res.suggestions = res.suggestions.map(s => ({ ...s, id: crypto.randomUUID() }));
    }
    return res;
  }

  async optimizeCellarStorage(boxWines: Array<{ id: string; name: string }>, shelfWines: Array<{ id: string; name: string }>) {
    if (boxWines.length === 0) return [];
    const prompt = `Optimisation Cave. Box: ${JSON.stringify(boxWines)}. Shelf: ${JSON.stringify(shelfWines)}. JSON Array {bottleId, reason}.`;
    const schema = {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { bottleId: { type: Type.STRING }, reason: { type: Type.STRING } }, required: ["bottleId"] }
    } as Schema;
    return (await this.generateJSON(prompt, schema) as Array<{ bottleId: string; reason: string }>) || [];
  }
}

// --- REST ADAPTER (OpenAI / Mistral) ---
class RestAdapter implements AIAdapter {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, provider: 'OPENAI' | 'MISTRAL') {
    this.apiKey = apiKey;
    this.baseUrl = provider === 'OPENAI' 
      ? 'https://api.openai.com/v1/chat/completions' 
      : 'https://api.mistral.ai/v1/chat/completions';
    this.model = provider === 'OPENAI' ? 'gpt-4o-mini' : 'mistral-large-latest';
  }

  private async call(messages: Array<{ role: string; content: string | unknown[] }>, jsonMode = true): Promise<unknown> {
    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          response_format: jsonMode ? { type: "json_object" } : undefined
        })
      });
      const data = await res.json();
      const content = data.choices[0].message.content;
      return jsonMode ? JSON.parse(content) : content;
    } catch (e) {
      console.error("REST API Error", e);
      return null;
    }
  }

  async enrichWine(name: string, vintage: number, hint?: string, imageBase64?: string) {
    const system = `Expert Vin. Structure JSON: ${JSON.stringify(wineSchemaStructure)}.`;
    let userContent: string | unknown[] = `Analyse "${name}" ${vintage} ${hint || ''}. En Français.`;

    if (imageBase64) {
      userContent = [
        { type: "text", text: "Analyse cette étiquette. Extrais les données." },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
      ];
    }

    const res = await this.call([
      { role: "system", content: system },
      { role: "user", content: userContent }
    ]) as Record<string, unknown> | null;

    if (res) return { ...res, enrichedByAI: true, format: '750ml', personalNotes: [], aiConfidence: res.confidence || 'MEDIUM' } as Partial<Wine>;
    return null;
  }

  async enrichSpirit(name: string, hint?: string) {
    const system = "Expert Spiritueux. JSON complet.";
    const user = `Analyse "${name}" ${hint || ''}. En Français.`;
    const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]) as Record<string, unknown> | null;
    if (res) return { ...res, enrichedByAI: true, addedAt: new Date().toISOString() } as Partial<Spirit>;
    return null;
  }

  async createCustomCocktail(ingredients: string[], query: string) {
    const system = "Mixologue. JSON Recette.";
    const user = `Stock: ${ingredients.join(',')}. Request: ${query}`;
    const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]) as Record<string, unknown> | null;
    if (res) return { ...res, category: 'MODERN', prepTime: 5, source: 'AI', isFavorite: false, tags: ['AI'] } as Partial<CocktailRecipe>;
    return null;
  }

  async generateEducationalContent(itemName: string): Promise<string> {
    const result = await this.call([
      { role: "system", content: "Expert Vin. Anecdote courte." },
      { role: "user", content: itemName }
    ], false);
    return typeof result === 'string' ? result : '';
  }

  async getSommelierRecommendations(inventory: Wine[], context: Record<string, unknown>) {
    const system = "Sommelier. JSON Array {wineId, score, reasoning, servingTemp, decanting, foodPairingMatch}";
    const user = `Context: ${JSON.stringify(context)}. Inventory: ${inventory.map(w => `ID:${w.id} ${w.name}`).join(',')}`;
    const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
    if (Array.isArray(res)) return res as SommelierRecommendation[];
    if (res && typeof res === 'object' && 'recommendations' in res) return (res as { recommendations: SommelierRecommendation[] }).recommendations;
    return [];
  }

  async getPairingAdvice(query: string, mode: string, inventory: Wine[]) {
    const system = "Sommelier. Markdown réponse courte.";
    const user = `Mode: ${mode}. Query: ${query}. Inventory: ${inventory.map(w => w.name).join(',')}`;
    const result = await this.call([{ role: "system", content: system }, { role: "user", content: user }], false);
    return typeof result === 'string' ? result : '';
  }

  async planEvening(context: Record<string, unknown>, wines: Wine[], spirits: Spirit[]) {
    const system = "Event Planner. JSON {theme, aperitif, mainCourse, digestif}";
    const user = `Context: ${JSON.stringify(context)}. Wines: ${wines.map(w => w.name).join(',')}. Spirits: ${spirits.map(s => s.name).join(',')}`;
    return this.call([{ role: "system", content: system }, { role: "user", content: user }]) as Promise<EveningPlan | null>;
  }

  async chatWithSommelier(history: Array<{ role: string; text: string }>, message: string) {
    const system = "Sommelier Chatbot.";
    const messages = [
      { role: "system", content: system }, 
      ...history.map(h => ({ role: h.role, content: h.text })), 
      { role: "user", content: message }
    ];
    const result = await this.call(messages, false);
    return typeof result === 'string' ? result : '';
  }

  async analyzeCellarForWineFair(inventory: Wine[]) {
    const system = "Wine Buyer. JSON {generalAnalysis, gaps, suggestions}";
    const user = `Inventory: ${inventory.map(w => `${w.region} ${w.type}`).join(',')}`;
    const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]) as CellarGapAnalysis | null;
    if (res?.suggestions) {
      res.suggestions = res.suggestions.map(s => ({ ...s, id: crypto.randomUUID() }));
    }
    return res;
  }

  async optimizeCellarStorage(boxWines: Array<{ id: string; name: string }>, shelfWines: Array<{ id: string; name: string }>) {
    const system = "Cellar Manager. JSON Array {bottleId, reason}";
    const user = `Box: ${JSON.stringify(boxWines)}. Shelf: ${JSON.stringify(shelfWines)}.`;
    const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
    if (Array.isArray(res)) return res as Array<{ bottleId: string; reason: string }>;
    return [];
  }
}

// --- FACTORY ---
export const getAiProvider = (): AIAdapter => {
  const config = getAIConfig();
  
  if (config.provider === 'OPENAI' && config.keys.openai) {
    return new RestAdapter(config.keys.openai, 'OPENAI');
  }
  if (config.provider === 'MISTRAL' && config.keys.mistral) {
    return new RestAdapter(config.keys.mistral, 'MISTRAL');
  }
  
  const key = config.keys.gemini || '';
  return new GeminiAdapter(key);
};

// --- EXPORTED FUNCTIONS ---
export const enrichWineData = (n: string, v: number, h?: string, img?: string) => getAiProvider().enrichWine(n, v, h, img);
export const enrichSpiritData = (n: string, h?: string) => getAiProvider().enrichSpirit(n, h);
export const createCustomCocktail = (i: string[], q: string) => getAiProvider().createCustomCocktail(i, q);
export const generateEducationalContent = (i: string) => getAiProvider().generateEducationalContent(i);
export const getSommelierRecommendations = (i: Wine[], c: Record<string, unknown>) => getAiProvider().getSommelierRecommendations(i, c);
export const getPairingAdvice = (q: string, m: string, i: Wine[]) => getAiProvider().getPairingAdvice(q, m, i);
export const planEvening = (c: Record<string, unknown>, w: Wine[], s: Spirit[]) => getAiProvider().planEvening(c, w, s);
export const chatWithSommelier = (h: Array<{ role: string; text: string }>, m: string) => getAiProvider().chatWithSommelier(h, m);
export const analyzeCellarForWineFair = (i: Wine[]) => getAiProvider().analyzeCellarForWineFair(i);
export const optimizeCellarStorage = (b: Array<{ id: string; name: string }>, s: Array<{ id: string; name: string }>) => getAiProvider().optimizeCellarStorage(b, s);
