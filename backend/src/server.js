import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3100;

// Fail-fast: JWT_SECRET is mandatory. No silent fallback.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_me') {
  console.error('❌ JWT_SECRET is missing or insecure. Set JWT_SECRET to a long random string in your .env file.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// CORS: restrict to the frontend origin. Defaults to localhost for dev.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5001';
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Auth middleware: verifies JWT and attaches req.user
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ msg: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ msg: 'Invalid or expired token' });
  }
};

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// Helper functions
const toCamelCase = (str) => str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

const convertKeysToCamelCase = (obj) => {
  if (Array.isArray(obj)) return obj.map(convertKeysToCamelCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      acc[toCamelCase(key)] = convertKeysToCamelCase(obj[key]);
      return acc;
    }, {});
  }
  return obj;
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== AUTH ENDPOINTS ==========

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ msg: 'Email and password required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(`
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, created_at
    `, [email.toLowerCase(), passwordHash]);
    
    const user = result.rows[0];
    
    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({
      user: { id: user.id, email: user.email },
      access_token: token,
      refresh_token: token
    });
  } catch (error) {
    console.error('Signup error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ msg: 'Email already exists' });
    }
    res.status(500).json({ msg: 'Signup failed' });
  }
});

// Login (avec grant_type pour compatibilité customAuth)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ msg: 'Email and password required' });
    }
    
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ msg: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    
    if (!valid) {
      return res.status(401).json({ msg: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      user: { id: user.id, email: user.email },
      access_token: token,
      refresh_token: token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ msg: 'Login failed' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// ========== Protected routes (require JWT) ==========
// All /api/* routes below this point require a valid JWT token.
app.use('/api', authenticate);

// ========== WINES ENDPOINTS ==========

app.get('/api/wines', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', b.id,
              'wine_id', b.wine_id,
              'location', b.location,
              'added_by_user_id', b.added_by_user_id,
              'purchase_date', b.purchase_date,
              'is_consumed', b.is_consumed,
              'consumed_date', b.consumed_date,
              'gifted_to', b.gifted_to,
              'gift_occasion', b.gift_occasion,
              'purchase_price', b.purchase_price,
              'created_at', b.created_at
            ) ORDER BY b.created_at
          ) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) as bottles
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `);
    const wines = convertKeysToCamelCase(result.rows).map(w => ({
      ...w,
      bottles: (w.bottles || []).map(b => {
        // Normalize legacy {"label": "..."} locations to plain strings
        if (b.location && typeof b.location === 'object' && 'label' in b.location && !('rackId' in b.location)) {
          b.location = b.location.label;
        }
        return b;
      })
    }));
    res.json(wines);
  } catch (error) {
    console.error('Error fetching wines:', error);
    res.status(500).json({ error: 'Failed to fetch wines' });
  }
});

app.get('/api/wines/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT
        w.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', b.id,
              'wine_id', b.wine_id,
              'location', b.location,
              'added_by_user_id', b.added_by_user_id,
              'purchase_date', b.purchase_date,
              'is_consumed', b.is_consumed,
              'consumed_date', b.consumed_date,
              'gifted_to', b.gifted_to,
              'gift_occasion', b.gift_occasion,
              'purchase_price', b.purchase_price,
              'created_at', b.created_at
            ) ORDER BY b.created_at
          ) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) as bottles
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id
      WHERE w.id = $1
      GROUP BY w.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }
    
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error fetching wine:', error);
    res.status(500).json({ error: 'Failed to fetch wine' });
  }
});

