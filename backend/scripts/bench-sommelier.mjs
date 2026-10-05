// Banc de comparaison du sommelier : pipeline (extract → score → argue → critique)
// contre prototype agent (un appel avec outils), sur 10 plats ; latence et coût
// (table ai_calls) ; qualité jugée en aveugle par Claude Opus 5.5.
//
//   CELLAR=cave.json        export JSON de la cave (GET /api/wines + bouteilles, avec inventoryCount)
//   DATABASE_URL=...        base où journaliser ai_calls (base de test conseillée)
//   ANTHROPIC_API_KEY=...   appels réels, facturés (≈ 0,05 $ par plat avec le juge)
//   CONC=1                  plats en parallèle (1 pour des coûts/latences fiables)
//   JUDGE=0                 sans juge
//   OUT=resultats.json
//
//   NODE_ENV=test node scripts/bench-sommelier.mjs
const B = new URL('../src', import.meta.url).pathname;
const fs = await import('node:fs');
const { pool } = await import(`${B}/db.js`);
const { runPairing } = await import(`${B}/sommelier/coordinator.js`);
const { runAgentPairing } = await import(`${B}/sommelier/agent.js`);
const { getClaudeClient } = await import(`${B}/services/aiService.js`);

const inventory = JSON.parse(fs.readFileSync(process.env.CELLAR, 'utf8'));
const byId = new Map(inventory.map((w) => [w.id, w]));
const DISHES = [
  'poulet rôti aux morilles et vin jaune',
  'sushis et sashimis de saumon',
  'côte de bœuf grillée au feu de bois',
  'curry vert thaï de crevettes',
  'fondue savoyarde',
  'moelleux au chocolat noir',
  'huîtres de Marennes',
  "tajine d'agneau aux pruneaux et amandes",
  'plateau de fromages : comté 24 mois, roquefort, crottin de chèvre',
  'risotto aux asperges vertes et parmesan',
];

const costSince = async (since, tasks) => (await pool.query(
  `SELECT coalesce(sum(cost_usd),0)::float AS cost, coalesce(sum(input_tokens+cache_read_tokens+cache_write_tokens),0)::int AS tin, coalesce(sum(output_tokens),0)::int AS tout, count(*)::int AS calls, bool_and(ok) AS ok
     FROM ai_calls WHERE created_at >= $1 AND task = ANY($2)`, [since, tasks])).rows[0];

const describe = (id) => {
  const w = byId.get(id);
  if (!w) return `id=${id} (INTROUVABLE DANS LA CAVE)`;
  return `${[w.producer, w.name, w.cuvee !== w.name ? w.cuvee : null, w.vintage].filter(Boolean).join(' ')} — ${w.type}, ${w.region || '?'}${w.appellation ? ' / ' + w.appellation : ''}, cépages: ${(w.grapeVarieties || []).join(', ') || '?'}, arômes: ${(w.aromaProfile || []).join(', ')}, corps ${w.sensoryProfile?.body ?? '?'}/tanin ${w.sensoryProfile?.tannin ?? '?'}/acidité ${w.sensoryProfile?.acidity ?? '?'}/sucre ${w.sensoryProfile?.sweetness ?? '?'}`;
};
const fmtPicks = (p) => ['safe', 'personal', 'creative'].map((k) => `${k.toUpperCase()}: ${p[k] ? `${describe(p[k].wine_id)}\n   Argument: ${p[k].reason}` : 'aucun'}`).join('\n') + `\nConseil: ${p.global_advice}`;
const validIds = (p) => ['safe', 'personal', 'creative'].every((k) => !p[k] || byId.has(p[k].wine_id));

const judgeSchema = { type: 'object', additionalProperties: false, required: ['score_1', 'score_2', 'winner', 'why'], properties: {
  score_1: { type: 'integer' }, score_2: { type: 'integer' }, winner: { type: 'string', enum: ['1', '2', 'egalite'] }, why: { type: 'string' } } };

