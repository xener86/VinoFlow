import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({ pool: { query: vi.fn().mockResolvedValue({ rows: [] }) }, withTransaction: vi.fn() }));

const { producerKey, cuveeKey, queryVariants } = await import('../../src/enrichment/normalize.js');
const { excerptMatches, strictExcerptMatches, verifySources, levelSupported, normalizeText } = await import('../../src/enrichment/verify.js');
const { resolveLevel, planChanges } = await import('../../src/enrichment/service.js');
const { rulePeak } = await import('../../src/enrichment/rules.js');
const { nextCheckDate, confidenceFor } = await import('../../src/enrichment/levels.js');
const { runClaudeCode } = await import('../../src/enrichment/engines.js');
const { buildUserPrompt } = await import('../../src/enrichment/prompt.js');

const NOW = new Date('2026-10-05T12:00:00Z');

describe('normalisation des noms', () => {
  it('rapproche les variantes de producteur (Dom., Château, accents, pluriel)', () => {
    expect(producerKey('Château Eugénie')).toBe(producerKey('Ch. Eugenie'));
    expect(producerKey('Domaine Dutertre')).toBe('dutertre');
    expect(producerKey('Domaines des Forges')).toBe(producerKey('Domaine des Forges'));
  });

  it('rapproche les variantes de cuvée (articles, accents, pluriel)', () => {
    expect(cuveeKey('Les Aieuls')).toBe(cuveeKey("l'Aïeul"));
    expect(cuveeKey('Cuvée Jérémy')).toBe(cuveeKey('Jeremy'));
  });

  it('variantes de requêtes : abréviations développées, sans accents, sans millésime', () => {
    const q = queryVariants({ producer: 'Ch. Eugénie', cuvee: 'Les Aïeuls', vintage: 2022, appellation: 'Cahors' });
    expect(q).toContain('Ch. Eugénie Les Aïeuls 2022');
    expect(q).toContain('Château Eugénie Les Aïeuls 2022');
    expect(q).toContain('Chateau Eugenie Les Aieuls 2022');
    expect(q).toContain('Château Eugénie Cahors');
  });
});

describe('vérification des sources', () => {
  const page = '<html><body><h1>Charmen 2023</h1><p>Subtilement dorée à l’œil, mêlant au nez le miel d&#39;acacia et le pain grillé, plus fruitée en bouche.</p><script>var x="miel";</script></body></html>';

  it('retrouve un extrait malgré accents, apostrophes et entités HTML', () => {
    const text = page.replace(/<[^>]+>/g, ' ');
    expect(excerptMatches("mêlant au nez le miel d'acacia et le pain grillé", text)).toBe(true);
    expect(excerptMatches('notes de cassis et de réglisse en finale', text)).toBe(false);
    expect(excerptMatches('miel', text)).toBe(false); // trop court pour prouver quoi que ce soit
    expect(normalizeText('Château « Eugénie »')).toBe('chateau eugenie');
    expect(normalizeText("l’œil, d'acacia")).toBe('l oeil d acacia');
  });

  it('statuts verified / not_found / unreachable', async () => {
    const fetchPage = vi.fn(async (url) => {
      if (url.includes('down')) throw new Error('HTTP 403');
      return page;
    });
    const checked = await verifySources([
      { url: 'https://www.hachette-vins.com/a', excerpt: "mêlant au nez le miel d'acacia et le pain grillé", level: 'EXACT' },
      { url: 'https://www.hachette-vins.com/a', excerpt: 'arômes de cassis et de réglisse très marqués', level: 'EXACT' },
      { url: 'https://down.example/b', excerpt: 'peu importe ce texte ici', level: 'PRODUCTEUR' },
      { url: 'pas une url', excerpt: 'x x x x', level: 'PRODUCTEUR' },
    ], { fetchPage });
    expect(checked.map((s) => s.check)).toEqual(['verified', 'not_found', 'unreachable', 'not_found']);
    expect(checked[0].domain).toBe('hachette-vins.com');
    expect(fetchPage).toHaveBeenCalledTimes(2); // une page téléchargée une seule fois
  });

  it('un niveau est acquis par une source vérifiée, ou deux domaines inaccessibles', () => {
    expect(levelSupported([{ level: 'EXACT', check: 'verified' }], 'EXACT')).toBe(true);
    expect(levelSupported([{ level: 'EXACT', check: 'not_found' }], 'EXACT')).toBe(false);
    expect(levelSupported([{ level: 'EXACT', check: 'unreachable', domain: 'a.fr' }], 'EXACT')).toBe(false);
    expect(levelSupported([
      { level: 'EXACT', check: 'unreachable', domain: 'a.fr' },
      { level: 'EXACT', check: 'unreachable', domain: 'b.fr' },
    ], 'EXACT')).toBe(true);
  });
});

