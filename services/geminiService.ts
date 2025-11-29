import { GoogleGenAI, Schema, Type } from "@google/genai";
import { Wine, Spirit, CocktailRecipe, SommelierRecommendation, EveningPlan, CellarGapAnalysis, AIConfig, AIProvider, OutOfCellarSuggestion } from '../types';
import { getAIConfig, getRacks } from './storageService';

// --- JSON SCHEMAS (Shared definition) ---
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
        cuvee: { type: Type.STRING, description: "Nom spécifique de la cuvée (ex: 'Orgasme', 'Réserve'). Vide si générique." },
        parcel: { type: Type.STRING, description: "Lieu-dit, Climat ou Parcelle spécifique (ex: 'Monts de Milieu')." },
        vintage: { type: Type.INTEGER },
        confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"], description: "Niveau de certitude. Si des infos manquent (cuvée, parcelle) sur une étiquette complexe, mettre MEDIUM ou LOW." },
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

// --- INTERFACE ---
interface AIAdapter {
    enrichWine(name: string, vintage: number, hint?: string, imageBase64?: string): Promise<Partial<Wine> | null>;
    enrichSpirit(name: string, hint?: string): Promise<Partial<Spirit> | null>;
    createCustomCocktail(ingredients: string[], query: string): Promise<Partial<CocktailRecipe> | null>;
    generateEducationalContent(itemName: string): Promise<string>;
    getSommelierRecommendations(inventory: Wine[], context: any): Promise<{recommendations: SommelierRecommendation[], outOfCellarSuggestion?: OutOfCellarSuggestion}>;
    getPairingAdvice(query: string, mode: string, inventory: Wine[]): Promise<string>;
    planEvening(context: any, wines: Wine[], spirits: Spirit[]): Promise<EveningPlan | null>;
    chatWithSommelier(history: any[], message: string): Promise<string>;
    analyzeCellarForWineFair(inventory: Wine[]): Promise<CellarGapAnalysis | null>;
    optimizeCellarStorage(boxWines: any[], shelfWines: any[]): Promise<{bottleId: string, reason: string}[]>;
}

// --- GEMINI ADAPTER (SDK) ---
class GeminiAdapter implements AIAdapter {
    private client: GoogleGenAI;

    constructor(apiKey: string) {
        this.client = new GoogleGenAI({ apiKey });
    }