app.post('/api/wines', async (req, res) => {
  try {
    const wine = req.body;
    const result = await pool.query(`
      INSERT INTO wines (
        name, cuvee, parcel, producer, vintage, region, country, type,
        grape_varieties, format, personal_notes, sensory_description,
        aroma_profile, tasting_notes, suggested_food_pairings,
        producer_history, enriched_by_ai, ai_confidence, is_favorite, sensory_profile
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `, [
      wine.name, wine.cuvee, wine.parcel, wine.producer, wine.vintage,
      wine.region, wine.country, wine.type, wine.grapeVarieties, wine.format,
      wine.personalNotes, wine.sensoryDescription, wine.aromaProfile,
      wine.tastingNotes, wine.suggestedFoodPairings, wine.producerHistory,
      wine.enrichedByAi, wine.aiConfidence, wine.isFavorite, wine.sensoryProfile
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating wine:', error);
    res.status(500).json({ error: 'Failed to create wine' });
  }
});

app.put('/api/wines/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const wine = req.body;
    const result = await pool.query(`
      UPDATE wines SET
        name = $1, cuvee = $2, parcel = $3, producer = $4, vintage = $5,
        region = $6, country = $7, type = $8, grape_varieties = $9, format = $10,
        personal_notes = $11, sensory_description = $12, aroma_profile = $13,
        tasting_notes = $14, suggested_food_pairings = $15, producer_history = $16,
        enriched_by_ai = $17, ai_confidence = $18, is_favorite = $19,
        sensory_profile = $20, updated_at = NOW()
      WHERE id = $21
      RETURNING *
    `, [
      wine.name, wine.cuvee, wine.parcel, wine.producer, wine.vintage,
      wine.region, wine.country, wine.type, wine.grapeVarieties, wine.format,
      wine.personalNotes, wine.sensoryDescription, wine.aromaProfile,
      wine.tastingNotes, wine.suggestedFoodPairings, wine.producerHistory,
      wine.enrichedByAi, wine.aiConfidence, wine.isFavorite, wine.sensoryProfile, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }
    
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating wine:', error);
    res.status(500).json({ error: 'Failed to update wine' });
  }
});

app.delete('/api/wines/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM wines WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting wine:', error);
    res.status(500).json({ error: 'Failed to delete wine' });
  }
});

// ========== BOTTLES ENDPOINTS ==========

app.get('/api/bottles', async (req, res) => {
  try {
    const { wineId } = req.query;
    const query = wineId
      ? 'SELECT * FROM bottles WHERE wine_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM bottles ORDER BY created_at DESC';
    const params = wineId ? [wineId] : [];
    const result = await pool.query(query, params);
    const bottles = convertKeysToCamelCase(result.rows).map(b => {
      // Normalize legacy {"label": "..."} locations to plain strings
      if (b.location && typeof b.location === 'object' && 'label' in b.location && !('rackId' in b.location)) {
        b.location = b.location.label;
      }
      return b;
    });
    res.json(bottles);
  } catch (error) {
    console.error('Error fetching bottles:', error);
    res.status(500).json({ error: 'Failed to fetch bottles' });
  }
});

app.post('/api/bottles', async (req, res) => {
  try {
    const bottle = req.body;
    
    // Store string locations as JSON strings (not objects like {"label": "..."})
    let locationValue = bottle.location;
    if (!locationValue) locationValue = 'Non trié';
    const locationJson = typeof locationValue === 'string'
      ? JSON.stringify(locationValue)   // e.g. '"Non trié"' — valid jsonb string
      : JSON.stringify(locationValue);  // e.g. '{"rackId":"...","x":0,"y":0}'

    const result = await pool.query(`
      INSERT INTO bottles (wine_id, location, added_by_user_id, purchase_date, is_consumed, purchase_price)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      bottle.wineId ?? bottle.wine_id,
      locationJson,
      bottle.addedByUserId ?? bottle.added_by_user_id,
      bottle.purchaseDate ?? bottle.purchase_date,
      bottle.isConsumed ?? bottle.is_consumed ?? false,
      bottle.purchasePrice ?? bottle.purchase_price ?? null
    ]);
    
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating bottle:', error);
    res.status(500).json({ error: 'Failed to create bottle' });
  }
});

app.put('/api/bottles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build a dynamic partial UPDATE based on which fields the client sent.
    // This lets clients explicitly set fields to null (clearing them) while
    // leaving untouched fields alone.
    const fields = [];
    const values = [id];
    let i = 2;
    const add = (col, val) => { fields.push(`${col} = $${i++}`); values.push(val); };

    if ('location' in updates) {
      const locValue = updates.location ?? 'Non trié';
      add('location', JSON.stringify(locValue));
    }
    if ('isConsumed' in updates) add('is_consumed', updates.isConsumed);
    if ('consumedDate' in updates) add('consumed_date', updates.consumedDate);
    if ('giftedTo' in updates) add('gifted_to', updates.giftedTo);
    if ('giftOccasion' in updates) add('gift_occasion', updates.giftOccasion);
    if ('purchasePrice' in updates) add('purchase_price', updates.purchasePrice);

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const result = await pool.query(
      `UPDATE bottles SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bottle not found' });
    }
    
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating bottle:', error);
    res.status(500).json({ error: 'Failed to update bottle' });
  }
});

