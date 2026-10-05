import { GoogleGenAI, Schema, Type } from "@google/genai";
import { Wine, Spirit, CocktailRecipe } from '../types';
import { getAIConfig } from './storageService';

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
        appellation: { type: Type.STRING, description: "Appellation officielle (ex: 'Chablis Premier Cru', 'Saint-Émilion Grand Cru')." },
        country: { type: Type.STRING },
        producer: { type: Type.STRING },
        name: { type: Type.STRING }, 
        cuvee: { type: Type.STRING, description: "Nom spécifique de la cuvée (ex: 'Orgasme', 'Réserve'). Vide si générique." },
        parcel: { type: Type.STRING, description: "Lieu-dit, Climat ou Parcelle spécifique (ex: 'Monts de Milieu')." },
        vintage: { type: Type.INTEGER },
        confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"], description: "Niveau de certitude." },
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
}

// --- GEMINI ADAPTER (SDK) ---
class GeminiAdapter implements AIAdapter {
    private client: GoogleGenAI;

    constructor(apiKey: string) {
        this.client = new GoogleGenAI({ apiKey });
    }

    private async generateJSON(prompt: string | any[], schema: Schema, throwOnError = false, temperature = 0.3): Promise<any> {
        try {
            const response = await this.client.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt as any,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature
                }
            });
            return response.text ? JSON.parse(response.text) : null;
        } catch (e: any) {
            console.error("Gemini Error:", e?.message || e);
            if (throwOnError) throw e;
            return null;
        }
    }

    async enrichWine(name: string, vintage: number, hint?: string, imageBase64?: string) {
        let contents: any;
        const isImageScan = !!imageBase64;

        const antiHallucination = `RÈGLES STRICTES :
- Si tu n'es PAS certain d'une information, mets null plutôt que d'inventer.
- Le champ "confidence" doit refléter ta certitude globale : HIGH = vin connu et vérifié, MEDIUM = probable mais non confirmé, LOW = hypothèse basée sur peu d'indices.
- Ne complète JAMAIS les cépages ou l'appellation si tu n'as pas de source fiable.
- Mieux vaut un JSON incomplet qu'un JSON avec des données inventées.`;

        if (imageBase64) {
            contents = [
                {
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
                        { text: `Tu es expert en vin et OCR. Analyse cette étiquette ou fiche technique.
1. Transcris d'abord le texte visible sur l'image.
2. Extrais ensuite les détails : Domaine, Appellation, Millésime, Cuvée, Parcelle/Climat.
3. Remplis le JSON EN FRANÇAIS.

${antiHallucination}` }
                    ]
                }
            ];
        } else {
            contents = `Tu es expert en vin. Analyse ce vin : "${name}" (${vintage}) ${hint || ''}.
Cherche spécifiquement s'il y a une Cuvée ou un Lieu-dit associé.
Retourne un JSON complet EN FRANÇAIS.

${antiHallucination}`;
        }

        const res = await this.generateJSON(contents, wineSchemaStructure as Schema, isImageScan);
        if(res) return { ...res, enrichedByAi: true, format: '750ml', personalNotes: [], aiConfidence: res.confidence || 'MEDIUM' };
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

        const prompt = `Tu es expert en spiritueux. Analyse : "${name}" ${hint || ''}.
Retourne un JSON complet EN FRANÇAIS avec catégorie, distillerie, région, pays, ABV, description, notes de dégustation, profil aromatique, cocktails suggérés et accords culinaires.
Si tu n'es pas certain d'une information (ABV, type de fût, etc.), mets null plutôt que d'inventer.`;
        const res = await this.generateJSON(prompt, schema);
        if(res) return { ...res, enrichedByAi: true, addedAt: new Date().toISOString() };
        return null;
    }

    async createCustomCocktail(ingredients: string[], query: string) {
        const prompt = `Tu es mixologue expert. Crée une recette de cocktail originale.

INGRÉDIENTS DISPONIBLES : ${ingredients.join(', ')}
DEMANDE DU CLIENT : "${query}"

CONSIGNES :
- Utilise UNIQUEMENT les ingrédients listés (+ glace, sucre, eau gazeuse autorisés).
- La description doit faire 1-2 phrases max.
- Les instructions doivent être des étapes numérotées claires et concises.
- Le nom du cocktail doit être créatif et évocateur.`;
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
        const res = await this.generateJSON(prompt, schema, false, 0.7);
        if(res) return { ...res, category: 'MODERN', prepTime: 5, source: 'AI', isFavorite: false, tags: ['AI'] };
        return null;
    }

}

// --- REST ADAPTER (OpenAI / Mistral) ---
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
        const system = `Tu es expert en vin. Retourne un JSON avec la structure suivante : ${JSON.stringify(wineSchemaStructure)}.
RÈGLES : Si tu n'es pas certain d'une info, mets null. Le champ "confidence" (HIGH/MEDIUM/LOW) doit refléter ta certitude réelle. Ne complète JAMAIS cépages ou appellation sans source fiable.`;
        let userContent: any = `Analyse ce vin : "${name}" (${vintage}) ${hint||''}. Cherche cuvée et lieu-dit. En Français.`;

        if (imageBase64 && this.provider === 'OPENAI') {
            userContent = [
                { type: "text", text: "Analyse cette étiquette de vin. Transcris le texte visible puis extrais les données. Mets null si une info n'est pas lisible." },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            ];
        }

        const res = await this.call([{ role: "system", content: system }, { role: "user", content: userContent }]);
        if(res) return { ...res, enrichedByAi: true, format: '750ml', personalNotes: [], aiConfidence: res.confidence || 'MEDIUM' };
        return null;
    }

    async enrichSpirit(name: string, hint?: string) {
        const system = "Tu es expert en spiritueux. Retourne JSON complet en français : {category, distillery, region, country, abv, format, description, producerHistory, tastingNotes, aromaProfile, suggestedCocktails, culinaryPairings}. Si tu n'es pas certain d'une info, mets null.";
        const user = `Analyse ce spiritueux : "${name}" ${hint||''}. En Français.`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        if(res) return { ...res, enrichedByAi: true, addedAt: new Date().toISOString() };
        return null;
    }

    async createCustomCocktail(ingredients: string[], query: string) {
        const system = "Tu es mixologue expert. Crée une recette de cocktail originale en JSON. Utilise UNIQUEMENT les ingrédients fournis (+ glace, sucre, eau gazeuse autorisés). Nom créatif, description en 1-2 phrases, instructions claires.";
        const user = `Ingrédients disponibles : ${ingredients.join(', ')}. Demande : "${query}"`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        if(res) return { ...res, category: 'MODERN', prepTime: 5, source: 'AI', isFavorite: false, tags: ['AI'] };
        return null;
    }

}

// --- FACTORY ---
const getAiProvider = (): AIAdapter => {
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

// --- EXPORTED FUNCTIONS ---
export const enrichWineData = (n: string, v: number, h?: string, img?: string) => getAiProvider().enrichWine(n, v, h, img);
export const enrichSpiritData = (n: string, h?: string) => getAiProvider().enrichSpirit(n, h);
export const createCustomCocktail = (i: string[], q: string) => getAiProvider().createCustomCocktail(i, q);
