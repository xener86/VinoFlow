import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

describe.skipIf(!hasDb)('API cocktails', () => {
  let client;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
  });
  afterAll(() => pool.end());

  // Recette telle que la produit cocktailDbService (id fourni par le front).
  const negroni = {
    id: 'api-11003',
    name: 'Negroni',
    category: 'CLASSIC',
    baseSpirit: 'Gin',
    ingredients: [
      { name: 'Gin', amount: 3, unit: 'cl', optional: false },
      { name: 'Campari', amount: 3, unit: 'cl', optional: false },
    ],
    instructions: ['Verser sur glace', 'Remuer'],
    glassType: 'Old-fashioned',
    difficulty: 'Easy',
    prepTime: 5,
    imageUrl: 'https://example.test/negroni.jpg',
    source: 'API',
    tags: ['Ordinary Drink', null],
    isFavorite: true,
  };

  it('authentification requise', async () => {
    expect((await api().get('/api/cocktails')).status).toBe(401);
  });

  it('CRUD avec id fourni par le front', async () => {
    const created = await client.post('/api/cocktails', negroni);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...negroni, tags: ['Ordinary Drink'] });

    const list = await client.get('/api/cocktails');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].ingredients).toEqual(negroni.ingredients);

    const updated = await client.put('/api/cocktails/api-11003', { isFavorite: false, prepTime: 3 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Negroni', isFavorite: false, prepTime: 3 });

    expect((await client.delete('/api/cocktails/api-11003')).status).toBe(200);
    expect((await client.get('/api/cocktails')).body).toEqual([]);
    expect((await client.delete('/api/cocktails/api-11003')).status).toBe(404);
    expect((await client.put('/api/cocktails/api-11003', { name: 'X' })).status).toBe(404);
  });

  it('POST avec un id existant : mise à jour, pas de doublon', async () => {
    await client.post('/api/cocktails', negroni);
    const again = await client.post('/api/cocktails', { ...negroni, name: 'Negroni sbagliato' });
    expect(again.status).toBe(200);
    const list = (await client.get('/api/cocktails')).body;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Negroni sbagliato');
  });

  it('sans id : identifiant généré', async () => {
    const res = await client.post('/api/cocktails', { name: 'Création IA', source: 'AI' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Création IA', ingredients: [], instructions: [], tags: [], isFavorite: false });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('validation : nom obligatoire, types vérifiés', async () => {
    expect((await client.post('/api/cocktails', { ...negroni, name: '' })).status).toBe(400);
    expect((await client.post('/api/cocktails', { ingredients: [] })).status).toBe(400);
    expect((await client.post('/api/cocktails', { ...negroni, ingredients: 'gin' })).status).toBe(400);
    expect((await client.post('/api/cocktails', { ...negroni, instructions: [1] })).status).toBe(400);
    expect((await client.post('/api/cocktails', { ...negroni, id: 42 })).status).toBe(400);
    await client.post('/api/cocktails', negroni);
    expect((await client.put('/api/cocktails/api-11003', {})).status).toBe(400);
    expect((await client.put('/api/cocktails/api-11003', { isFavorite: 'oui' })).status).toBe(400);
  });
});