app.delete('/api/bottles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM bottles WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bottle not found' });
    }
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting bottle:', error);
    res.status(500).json({ error: 'Failed to delete bottle' });
  }
});

// ========== RACKS ENDPOINTS ==========

app.get('/api/racks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM racks ORDER BY sort_order ASC, created_at ASC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching racks:', error);
    res.status(500).json({ error: 'Failed to fetch racks' });
  }
});

app.post('/api/racks', async (req, res) => {
  try {
    const rack = req.body;
    const result = await pool.query(`
      INSERT INTO racks (name, width, height, type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [rack.name, rack.width, rack.height, rack.type]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating rack:', error);
    res.status(500).json({ error: 'Failed to create rack' });
  }
});

app.put('/api/racks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [id];
    let i = 2;
    const add = (col, val) => { fields.push(`${col} = $${i++}`); values.push(val); };
    if ('name' in updates) add('name', updates.name);
    if ('width' in updates) add('width', updates.width);
    if ('height' in updates) add('height', updates.height);
    if ('type' in updates) add('type', updates.type);
    if ('sortOrder' in updates) add('sort_order', updates.sortOrder);

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const result = await pool.query(
      `UPDATE racks SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rack not found' });
    }
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating rack:', error);
    res.status(500).json({ error: 'Failed to update rack' });
  }
});

app.post('/api/racks/reorder', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rackIds } = req.body;
    if (!Array.isArray(rackIds)) {
      return res.status(400).json({ error: 'rackIds must be an array' });
    }
    await client.query('BEGIN');
    for (let i = 0; i < rackIds.length; i++) {
      await client.query('UPDATE racks SET sort_order = $1 WHERE id = $2', [i, rackIds[i]]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reordering racks:', error);
    res.status(500).json({ error: 'Failed to reorder racks' });
  } finally {
    client.release();
  }
});

app.delete('/api/racks/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    // Migrate bottles from this rack to "Non trié" before deleting
    await client.query(
      `UPDATE bottles SET location = '"Non trié"'::jsonb WHERE location->>'rackId' = $1 AND is_consumed = false`,
      [id]
    );
    const result = await client.query('DELETE FROM racks WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rack not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true, id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting rack:', error);
    res.status(500).json({ error: 'Failed to delete rack' });
  } finally {
    client.release();
  }
});

// ========== SPIRITS ENDPOINTS ==========

app.get('/api/spirits', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM spirits ORDER BY added_at DESC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching spirits:', error);
    res.status(500).json({ error: 'Failed to fetch spirits' });
  }
});

app.get('/api/spirits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM spirits WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spirit not found' });
    }
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error fetching spirit:', error);
    res.status(500).json({ error: 'Failed to fetch spirit' });
  }
});

