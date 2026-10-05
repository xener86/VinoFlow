// Bootstrap : vérification de la base, démarrage HTTP, préchauffage du cache.
import 'dotenv/config';
import app from './app.js';
import { pool } from './db.js';
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

// Start server
app.listen(port, () => {
  console.log(`🍷 VinoFlow Backend running on port ${port}`);
  // Run pre-warming in background after server is up
  setTimeout(() => { prewarmCommonDishes().catch(() => {}); }, 5000);
});