describe('vérification stricte (passe « cote »)', () => {
  const page = 'Domaine X 2019, notre prix 145,00 € TTC la bouteille, livraison offerte dès 6 bouteilles.';
  it('citation exacte et bornée aux mots', () => {
    expect(strictExcerptMatches('notre prix 145,00 € TTC la bouteille', page)).toBe(true);
  });
  it('refuse un montant tronqué (45 au lieu de 145) que la recherche floue accepterait', () => {
    expect(excerptMatches('45,00 € TTC la bouteille, livraison offerte', page)).toBe(true);
    expect(strictExcerptMatches('45,00 € TTC la bouteille, livraison offerte', page)).toBe(false);
  });
  it('refuse une longue citation au montant modifié', () => {
    const long = `${'mot '.repeat(40)}prix 39,00 € la bouteille ${'suite '.repeat(20)}`;
    const altered = long.replace('39,00', '59,00');
    expect(excerptMatches(altered, long)).toBe(true);
    expect(strictExcerptMatches(altered, long)).toBe(false);
  });
  it('verifySources en mode strict', async () => {
    const fetchPage = async () => `<p>${page}</p>`;
    const [r] = await verifySources([{ url: 'https://x.example/a', excerpt: '45,00 € TTC la bouteille, livraison offerte' }], { fetchPage, strict: true });
    expect(r.check).toBe('not_found');
  });
});

describe('niveau retenu', () => {
  it('rétrograde un niveau annoncé sans source vérifiée', () => {
    const sources = [
      { level: 'EXACT', check: 'not_found' },
      { level: 'AUTRE_MILLESIME', check: 'not_found' },
      { level: 'PRODUCTEUR', check: 'verified' },
    ];
    expect(resolveLevel('EXACT', sources)).toBe('PRODUCTEUR');
    expect(resolveLevel('EXACT', [])).toBe('APPELLATION'); // l'appellation n'exige pas de source
    expect(resolveLevel('APPELLATION', [])).toBe('APPELLATION');
    expect(resolveLevel('REGLES', [])).toBe('REGLES');
  });

  it('confiance et prochaine vérification découlent du niveau', () => {
    expect(confidenceFor('EXACT')).toBe('HIGH');
    expect(confidenceFor('APPELLATION')).toBe('LOW');
    expect(nextCheckDate('EXACT', NOW).toISOString().slice(0, 7)).toBe('2027-10');
    expect(nextCheckDate('PRODUCTEUR', NOW).toISOString().slice(0, 7)).toBe('2027-01');
    expect(nextCheckDate('REGLES', NOW).toISOString().slice(0, 7)).toBe('2026-11');
  });
});

describe('règles déterministes', () => {
  it('formule par couleur, liquoreux/mutés en garde longue, sans millésime', () => {
    expect(rulePeak({ vintage: 2018, type: 'RED' }, NOW)).toMatchObject({ peakStart: 2023, peakEnd: 2028 });
    expect(rulePeak({ vintage: 2017, type: 'DESSERT' }, NOW)).toMatchObject({ peakStart: 2022, peakEnd: 2042 });
    expect(rulePeak({ vintage: 0, type: 'SPARKLING' }, NOW)).toMatchObject({ peakStart: 2026, peakEnd: 2029 });
    expect(rulePeak({ vintage: null, type: 'RED' }, NOW)).toMatchObject({ peakStart: 2026, peakEnd: 2028 });
  });
});

