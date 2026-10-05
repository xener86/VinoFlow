import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateJson = vi.fn();
vi.mock('../../src/services/aiService.js', () => ({ generateJson: (...args) => generateJson(...args) }));

const { identifyWine, enrichSpirit, createCocktail } = await import('../../src/services/assistant.js');
const { WINE_IDENTIFY_SCHEMA, SPIRIT_SCHEMA, COCKTAIL_SCHEMA } = await import('../../src/sommelier/schemas.js');

beforeEach(() => generateJson.mockReset());

describe('assistant de saisie', () => {
  it('identifyWine : tâche identify-wine, schéma strict, confiance reportée', async () => {
    generateJson.mockResolvedValue({ name: 'Chablis', confidence: 'LOW' });
    const r = await identifyWine({ name: 'chablis fevre', vintage: 2020, hint: 'chablis fevre 2020 1er cru' });
    const [task, params] = generateJson.mock.calls[0];
    expect(task).toBe('identify-wine');
    expect(params.schema).toBe(WINE_IDENTIFY_SCHEMA);
    expect(params.user).toContain('"chablis fevre" (2020)');
    expect(params.user).toContain('1er cru');
    expect(r).toMatchObject({ name: 'Chablis', enrichedByAi: true, aiConfidence: 'LOW' });
  });

  it('identifyWine : sans millésime, pas de « (null) » dans le prompt', async () => {
    generateJson.mockResolvedValue({ confidence: 'MEDIUM' });
    await identifyWine({ name: 'Morgon', vintage: null, hint: 'Morgon' });
    expect(generateJson.mock.calls[0][1].user).toBe('Vin : "Morgon"');
  });

  it('enrichSpirit et createCocktail : tâches et schémas dédiés', async () => {
    generateJson.mockResolvedValue({ name: 'X' });
    await enrichSpirit({ name: 'Lagavulin 16' });
    expect(generateJson.mock.calls[0][0]).toBe('enrich-spirit');
    expect(generateJson.mock.calls[0][1].schema).toBe(SPIRIT_SCHEMA);

    const c = await createCocktail({ ingredients: ['Gin', '', 'Vermouth'], query: 'un classique' });
    expect(generateJson.mock.calls[1][0]).toBe('cocktail');
    expect(generateJson.mock.calls[1][1].schema).toBe(COCKTAIL_SCHEMA);
    expect(generateJson.mock.calls[1][1].user).toContain('Gin, Vermouth');
    expect(c).toMatchObject({ source: 'AI', category: 'MODERN', tags: ['AI'] });
  });

  it('schémas compatibles sorties structurées : objets fermés, tous champs requis', () => {
    const check = (s) => {
      if (s?.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
        Object.values(s.properties).forEach(check);
      }
      if (s?.anyOf) s.anyOf.forEach(check);
      if (s?.items) check(s.items);
    };
    [WINE_IDENTIFY_SCHEMA, SPIRIT_SCHEMA, COCKTAIL_SCHEMA].forEach(check);
  });
});