app.post('/api/spirits', async (req, res) => {
  try {
    const spirit = req.body;
    const result = await pool.query(`
      INSERT INTO spirits (
        name, category, distillery, region, country, age, cask_type, abv, format,
        description, producer_history, tasting_notes, aroma_profile,
        suggested_cocktails, culinary_pairings, enriched_by_ai, is_opened,
        inventory_level, is_luxury
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      spirit.name, spirit.category, spirit.distillery, spirit.region, spirit.country,
      spirit.age, spirit.caskType, spirit.abv, spirit.format, spirit.description,
      spirit.producerHistory, spirit.tastingNotes, spirit.aromaProfile,
      spirit.suggestedCocktails, spirit.culinaryPairings, spirit.enrichedByAi,
      spirit.isOpened, spirit.inventoryLevel, spirit.isLuxury
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating spirit:', error);
    res.status(500).json({ error: 'Failed to create spirit' });
  }
});

app.put('/api/spirits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const spirit = req.body;
    const result = await pool.query(`
      UPDATE spirits SET
        name = $1, category = $2, distillery = $3, region = $4, country = $5,
        age = $6, cask_type = $7, abv = $8, format = $9, description = $10,
        producer_history = $11, tasting_notes = $12, aroma_profile = $13,
        suggested_cocktails = $14, culinary_pairings = $15, enriched_by_ai = $16,
        is_opened = $17, inventory_level = $18, is_luxury = $19
      WHERE id = $20
      RETURNING *
    `, [
      spirit.name, spirit.category, spirit.distillery, spirit.region, spirit.country,
      spirit.age, spirit.caskType, spirit.abv, spirit.format, spirit.description,
      spirit.producerHistory, spirit.tastingNotes, spirit.aromaProfile,
      spirit.suggestedCocktails, spirit.culinaryPairings, spirit.enrichedByAi,
      spirit.isOpened, spirit.inventoryLevel, spirit.isLuxury, id
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spirit not found' });
    }
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating spirit:', error);
    res.status(500).json({ error: 'Failed to update spirit' });
  }
});

app.delete('/api/spirits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM spirits WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spirit not found' });
    }
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting spirit:', error);
    res.status(500).json({ error: 'Failed to delete spirit' });
  }
});

// ========== TASTING NOTES ENDPOINTS ==========

app.get('/api/tasting-notes', async (req, res) => {
  try {
    const { wineId } = req.query;
    const query = wineId
      ? 'SELECT * FROM tasting_notes WHERE wine_id = $1 ORDER BY date DESC'
      : 'SELECT * FROM tasting_notes ORDER BY date DESC';
    const params = wineId ? [wineId] : [];
    const result = await pool.query(query, params);
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching tasting notes:', error);
    res.status(500).json({ error: 'Failed to fetch tasting notes' });
  }
});

app.post('/api/tasting-notes', async (req, res) => {
  try {
    const note = req.body;
    const result = await pool.query(`
      INSERT INTO tasting_notes (
        wine_id, date, overall_rating, visual_notes, nose_notes, palate_notes,
        general_notes, occasion, companions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      note.wineId, note.date || new Date().toISOString(),
      note.overallRating ?? null,
      note.visualNotes ?? null,
      note.noseNotes ?? null,
      note.palateNotes ?? null,
      note.generalNotes ?? null,
      note.occasion ?? null,
      note.companions ?? null
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating tasting note:', error);
    res.status(500).json({ error: 'Failed to create tasting note' });
  }
});

app.delete('/api/tasting-notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tasting_notes WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tasting note not found' });
    }
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting tasting note:', error);
    res.status(500).json({ error: 'Failed to delete tasting note' });
  }
});

// ========== HISTORY/JOURNAL ENDPOINTS ==========

app.get('/api/history', async (req, res) => {
  try {
    const { wineId } = req.query;
    let query = 'SELECT * FROM journal';
    const params = [];
    if (wineId) {
      query += ' WHERE wine_id = $1';
      params.push(wineId);
    }
    query += ' ORDER BY date DESC';
    const result = await pool.query(query, params);
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.post('/api/history', async (req, res) => {
  try {
    const entry = req.body;
    // ID is always server-generated (gen_random_uuid default) to prevent
    // clients from spoofing or colliding IDs.
    const result = await pool.query(`
      INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, description, from_location, to_location, recipient, occasion, note, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      entry.date || new Date().toISOString(),
      entry.type || 'NOTE',
      entry.wineId || entry.wine_id || null,
      entry.wineName || entry.wine_name || 'Vin inconnu',
      entry.wineVintage || entry.wine_vintage || null,
      entry.quantity || null,
      entry.description || null,
      entry.fromLocation || entry.from_location || null,
      entry.toLocation || entry.to_location || null,
      entry.recipient || null,
      entry.occasion || null,
      entry.note || null,
      entry.userId || entry.user_id || null
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating history:', error);
    res.status(500).json({ error: 'Failed to create history entry' });
  }
});

// ========== WISHLIST ENDPOINTS ==========

app.get('/api/wishlist', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM wishlist ORDER BY added_at DESC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

app.post('/api/wishlist', async (req, res) => {
  try {
    const item = req.body;
    const result = await pool.query(`
      INSERT INTO wishlist (name, producer, region, appellation, type, vintage, notes, source, estimated_price, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      item.name, item.producer || null, item.region || null, item.appellation || null,
      item.type || null, item.vintage || null, item.notes || null, item.source || null,
      item.estimatedPrice ?? item.estimated_price ?? null, item.priority || 'MEDIUM'
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating wishlist item:', error);
    res.status(500).json({ error: 'Failed to create wishlist item' });
  }
});

app.delete('/api/wishlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM wishlist WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting wishlist item:', error);
    res.status(500).json({ error: 'Failed to delete wishlist item' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🍷 VinoFlow Backend running on port ${port}`);
});
