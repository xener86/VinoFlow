// Recalcul des embeddings en ligne de commande.
//   docker compose exec backend node src/cli/refresh-embeddings.js [--all]
// --all : recalcule tous les vins (après un changement de modèle d'embedding).
import 'dotenv/config';
import { pool } from '../db.js';
import { updateMissingEmbeddings } from '../sommelier/embeddings.js';

const all = process.argv.includes('--all');
try {
  const result = await updateMissingEmbeddings(pool, { all, limit: 100000 });
  console.log(`Embeddings (${result.model}) : ${result.updated}/${result.processed} mis à jour, ${result.errors.length} erreur(s)`);
  for (const e of result.errors.slice(0, 10)) console.log(`  ${e.id} : ${e.error}`);
  process.exitCode = result.errors.length ? 1 : 0;
} finally {
  await pool.end();
}