    private async generateJSON(prompt: string | any[], schema: Schema): Promise<any> {
        try {
            const response = await this.client.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt as any,
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
        let contents: any = [];
        
        if (imageBase64) {
            contents = [
                { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
                { text: "Tu es expert en vin et OCR. Analyse cette étiquette ou fiche technique. Extrais TOUS les détails : Domaine, Appellation, Millésime, mais SURTOUT la 'Cuvée' (ex: Orgasme, Vieilles Vignes) et la 'Parcelle/Climat' (ex: Monts de Milieu). Remplis le JSON EN FRANÇAIS. Si l'info est floue, baisse la 'confidence'." }
            ];
        } else {
            contents = `Analyse ce vin : "${name}" (${vintage}) ${hint || ''}. Cherche spécifiquement s'il y a une Cuvée ou un Lieu-dit associé. Retourne un JSON complet EN FRANÇAIS.`;
        }

        const res = await this.generateJSON(contents, wineSchemaStructure as Schema);
        if(res) return { ...res, enrichedByAI: true, format: '750ml', personalNotes: [], aiConfidence: res.confidence || 'MEDIUM' };
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
                caskType: { type: Type.STRING },
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
        const res = await this.generateJSON(prompt, schema);
        if(res) return { ...res, enrichedByAI: true, addedAt: new Date().toISOString() };
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
        const res = await this.generateJSON(prompt, schema);
        if(res) return { ...res, category: 'MODERN', prepTime: 5, source: 'AI', isFavorite: false, tags: ['AI'] };
        return null;
    }

    async generateEducationalContent(itemName: string): Promise<string> {
        const r = await this.client.models.generateContent({ 
            model: 'gemini-2.5-flash', 
            contents: `Anecdote courte sur "${itemName}" en français.`
        });
        return r.text || "";
    }

    async getSommelierRecommendations(inventory: Wine[], context: any) {
        if(inventory.length===0) return {recommendations: []};
        
        const racks = getRacks();
        const invStr = inventory.map(w => {
            const bottleLocations = (w as any).bottles
                ?.filter((b: any) => !b.isConsumed && typeof b.location !== 'string')
                .slice(0, 2)
                .map((b: any) => {
                    const rack = racks.find(r => r.id === b.location.rackId);
                    const rackName = rack?.name || 'Inconnu';
                    const row = String.fromCharCode(65 + b.location.y);
                    const col = b.location.x + 1;
                    return `${rackName} [${row}${col}]`;
                }) || [];
            
            return `ID:${w.id} ${w.name} ${w.cuvee||''} ${w.parcel||''} (${w.vintage}) - Type:${w.type} Region:${w.region} Cépages:${w.grapeVarieties.join(',')} Favorite:${(w as any).isFavorite ? 'OUI' : 'NON'} Emplacements:[${bottleLocations.join(', ')}]`;
        }).join('\n');
        
        const prompt = `Tu es sommelier expert français. Année actuelle : 2025.

Contexte de la demande :
- Repas : ${context.meal || 'Non spécifié'}
- Contrainte : ${context.mood || 'Aucune'}

Vins disponibles en cave :
${invStr}

MISSION :
1. Sélectionne les 3 MEILLEURS vins pour ce moment
2. Pour chaque vin, calcule son statut d'apogée EN 2025 :
   - DRINK_NOW : à l'apogée maintenant (parfait pour boire)
   - KEEP_2_3_YEARS : jeune, garder 2-3 ans
   - DRINK_SOON : proche fin d'apogée, boire dans l'année
   - PAST_PEAK : passé son apogée
   
   Règles d'apogée :
   - Bordeaux rouge : apogée 10-20 ans (ex: 2015 = DRINK_NOW, 2020 = KEEP)
   - Bourgogne rouge : apogée 8-15 ans
   - Beaujolais : apogée 2-4 ans
   - Blanc sec : apogée 3-7 ans
   - Blanc liquoreux : apogée 10-30 ans
   - Champagne non millésimé : boire rapidement
   - Tiens compte de la structure (tannins élevés = garde longue)

3. Pour chaque vin, extrais 1-2 emplacements depuis les données (déjà fournis)
4. Si aucun vin n'atteint 95% de match, suggère UNE appellation hors cave avec domaines et millésimes

Réponds UNIQUEMENT en JSON avec cette structure :
{
  "recommendations": [
    {
      "wineId": "string",
      "score": number (0-100),
      "reasoning": "string (1 phrase en français expliquant pourquoi ce vin)",
      "servingTemp": "string (ex: 16-18°C)",
      "decanting": boolean,
      "foodPairingMatch": "string (accord mets-vin en 1 phrase)",
      "peakStatus": "DRINK_NOW | KEEP_2_3_YEARS | DRINK_SOON | PAST_PEAK",
      "peakExplanation": "string (1 phrase courte expliquant le statut)",
      "locations": ["string", "string"] (1-2 emplacements depuis les données)
    }
  ],
  "outOfCellarSuggestion": {
    "appellation": "string",
    "reason": "string (pourquoi cette appellation)",
    "recommendedDomains": ["string", "string"],
    "recommendedVintages": ["string", "string"]
  } OU null si un vin >= 95%
}`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                recommendations: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            wineId: { type: Type.STRING },
                            score: { type: Type.INTEGER },
                            reasoning: { type: Type.STRING },
                            servingTemp: { type: Type.STRING },
                            decanting: { type: Type.BOOLEAN },
                            foodPairingMatch: { type: Type.STRING },
                            peakStatus: { type: Type.STRING, enum: ["DRINK_NOW", "KEEP_2_3_YEARS", "DRINK_SOON", "PAST_PEAK"] },
                            peakExplanation: { type: Type.STRING },
                            locations: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["wineId", "score", "reasoning", "servingTemp", "decanting", "foodPairingMatch", "peakStatus", "peakExplanation", "locations"]
                    }
                },
                outOfCellarSuggestion: {
                    type: Type.OBJECT,
                    properties: {
                        appellation: { type: Type.STRING },
                        reason: { type: Type.STRING },
                        recommendedDomains: { type: Type.ARRAY, items: { type: Type.STRING } },
                        recommendedVintages: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    nullable: true
                }
            },
            required: ["recommendations"]
        } as Schema;