describe('planChanges', () => {
  const wine = {
    type: 'RED', cuvee: 'Cadavre Exquis #4', vintage: 0, grapeVarieties: [], aromaSource: null,
    peakSource: null, sensoryProfile: null,
  };
  const data = {
    basis: 'EXACT',
    corrections: [
      { field: 'type', value: 'white', source_index: 0 },
      { field: 'appellation', value: 'Alsace', source_index: 1 },
    ],
    profile: {
      grape_varieties: ['Pinot Blanc', 'Auxerrois'],
      aromas: ['pêche rôtie', 'citron vert séché', 'pierre à fusil'],
      families: ['fruity'],
      sensory: { body: 60, acidity: 70, tannin: 5, sweetness: 5, alcohol: 55 },
      peak_start_year: 2026, peak_end_year: 2030, peak_reasoning: 'Oxydatif, stable.',
    },
  };
  const sources = [{ check: 'verified', level: 'EXACT' }, { check: 'not_found', level: 'EXACT' }];

  it('EXACT : profil, apogée et corrections appuyées par une source vérifiée', () => {
    const { updates, changes } = planChanges(wine, data, 'EXACT', sources, { engine: 'claude-code', now: NOW });
    expect(updates).toMatchObject({
      type: 'WHITE',
      aromaProfile: data.profile.aromas, aromaSource: 'AI', aromaConfidence: 'HIGH', aromaProvider: 'claude-code',
      grapeVarieties: ['Pinot Blanc', 'Auxerrois'],
      peakStart: 2026, peakEnd: 2030, peakConfidence: 'HIGH',
      enrichedByAi: true,
    });
    expect(updates).not.toHaveProperty('appellation'); // source non vérifiée
    expect(changes.type).toEqual({ from: 'RED', to: 'WHITE' });
  });

  it('pas de correction en dessous d’EXACT ; confiance selon le niveau', () => {
    const { updates } = planChanges(wine, data, 'PRODUCTEUR', sources, { engine: 'api', now: NOW });
    expect(updates).not.toHaveProperty('type');
    expect(updates).toMatchObject({ aromaConfidence: 'MEDIUM', peakConfidence: 'MEDIUM' });
  });

  it('protège les saisies USER et les arômes de dégustation (TASTING)', () => {
    const { updates } = planChanges({ ...wine, aromaSource: 'USER', peakSource: 'USER' }, data, 'EXACT', sources, { now: NOW });
    expect(updates).not.toHaveProperty('aromaProfile');
    expect(updates).not.toHaveProperty('peakStart');
    expect(planChanges({ ...wine, aromaSource: 'TASTING' }, data, 'EXACT', sources, { now: NOW }).updates)
      .not.toHaveProperty('aromaProfile');
  });

  it('niveau RÈGLES : pas d’arômes, apogée déterministe en confiance faible', () => {
    const { updates } = planChanges({ ...wine, vintage: 2018, type: 'RED' }, { ...data, corrections: [] }, 'REGLES', [], { now: NOW });
    expect(updates).not.toHaveProperty('aromaProfile');
    expect(updates).toMatchObject({ peakStart: 2023, peakEnd: 2028, peakConfidence: 'LOW' });
  });
});

