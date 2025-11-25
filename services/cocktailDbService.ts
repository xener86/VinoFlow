import { CocktailRecipe, CocktailIngredient } from '../types';

const API_KEY = '1'; 
const API_VERSION = API_KEY === '1' ? 'v1' : 'v2';
const BASE_URL = `https://www.thecocktaildb.com/api/json/${API_VERSION}/${API_KEY}`;

interface ApiDrink {
  idDrink: string;
  strDrink: string;
  strCategory: string;
  strAlcoholic: string;
  strGlass: string;
  strInstructions: string;
  strDrinkThumb: string;
  [key: string]: string | null;
}

const mapApiToCocktail = (drink: ApiDrink): CocktailRecipe => {
  const ingredients: CocktailIngredient[] = [];

  for (let i = 1; i <= 15; i++) {
    const ingName = drink[`strIngredient${i}`];
    const measure = drink[`strMeasure${i}`];

    if (ingName) {
      let amount = 0;
      let unit: CocktailIngredient['unit'] = 'piece';

      if (measure) {
        const lowerMeasure = measure.toLowerCase();
        if (lowerMeasure.includes('oz')) unit = 'oz';
        else if (lowerMeasure.includes('cl')) unit = 'cl';
        else if (lowerMeasure.includes('ml')) unit = 'ml';
        else if (lowerMeasure.includes('dash')) unit = 'dash';
        else if (lowerMeasure.includes('tsp') || lowerMeasure.includes('tbsp')) unit = 'spoon';
        
        const num = parseFloat(measure);
        if (!isNaN(num)) amount = num;
      }

      ingredients.push({ name: ingName, amount, unit, optional: false });
    }
  }

  const baseSpirit = ingredients.find(i => 
    ['Gin', 'Vodka', 'Rum', 'Whisk', 'Bourbon', 'Tequila', 'Brandy', 'Cognac', 'Champagne']
      .some(s => i.name.includes(s))
  )?.name || 'Other';

  return {
    id: `api-${drink.idDrink}`,
    name: drink.strDrink,
    category: drink.strAlcoholic === 'Non alcoholic' ? 'NON_ALCOHOLIC' : 'CLASSIC',
    baseSpirit,
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
    const response = await fetch(`${BASE_URL}/search.php?s=${encodeURIComponent(query)}`);
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
    const response = await fetch(`${BASE_URL}/filter.php?i=${encodeURIComponent(ingredient)}`);
    const data = await response.json();
    if (!data.drinks) return [];
    
    const detailsPromises = data.drinks.slice(0, 5).map(async (d: { idDrink: string }) => {
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