        const res = await this.generateJSON(prompt, schema);
        return res || {recommendations: []};
    }

    async getPairingAdvice(query: string, mode: string, inventory: Wine[]) {
        const prompt = `Sommelier. Mode: ${mode}. Query: "${query}". Inventory: ${inventory.map(w=>w.name).join(', ')}. Short MD response.`;
        const r = await this.client.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        return r.text || "";
    }

    async planEvening(context: any, wines: Wine[], spirits: Spirit[]) {
        const prompt = `Soirée Plan. Context: ${JSON.stringify(context)}. Vins: ${wines.map(w=>w.name).join(',')}. Spiritueux: ${spirits.map(s=>s.name).join(',')}. JSON only.`;
        const schema = {
            type: Type.OBJECT,
            properties: {
                theme: { type: Type.STRING },
                aperitif: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, name: { type: Type.STRING }, description: { type: Type.STRING }, pairingSnack: { type: Type.STRING } } },
                mainCourse: { type: Type.OBJECT, properties: { dishName: { type: Type.STRING }, wineName: { type: Type.STRING }, pairingReason: { type: Type.STRING } } },
                digestif: { type: Type.OBJECT, properties: { spiritName: { type: Type.STRING }, description: { type: Type.STRING } } }
            }
        } as Schema;
        return this.generateJSON(prompt, schema);
    }

    async chatWithSommelier(history: any[], message: string) {
        const prompt = `Sommelier expert français. Historique: ${JSON.stringify(history)}. Question: ${message}`;
        const r = await this.client.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        return r.text || "";
    }

    async analyzeCellarForWineFair(inventory: Wine[]) {
        const prompt = `Expert Achat Vin. Analyse cave: ${inventory.map(w=>`${w.region} ${w.type} ${w.vintage}`).join(',')}. JSON Checklist achat.`;
        const schema = {
            type: Type.OBJECT,
            properties: {
                generalAnalysis: { type: Type.STRING },
                gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
                suggestions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { region: { type: Type.STRING }, type: { type: Type.STRING }, priority: { type: Type.STRING }, reason: { type: Type.STRING }, budgetRecommendation: { type: Type.STRING }, specificTarget: { type: Type.STRING } } } }
            },
            required: ["generalAnalysis", "gaps", "suggestions"]
        } as Schema;
        const res = await this.generateJSON(prompt, schema);
        if(res && res.suggestions) {
            res.suggestions = res.suggestions.map((s:any) => ({...s, id: crypto.randomUUID()}));
        }
        return res;
    }

    async optimizeCellarStorage(boxWines: any[], shelfWines: any[]) {
        if (boxWines.length === 0) return [];
        const prompt = `Optimisation Cave. Box: ${JSON.stringify(boxWines)}. Shelf: ${JSON.stringify(shelfWines)}. JSON Array {bottleId, reason} suggestions move box->shelf.`;
        const schema = {
            type: Type.ARRAY,
            items: { type: Type.OBJECT, properties: { bottleId: { type: Type.STRING }, reason: { type: Type.STRING } }, required: ["bottleId"] }
        } as Schema;
        return this.generateJSON(prompt, schema) || [];
    }
}

// --- OPENAI / MISTRAL ADAPTER (REST) ---
class RestAdapter implements AIAdapter {
    private apiKey: string;
    private baseUrl: string;
    private model: string;
    private provider: 'OPENAI' | 'MISTRAL';

    constructor(apiKey: string, provider: 'OPENAI' | 'MISTRAL') {
        this.apiKey = apiKey;
        this.provider = provider;
        this.baseUrl = provider === 'OPENAI' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.mistral.ai/v1/chat/completions';
        this.model = provider === 'OPENAI' ? 'gpt-4o-mini' : 'mistral-large-latest';
    }

    private async call(messages: any[], jsonMode = true): Promise<any> {
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
        const system = `Expert Vin. Structure JSON: ${JSON.stringify(wineSchemaStructure)}. Inclure champ "confidence" (HIGH/MEDIUM/LOW).`;
        let userContent: any = `Analyse "${name}" ${vintage} ${hint||''}. En Français.`;

        if (imageBase64 && this.provider === 'OPENAI') {
            userContent = [
                { type: "text", text: "Analyse cette étiquette. Extrais les données. Si flou, confidence=LOW." },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            ];
        }

        const res = await this.call([
            { role: "system", content: system },
            { role: "user", content: userContent }
        ]);

        if(res) return { ...res, enrichedByAI: true, format: '750ml', personalNotes: [], aiConfidence: res.confidence || 'MEDIUM' };
        return null;
    }

    async enrichSpirit(name: string, hint?: string) {
        const system = "Expert Spiritueux. JSON: {category, distillery, region, country, abv, format, description, producerHistory, tastingNotes, aromaProfile, suggestedCocktails, culinaryPairings}";
        const user = `Analyse "${name}" ${hint||''}. En Français.`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        if(res) return { ...res, enrichedByAI: true, addedAt: new Date().toISOString() };
        return null;
    }

    async createCustomCocktail(ingredients: string[], query: string) {
        const system = "Mixologue. JSON Recette.";
        const user = `Stock: ${ingredients.join(',')}. Request: ${query}`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        if(res) return { ...res, category: 'MODERN', prepTime: 5, source: 'AI', isFavorite: false, tags: ['AI'] };
        return null;
    }

    async generateEducationalContent(itemName: string) {
        return this.call([
            { role: "system", content: "Expert Vin. Anecdote courte." },
            { role: "user", content: itemName }
        ], false);
    }

