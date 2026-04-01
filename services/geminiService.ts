import { GoogleGenAI, Schema, Type } from "@google/genai";
import { Wine, Spirit, CocktailRecipe, SommelierRecommendation, EveningPlan, CellarGapAnalysis, AIConfig, OutOfCellarSuggestion, CellarWine } from '../types';
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
    generateEducationalContent(itemName: string): Promise<string>;
    getSommelierRecommendations(inventory: Wine[], context: any): Promise<{recommendations: SommelierRecommendation[], outOfCellarSuggestion?: OutOfCellarSuggestion}>;
    getPairingAdvice(query: string, mode: string, inventory: Wine[]): Promise<string>;
    planEvening(context: any, wines: Wine[], spirits: Spirit[]): Promise<EveningPlan | null>;
    chatWithSommelier(history: any[], message: string): Promise<string>;
    analyzeCellarForWineFair(inventory: Wine[]): Promise<CellarGapAnalysis | null>;
    optimizeCellarStorage(boxWines: any[], shelfWines: any[]): Promise<{bottleId: string, reason: string}[]>;
    generateTastingQuestionnaire(wine: CellarWine): Promise<any>;
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

        const prompt = `Tu es expert en spiritueux. Analyse : "${name}" ${hint || ''}.
Retourne un JSON complet EN FRANÇAIS avec catégorie, distillerie, région, pays, ABV, description, notes de dégustation, profil aromatique, cocktails suggérés et accords culinaires.
Si tu n'es pas certain d'une information (ABV, type de fût, etc.), mets null plutôt que d'inventer.`;
        const res = await this.generateJSON(prompt, schema);
        if(res) return { ...res, enrichedByAI: true, addedAt: new Date().toISOString() };
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

    async generateEducationalContent(itemName: string): Promise<string> {
        const r = await this.client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Tu es œnologue passionné. Raconte UNE anecdote surprenante sur "${itemName}" en français.
Contraintes : 2-4 phrases maximum. Ton conversationnel et engageant. Inclus un fait peu connu si possible.`,
            config: { temperature: 0.7 }
        });
        return r.text || "";
    }

    async getSommelierRecommendations(inventory: Wine[], context: any) {
        if(inventory.length===0) return {recommendations: []};
        
        // ✅ AWAIT car getRacks est async maintenant
        const racks = await getRacks();
        
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
            
            return `ID:${w.id} ${w.name} ${w.cuvee||''} ${w.parcel||''} (${w.vintage}) - Type:${w.type} Region:${w.region} Favorite:${(w as any).isFavorite ? 'OUI' : 'NON'} Emplacements:[${bottleLocations.join(', ')}]`;
        }).join('\n');
        
        const currentYear = new Date().getFullYear();
        const prompt = `Tu es sommelier expert français. Année actuelle : ${currentYear}.

CONTEXTE DU REPAS :
- Plat/occasion : ${context.meal || 'Non spécifié'}
- Ambiance souhaitée : ${context.mood || 'Aucune préférence'}

CAVE DISPONIBLE :
${invStr}

MISSION (par ordre de priorité) :
1. SÉLECTION : Choisis les 3 meilleurs vins pour ce contexte. Privilégie les favoris (Favorite:OUI) à qualité égale.
2. APOGÉE : Pour chaque vin, évalue son stade de maturité en ${currentYear} :
   - DRINK_NOW = à son apogée, ouvrir maintenant
   - DRINK_SOON = encore 1-2 ans de potentiel mais déjà excellent
   - KEEP_2_3_YEARS = trop jeune, attendre
   - PAST_PEAK = en déclin, à boire vite si gardé
3. SERVICE : Température précise (ex: "16-17°C") et décantage (true/false avec durée si oui).
4. HORS CAVE (optionnel) : Si aucun vin ne convient parfaitement, suggère 1 appellation externe.

EXEMPLE DE RAISONNEMENT :
"Ce Châteauneuf-du-Pape 2019 est idéal : le grenache mûr s'accorde avec l'agneau, et le millésime 2019 atteint son plateau en ${currentYear}. Servir à 17°C après 1h de carafe."`;


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
        const modeLabel = mode === 'FOOD_TO_WINE' ? 'On part du plat pour trouver le vin' : 'On part du vin pour trouver le plat';
        const prompt = `Tu es sommelier français. ${modeLabel}.

${mode === 'FOOD_TO_WINE' ? 'PLAT' : 'VIN'} : "${query}"
CAVE DISPONIBLE : ${inventory.map(w => `${w.name} (${w.vintage})`).join(', ')}

Réponds en markdown court (5-8 lignes max). Propose 2-3 accords de ta cave en expliquant pourquoi. Si aucun vin ne convient, suggère une alternative hors cave.`;
        const r = await this.client.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { temperature: 0.5 } });
        return r.text || "";
    }

    async planEvening(context: any, wines: Wine[], spirits: Spirit[]) {
        const prompt = `Tu es sommelier et organisateur de soirées. Planifie une soirée complète.

CONTEXTE : ${JSON.stringify(context)}
VINS DISPONIBLES : ${wines.map(w => `${w.name} (${w.vintage}) - ${w.type}`).join(', ')}
SPIRITUEUX DISPONIBLES : ${spirits.map(s => `${s.name} - ${s.category}`).join(', ')}

Propose un thème original, un apéritif avec amuse-bouche, un plat principal avec accord vin, et un digestif. Utilise UNIQUEMENT les bouteilles de la cave.`;
        const schema = {
            type: Type.OBJECT,
            properties: {
                theme: { type: Type.STRING },
                aperitif: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, name: { type: Type.STRING }, description: { type: Type.STRING }, pairingSnack: { type: Type.STRING } } },
                mainCourse: { type: Type.OBJECT, properties: { dishName: { type: Type.STRING }, wineName: { type: Type.STRING }, pairingReason: { type: Type.STRING } } },
                digestif: { type: Type.OBJECT, properties: { spiritName: { type: Type.STRING }, description: { type: Type.STRING } } }
            }
        } as Schema;
        return this.generateJSON(prompt, schema, false, 0.6);
    }

    async chatWithSommelier(history: any[], message: string) {
        const systemContext = `Tu es un sommelier français passionné et cultivé. Tu tutoies l'utilisateur.
Ton style : chaleureux, précis, avec des anecdotes quand c'est pertinent.
Réponds en 3-6 phrases sauf si la question demande plus de détail.
Si tu ne connais pas un vin spécifique, dis-le honnêtement.`;
        const conversationHistory = history.length > 0 ? `\nConversation précédente :\n${history.map(h => `${h.role === 'user' ? 'Utilisateur' : 'Sommelier'}: ${h.content}`).join('\n')}` : '';
        const prompt = `${systemContext}${conversationHistory}\n\nQuestion de l'utilisateur : ${message}`;
        const r = await this.client.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { temperature: 0.6 } });
        return r.text || "";
    }

    async analyzeCellarForWineFair(inventory: Wine[]) {
        const regionCounts: Record<string, number> = {};
        const typeCounts: Record<string, number> = {};
        inventory.forEach(w => {
            regionCounts[w.region] = (regionCounts[w.region] || 0) + 1;
            typeCounts[w.type] = (typeCounts[w.type] || 0) + 1;
        });
        const prompt = `Tu es expert en achat de vin pour constituer une cave équilibrée.

PROFIL DE LA CAVE (${inventory.length} bouteilles) :
- Par couleur : ${Object.entries(typeCounts).map(([t,c]) => `${t}: ${c}`).join(', ')}
- Par région : ${Object.entries(regionCounts).sort((a,b) => b[1]-a[1]).map(([r,c]) => `${r}: ${c}`).join(', ')}
- Millésimes : ${[...new Set(inventory.map(w => w.vintage))].sort().join(', ')}

MISSION :
1. Analyse générale de l'équilibre (2-3 phrases).
2. Identifie les lacunes (régions absentes, couleurs sous-représentées, trous de millésimes).
3. Propose 3-5 achats prioritaires avec budget indicatif et cible précise (domaine ou appellation).

Classe les suggestions par priorité : HAUTE, MOYENNE, BASSE.`;
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
        const prompt = `Tu es caviste professionnel. Optimise le rangement de cette cave.

VINS EN CARTON (à ranger en priorité) : ${JSON.stringify(boxWines.map(w => ({id: w.id, name: w.name, vintage: w.vintage, type: w.type})))}
VINS DÉJÀ EN ÉTAGÈRE : ${JSON.stringify(shelfWines.map(w => ({id: w.id, name: w.name, vintage: w.vintage, type: w.type})))}

Suggère quels vins déplacer du carton vers l'étagère en priorité. Critères :
- Vins proches de leur apogée en premier
- Vins de garde longue peuvent rester en carton
- Raison courte (1 phrase) pour chaque suggestion`;
        const schema = {
            type: Type.ARRAY,
            items: { type: Type.OBJECT, properties: { bottleId: { type: Type.STRING }, reason: { type: Type.STRING } }, required: ["bottleId"] }
        } as Schema;
        return this.generateJSON(prompt, schema) || [];
    }

    async generateTastingQuestionnaire(wine: CellarWine) {
        const currentYear = new Date().getFullYear();
        const ageYears = currentYear - wine.vintage;
        const prompt = `Tu es sommelier expert. Génère des valeurs par défaut pour un questionnaire de dégustation.

VIN : ${wine.name} ${wine.cuvee || ''} (${wine.vintage}, ${ageYears} ans d'âge)
PRODUCTEUR : ${(wine as any).producer || 'Inconnu'}
TYPE : ${wine.type} | RÉGION : ${wine.region}
${(wine as any).aromaProfile?.length ? `ARÔMES CONNUS : ${(wine as any).aromaProfile.join(', ')}` : ''}

CONSIGNES :
- Adapte les valeurs (0-100) au profil EXACT de ce vin, pas des valeurs génériques.
- visualIntensity : selon la couleur et l'âge (un rouge vieux → moins intense, un blanc jeune → pâle).
- bodyDefault, acidityDefault, tanninDefault : selon région, cépage probable et millésime.
- tastingTips : 1 conseil court et pratique (ex: "Carafer 30min, servir à 16°C").
- pairingSuggestions : 5 plats PRÉCIS (pas "viande rouge" mais "côte de bœuf grillée aux herbes").`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                visualIntensity: { type: Type.INTEGER },
                visualDescription: { type: Type.STRING },
                bodyDefault: { type: Type.INTEGER },
                acidityDefault: { type: Type.INTEGER },
                tanninDefault: { type: Type.INTEGER },
                tastingTips: { type: Type.STRING },
                pairingSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["visualIntensity", "visualDescription", "bodyDefault", "acidityDefault", "tastingTips", "pairingSuggestions"]
        } as Schema;

        return this.generateJSON(prompt, schema);
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
        if(res) return { ...res, enrichedByAI: true, format: '750ml', personalNotes: [], aiConfidence: res.confidence || 'MEDIUM' };
        return null;
    }

    async enrichSpirit(name: string, hint?: string) {
        const system = "Tu es expert en spiritueux. Retourne JSON complet en français : {category, distillery, region, country, abv, format, description, producerHistory, tastingNotes, aromaProfile, suggestedCocktails, culinaryPairings}. Si tu n'es pas certain d'une info, mets null.";
        const user = `Analyse ce spiritueux : "${name}" ${hint||''}. En Français.`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        if(res) return { ...res, enrichedByAI: true, addedAt: new Date().toISOString() };
        return null;
    }

    async createCustomCocktail(ingredients: string[], query: string) {
        const system = "Tu es mixologue expert. Crée une recette de cocktail originale en JSON. Utilise UNIQUEMENT les ingrédients fournis (+ glace, sucre, eau gazeuse autorisés). Nom créatif, description en 1-2 phrases, instructions claires.";
        const user = `Ingrédients disponibles : ${ingredients.join(', ')}. Demande : "${query}"`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        if(res) return { ...res, category: 'MODERN', prepTime: 5, source: 'AI', isFavorite: false, tags: ['AI'] };
        return null;
    }

    async generateEducationalContent(itemName: string) {
        return this.call([{ role: "system", content: "Tu es œnologue passionné. Raconte UNE anecdote surprenante en 2-4 phrases. Ton conversationnel. Inclus un fait peu connu si possible." }, { role: "user", content: `Anecdote sur "${itemName}"` }], false);
    }

    async getSommelierRecommendations(inventory: Wine[], context: any) {
        const currentYear = new Date().getFullYear();
        const racks = await getRacks();
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

            return `ID:${w.id} ${w.name} ${w.cuvee||''} ${w.parcel||''} (${w.vintage}) Favorite:${(w as any).isFavorite ? 'OUI' : 'NON'} Emplacements:[${bottleLocations.join(', ')}]`;
        }).join('\n');

        const system = `Tu es sommelier expert français. Année : ${currentYear}. Sélectionne 3 vins avec score, raisonnement, température de service, décantage, accord mets, statut apogée (DRINK_NOW/KEEP_2_3_YEARS/DRINK_SOON/PAST_PEAK), et emplacements. Privilégie les favoris à qualité égale. JSON only.`;
        const user = `Repas: ${context.meal || 'Non spécifié'}, Ambiance: ${context.mood || 'Aucune'}.\nCave:\n${invStr}`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);

        if (res && res.recommendations && Array.isArray(res.recommendations)) return res;
        return {recommendations: []};
    }

    async getPairingAdvice(query: string, mode: string, inventory: Wine[]) {
        const modeLabel = mode === 'FOOD_TO_WINE' ? 'Du plat au vin' : 'Du vin au plat';
        const system = `Tu es sommelier français. Mode : ${modeLabel}. Réponds en markdown court (5-8 lignes max). Propose 2-3 accords avec explication.`;
        const user = `${mode === 'FOOD_TO_WINE' ? 'Plat' : 'Vin'}: "${query}". Cave: ${inventory.map(w=>`${w.name} (${w.vintage})`).join(', ')}`;
        return this.call([{ role: "system", content: system }, { role: "user", content: user }], false);
    }

    async planEvening(context: any, wines: Wine[], spirits: Spirit[]) {
        const system = "Tu es sommelier et organisateur de soirées. Propose un thème original, un apéritif avec amuse-bouche, un plat principal avec accord vin, et un digestif. Utilise UNIQUEMENT les bouteilles fournies. JSON.";
        const user = `Contexte: ${JSON.stringify(context)}. Vins: ${wines.map(w=>`${w.name} (${w.vintage}) ${w.type}`).join(', ')}. Spiritueux: ${spirits.map(s=>`${s.name} ${s.category}`).join(', ')}`;
        return this.call([{ role: "system", content: system }, { role: "user", content: user }]);
    }

    async chatWithSommelier(history: any[], message: string) {
        const system = `Tu es un sommelier français passionné et cultivé. Tu tutoies l'utilisateur. Style chaleureux et précis, avec des anecdotes quand c'est pertinent. Réponds en 3-6 phrases sauf si la question demande plus. Si tu ne connais pas un vin, dis-le honnêtement.`;
        const messages = [{ role: "system", content: system }, ...history, { role: "user", content: message }];
        return this.call(messages, false);
    }

    async analyzeCellarForWineFair(inventory: Wine[]) {
        const regionCounts: Record<string, number> = {};
        const typeCounts: Record<string, number> = {};
        inventory.forEach(w => {
            regionCounts[w.region] = (regionCounts[w.region] || 0) + 1;
            typeCounts[w.type] = (typeCounts[w.type] || 0) + 1;
        });
        const system = "Tu es expert en achat de vin pour constituer une cave équilibrée. Analyse la cave, identifie les lacunes, et propose 3-5 achats prioritaires (HAUTE/MOYENNE/BASSE) avec budget et cible. JSON.";
        const user = `Cave (${inventory.length} bouteilles). Couleurs: ${Object.entries(typeCounts).map(([t,c])=>`${t}:${c}`).join(', ')}. Régions: ${Object.entries(regionCounts).sort((a,b)=>b[1]-a[1]).map(([r,c])=>`${r}:${c}`).join(', ')}. Millésimes: ${[...new Set(inventory.map(w=>w.vintage))].sort().join(', ')}`;
        return this.call([{ role: "system", content: system }, { role: "user", content: user }]);
    }

    async optimizeCellarStorage(boxWines: any[], shelfWines: any[]) {
        const system = "Tu es caviste professionnel. Suggère quels vins déplacer du carton vers l'étagère. Priorité aux vins proches de l'apogée. Raison courte (1 phrase). JSON Array [{bottleId, reason}].";
        const user = `Carton: ${JSON.stringify(boxWines.map(w=>({id:w.id,name:w.name,vintage:w.vintage,type:w.type})))}. Étagère: ${JSON.stringify(shelfWines.map(w=>({id:w.id,name:w.name,vintage:w.vintage,type:w.type})))}`;
        const res = await this.call([{ role: "system", content: system }, { role: "user", content: user }]);
        if (Array.isArray(res)) return res;
        return [];
    }

    async generateTastingQuestionnaire(wine: CellarWine) {
        const currentYear = new Date().getFullYear();
        const ageYears = currentYear - wine.vintage;
        const system = "Tu es sommelier expert. Génère des valeurs par défaut personnalisées pour un questionnaire de dégustation. Adapte au profil EXACT du vin (pas de valeurs génériques). Les pairingSuggestions doivent être des plats PRÉCIS. JSON.";
        const user = `VIN: ${wine.name} ${wine.cuvee||''} (${wine.vintage}, ${ageYears} ans) - ${wine.type} - ${wine.region}. ${(wine as any).aromaProfile?.length ? `Arômes: ${(wine as any).aromaProfile.join(', ')}` : ''}. Champs: visualIntensity (0-100), visualDescription, bodyDefault (0-100), acidityDefault (0-100), tanninDefault (0-100), tastingTips (1 conseil court), pairingSuggestions (5 plats précis).`;
        return this.call([{ role: "system", content: system }, { role: "user", content: user }]);
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

// --- EXPORTED FUNCTIONS ---
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
// ✅ Nouvel export
export const generateTastingQuestionnaire = (w: CellarWine) => getAiProvider().generateTastingQuestionnaire(w);