describe('moteur Claude Code', () => {
  it('appelle claude -p avec le schéma, les outils web et le modèle complet', async () => {
    const runner = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify({ is_error: false, structured_output: { basis: 'EXACT' }, total_cost_usd: 0.12, usage: { input_tokens: 10, output_tokens: 5 }, modelUsage: { 'claude-sonnet-5-5': { webSearchRequests: 4 } } }),
    }));
    const r = await runClaudeCode('prompt', { runner });
    expect(r).toMatchObject({ data: { basis: 'EXACT' }, engine: 'claude-code', model: 'claude-sonnet-5-5', usage: { webSearches: 4 } });
    const [args, input] = runner.mock.calls[0];
    expect(input).toBe('prompt');
    expect(args).toEqual(expect.arrayContaining(['-p', '--json-schema', '--no-session-persistence', '--strict-mcp-config']));
    expect(args[args.indexOf('--model') + 1]).toBe('claude-sonnet-5-5');
    expect(args[args.indexOf('--tools') + 1]).toBe('WebSearch,WebFetch');
  });

  it('schéma, prompt système et tâche paramétrables (passe « cote »)', async () => {
    const runner = vi.fn(async () => ({ code: 0, stdout: JSON.stringify({ is_error: false, structured_output: { status: 'NOT_FOUND' }, usage: {} }) }));
    const schema = { type: 'object', properties: { status: { type: 'string' } }, required: ['status'], additionalProperties: false };
    await runClaudeCode('p', { runner, schema, systemPrompt: 'Prompt cote', task: 'valuation' });
    const [args] = runner.mock.calls[0];
    expect(JSON.parse(args[args.indexOf('--json-schema') + 1])).toEqual(schema);
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('Prompt cote');
  });

  it('timeoutMs transmis au runner (discussion : budget court, pas celui de l’enrichissement)', async () => {
    const runner = vi.fn(async () => ({ code: 0, stdout: JSON.stringify({ is_error: false, structured_output: { ok: true }, usage: {} }) }));
    await runClaudeCode('p', { runner, timeoutMs: 45_000 });
    expect(runner.mock.calls[0][3]).toEqual({ timeoutMs: 45_000 });
    await runClaudeCode('p', { runner });
    expect(runner.mock.calls[1][3]).toEqual({ timeoutMs: 8 * 60 * 1000 });
  });

  it('sans option : schéma et prompt de l’enrichissement (non-régression)', async () => {
    const runner = vi.fn(async () => ({ code: 0, stdout: JSON.stringify({ is_error: false, structured_output: { basis: 'EXACT' }, usage: {} }) }));
    await runClaudeCode('p', { runner });
    const [args] = runner.mock.calls[0];
    expect(JSON.parse(args[args.indexOf('--json-schema') + 1])).toHaveProperty('properties.basis');
    expect(args[args.indexOf('--append-system-prompt') + 1]).toMatch(/documentaliste du vin/);
  });

  it('erreur explicite si Claude Code échoue ou n’est pas connecté', async () => {
    const runner = async () => ({ code: 1, stdout: JSON.stringify({ is_error: true, subtype: 'success', result: 'Not logged in · Please run /login' }) });
    await expect(runClaudeCode('p', { runner })).rejects.toThrow(/Not logged in/);
    await expect(runClaudeCode('p', { runner: async () => ({ code: 1, stdout: 'boom' }) })).rejects.toThrow(/code 1/);
  });
});

describe('prompt', () => {
  it('inclut les données utilisateur prioritaires et les connaissances existantes', () => {
    const p = buildUserPrompt(
      { producer: 'Domaine Richard', name: 'Charmen', cuvee: 'Charmen', vintage: 2023, type: 'WHITE', region: 'Rhône', grapeVarieties: [] },
      { purchasePrice: 23.4, tastingAromas: ['ananas'], knowledge: { data: { cuvee_style: 'ample' }, sources: [{ url: 'https://x' }] }, hint: 'Hervé Richard, Chavanay', currentYear: 2026 }
    );
    expect(p).toMatch(/Prix payé : environ 23 €/);
    expect(p).toMatch(/dégustation \(prioritaires.*ananas/);
    expect(p).toMatch(/Identification choisie par l'utilisateur : Hervé Richard, Chavanay/);
    expect(p).toMatch(/Déjà connu pour cette cuvée/);
    expect(p).toMatch(/Année en cours : 2026/);
  });
});