const judge = async (dish, a, b) => {
  const client = getClaudeClient();
  const r = await client.messages.create({
    model: 'claude-opus-5-5', max_tokens: 4000, output_config: { format: { type: 'json_schema', schema: judgeSchema }, effort: 'medium' },
    system: 'Tu es un sommelier juge, exigeant et impartial. Tu compares deux propositions d\'accords mets-vins tirées de la MÊME cave. Critères : justesse des accords pour ce plat, cohérence des arguments avec les vins réels (fiches fournies), diversité réelle des 3 catégories (SAFE classique, PERSONAL, CREATIVE audacieux mais défendable). Note chaque proposition sur 10.',
    messages: [{ role: 'user', content: `Plat : ${dish}\n\nPROPOSITION 1\n${fmtPicks(a)}\n\nPROPOSITION 2\n${fmtPicks(b)}` }],
  });
  return JSON.parse(r.content.filter((x) => x.type === 'text').map((x) => x.text).join(''));
};

const runOne = async (dish) => {
  const t0 = new Date();
  const p0 = Date.now();
  const pipe = await runPairing({ pool, inventory, dish, context: {}, skipCache: true }).catch((e) => ({ error: e.message }));
  const pipeMs = Date.now() - p0;
  await new Promise((r) => setTimeout(r, 300));
  const pipeCost = await costSince(t0, ['extract-criteria', 'argue', 'critique']);
  const t1 = new Date();
  const a0 = Date.now();
  const agent = await runAgentPairing({ inventory, dish }).catch((e) => ({ error: e.message }));
  const agentMs = Date.now() - a0;
  await new Promise((r) => setTimeout(r, 300));
  const agentCost = await costSince(t1, ['sommelier-agent']);
  let verdict = null;
  if (process.env.JUDGE !== '0' && !pipe.error && !agent.error) {
    const flip = Math.random() < 0.5;
    const v = await judge(dish, flip ? agent.picks : pipe.picks, flip ? pipe.picks : agent.picks);
    verdict = {
      pipeline: flip ? v.score_2 : v.score_1, agent: flip ? v.score_1 : v.score_2,
      winner: v.winner === 'egalite' ? 'égalité' : ((v.winner === '1') !== flip ? 'pipeline' : 'agent'), why: v.why,
    };
  }
  return {
    dish,
    pipeline: pipe.error ? { error: pipe.error } : { ms: pipeMs, ...pipeCost, validIds: validIds(pipe.picks), picks: pipe.picks, candidates: pipe.candidates?.length },
    agent: agent.error ? { error: agent.error } : { ms: agentMs, ...agentCost, validIds: validIds(agent.picks), turns: agent.turns, tools: agent.toolCalls.map((t) => t.name), picks: agent.picks },
    verdict,
  };
};

const results = [];
const CONC = Number(process.env.CONC || 1);
for (let i = 0; i < DISHES.length; i += CONC) {
  results.push(...await Promise.all(DISHES.slice(i, i + CONC).map(runOne)));
}
fs.writeFileSync(process.env.OUT, JSON.stringify(results, null, 1));
for (const r of results) {
  console.log(`${r.dish.slice(0, 38).padEnd(38)} | pipe ${r.pipeline.error ? 'ERR ' + r.pipeline.error.slice(0, 40) : `${(r.pipeline.ms / 1000).toFixed(1)}s $${r.pipeline.cost.toFixed(4)} ids:${r.pipeline.validIds}`} | agent ${r.agent.error ? 'ERR ' + r.agent.error.slice(0, 60) : `${(r.agent.ms / 1000).toFixed(1)}s $${r.agent.cost.toFixed(4)} t${r.agent.turns} ids:${r.agent.validIds}`} | ${r.verdict ? `${r.verdict.pipeline} vs ${r.verdict.agent} → ${r.verdict.winner}` : '-'}`);
}
await pool.end();
