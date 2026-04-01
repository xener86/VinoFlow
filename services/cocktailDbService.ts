
import { CocktailRecipe, CocktailIngredient } from '../types';

// --- CONFIGURATION API ---
// Remplacez '1' par votre clé API Premium ici
const API_KEY = '1'; 

// L'API Premium utilise souvent le endpoint v2. 
// Si votre clé est '1' (gratuit), on reste sur v1, sinon on passe en v2.
const API_VERSION = API_KEY === '1' ? 'v1' : 'v2';
const BASE_URL = `https://www.thecocktaildb.com/api/json/${API_VERSION}/${API_KEY}`;

// Internal type for API response
interface ApiDrink {
  idDrink: string;
  strDrink: string;
  strCategory: string;
  strAlcoholic: string;
  strGlass: string;
  strInstructions: string;
  strDrinkThumb: string;
  [key: string]: string | null; // For strIngredient1, strMeasure1, etc.
}

// Mapper: API -> App Model
const mapApiToCocktail = (drink: ApiDrink): CocktailRecipe => {
  const ingredients: CocktailIngredient[] = [];

  for (let i = 1; i <= 15; i++) {
    const ingName = drink[`strIngredient${i}`];
    const measure = drink[`strMeasure${i}`];

    if (ingName) {
      let amount = 0;
      let unit: any = 'piece';

      if (measure) {
         // Parsing basique des unités
         const lowerMeasure = measure.toLowerCase();
         if (lowerMeasure.includes('oz')) unit = 'oz';
         else if (lowerMeasure.includes('cl')) unit = 'cl';
         else if (lowerMeasure.includes('ml')) unit = 'ml';
         else if (lowerMeasure.includes('dash')) unit = 'dash';
         else if (lowerMeasure.includes('tsp')) unit = 'spoon';
         else if (lowerMeasure.includes('tbsp')) unit = 'spoon';
         
         const num = parseFloat(measure);
         if (!isNaN(num)) amount = num;
      }

      ingredients.push({
        name: ingName,
        amount: amount,
        unit: unit,
        optional: false
      });
    }
  }

  // Détection basique du spiritueux principal
  const baseSpirit = ingredients.find(i => 
    ['Gin', 'Vodka', 'Rum', 'Whisk', 'Bourbon', 'Tequila', 'Brandy', 'Cognac', 'Champagne'].some(s => i.name.includes(s))
  )?.name || 'Other';

  return {
    id: `api-${drink.idDrink}`,
    name: drink.strDrink,
    category: drink.strAlcoholic === 'Non alcoholic' ? 'NON_ALCOHOLIC' : 'CLASSIC',
    baseSpirit: baseSpirit,
    ingredients,
    instructions: drink.strInstructions?.split('.').filter(i => i.length > 2) || [],
    glassType: drink.strGlass || 'Tumbler',
    difficulty: ingredients.length > 4 ? 'Medium' : 'Easy',
    prepTime: 5,
    imageUrl: drink.strDrinkThumb,
    source: 'API',
    tags: [drink.strCategory],
    isFavorite: false
  };
};

export const searchCocktailsByName = async (query: string): Promise<CocktailRecipe[]> => {
  try {
    const response = await fetch(`${BASE_URL}/search.php?s=${query}`);
    const data = await response.json();
    if (!data.drinks) return [];
    return data.drinks.map(mapApiToCocktail);
  } catch (error) {
    console.error("CocktailDB Search Error", error);
    return [];
  }
};

export const searchCocktailsByIngredient = async (ingredient: string): Promise<CocktailRecipe[]> => {
  try {
    // Note : L'endpoint filter retourne des données partielles (pas d'instructions).
    // Avec une clé Premium, on peut parfois utiliser /popular.php ou d'autres filtres.
    const response = await fetch(`${BASE_URL}/filter.php?i=${ingredient}`);
    const data = await response.json();
    if (!data.drinks) return [];
    
    // Pour avoir les détails complets (recette), on doit faire un appel lookup pour chaque résultat.
    // On limite à 5 pour la performance, sauf si besoin de plus.
    const detailsPromises = data.drinks.slice(0, 5).map(async (d: any) => {
        const detailsRes = await fetch(`${BASE_URL}/lookup.php?i=${d.idDrink}`);
        const detailsData = await detailsRes.json();
        return mapApiToCocktail(detailsData.drinks[0]);
    });

    return Promise.all(detailsPromises);
  } catch (error) {
    console.error("CocktailDB Filter Error", error);
    return [];
  }
};