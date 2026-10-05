// Bootstrap : vérification de la base, migrations, démarrage HTTP, préchauffage du cache.
import 'dotenv/config';
import app from './app.js';
import { pool } from './db.js';
import { runMigrations } from './migrations.js';
import { prewarmCommonDishes } from './sommelier/prewarm.js';

const port = process.env.PORT || 3100;

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// Schéma à jour avant d'accepter des requêtes ; en cas d'échec on s'arrête
// (Docker relance le conteneur) plutôt que de servir sur un schéma incomplet.
try {
  await runMigrations(pool);
} catch (error) {
  console.error('❌ Échec des migrations :', error.message);
  process.exit(1);
}

// Start server
app.listen(port, () => {
  console.log(`🍷 VinoFlow Backend running on port ${port}`);
  // Run pre-warming in background after server is up
  setTimeout(() => { prewarmCommonDishes().catch(() => {}); }, 5000);
});