    async getSommelierRecommendations(inventory: Wine[], context: any) {
        const racks = getRacks();
        const invStr = inventory.map(w => {
            const bottleLocations = (w as any).bottles
                ?.filter((b: any) => !b.isConsumed && typeof b.location !== 'string')
                .slice(0, 2)
                .map((b: any) => {
                    const rack = racks.find(r => r.id === b.location.rackId);
                    const rackName = rack?.name || 'Inconnu';
                    const row = String.fromCharCode(65 + b.location.y);
                    const col = b.location.x + 1;
                    return `${rackName} [${row}${col}]`;
                }) || [];
            
            return `ID:${w.id} ${w.name} ${w.cuvee||''} ${w.parcel||''} (${w.vintage}) Emplacements:[${bottleLocations.join(', ')}]`;
        }).join('\n');

        const system = `Sommelier expert français. Année 2025. Réponds en JSON avec {recommendations: [...], outOfCellarSuggestion: {...} ou null}. 
        
Chaque recommendation doit avoir: wineId, score (0-100), reasoning, servingTemp, decanting, foodPairingMatch, peakStatus (DRINK_NOW/KEEP_2_3_YEARS/DRINK_SOON/PAST_PEAK), peakExplanation, locations (array de 1-2 strings).

Si aucun vin >= 95%, ajoute outOfCellarSuggestion avec appellation, reason, recommendedDomains, recommendedVintages.`;
        
        const user = `Context: ${JSON.stringify(context)}. Inventory:\n${invStr}`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        
        if (res && res.recommendations && Array.isArray(res.recommendations)) return res;
        if (res && Array.isArray(res)) return {recommendations: res};
        return {recommendations: []};
    }

    async getPairingAdvice(query: string, mode: string, inventory: Wine[]) {
        const system = "Sommelier. Markdown réponse courte.";
        const user = `Mode: ${mode}. Query: ${query}. Inventory: ${inventory.map(w=>w.name).join(',')}`;
        return this.call([{ role: "system", content: system }, { role: "user", content: user }], false);
    }

    async planEvening(context: any, wines: Wine[], spirits: Spirit[]) {
        const system = "Event Planner. JSON {theme, aperitif, mainCourse, digestif}";
        const user = `Context: ${JSON.stringify(context)}. Wines: ${wines.map(w=>w.name).join(',')}. Spirits: ${spirits.map(s=>s.name).join(',')}`;
        return this.call([{ role: "system", content: system }, { role: "user", content: user }]);
    }

    async chatWithSommelier(history: any[], message: string) {
        const system = "Sommelier Chatbot.";
        const messages = [{ role: "system", content: system }, ...history, { role: "user", content: message }];
        return this.call(messages, false);
    }

    async analyzeCellarForWineFair(inventory: Wine[]) {
        const system = "Wine Buyer. JSON {generalAnalysis, gaps, suggestions:[{region, type, priority, reason, budgetRecommendation, specificTarget}]}";
        const user = `Inventory: ${inventory.map(w=>`${w.region} ${w.type}`).join(',')}`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        if(res && res.suggestions) {
            res.suggestions = res.suggestions.map((s:any) => ({...s, id: crypto.randomUUID()}));
        }
        return res;
    }

    async optimizeCellarStorage(boxWines: any[], shelfWines: any[]) {
        const system = "Cellar Manager. JSON Array {bottleId, reason}";
        const user = `Box: ${JSON.stringify(boxWines)}. Shelf: ${JSON.stringify(shelfWines)}.`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        if (Array.isArray(res)) return res;
        if (res && res.moves) return res.moves;
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
    
    const key = config.keys.gemini || process.env.API_KEY || '';
    return new GeminiAdapter(key);
};

// --- EXPORTED FUNCTIONS (Proxy to Provider) ---
export const enrichWineData = (n: string, v: number, h?: string, img?: string) => getAiProvider().enrichWine(n, v, h, img);
export const enrichSpiritData = (n: string, h?: string) => getAiProvider().enrichSpirit(n, h);
export const createCustomCocktail = (i: string[], q: string) => getAiProvider().createCustomCocktail(i, q);
export const generateEducationalContent = (i: string) => getAiProvider().generateEducationalContent(i);
export const getSommelierRecommendations = (i: any[], c: any) => getAiProvider().getSommelierRecommendations(i, c);
export const getPairingAdvice = (q: string, m: string, i: any[]) => getAiProvider().getPairingAdvice(q, m, i);
export const planEvening = (c: any, w: any[], s: any[]) => getAiProvider().planEvening(c, w, s);
export const chatWithSommelier = (h: any[], m: string) => getAiProvider().chatWithSommelier(h, m);
export const analyzeCellarForWineFair = (i: any[]) => getAiProvider().analyzeCellarForWineFair(i);
export const optimizeCellarStorage = (b: any[], s: any[]) => getAiProvider().optimizeCellarStorage(b, s);