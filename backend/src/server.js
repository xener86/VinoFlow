import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { runPairing, suggestDishesForWine, pairMenu, explainPairing } from './sommelier/coordinator.js';
import { applyFeedback, getTasteProfile, upsertTasteProfile } from './sommelier/tasteProfile.js';
import { isProviderConfigured, getTaskDefaults } from './services/aiService.js';
import { enrichWine, aromasFromTastingNotes } from './sommelier/enrich.js';
import { extractFromLabel } from './sommelier/ocr.js';
import { computeBudget } from './sommelier/budget.js';
import { fetchCommunityData, fetchMarketValue, fetchPressScores } from './services/externalData.js';
import { updateMissingEmbeddings } from './sommelier/embeddings.js';
import { extractCriteria } from './sommelier/llm1.js';
import { setCriteriaCache } from './sommelier/cache.js';
import {
  drinkBeforeAlerts,
  anticipationForEvent,
  purchaseSuggestions,
} from './sommelier/proactive.js';
import {
  buildVerticalTasting,
  compareForDish,
  blindTasting,
  agingRecommendations,
  findDuplicates,
  cellarProjection,
} from './sommelier/advanced.js';

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

// ========== SOMMELIER V2 ENDPOINTS ==========

// Helper: load full inventory for a user
const loadInventory = async () => {
  const result = await pool.query(`
    SELECT
      w.*,
      COALESCE(
        (SELECT count(*) FROM bottles b WHERE b.wine_id = w.id AND b.is_consumed = false),
        0
      )::int AS inventory_count
    FROM wines w
    ORDER BY w.created_at DESC
  `);
  return convertKeysToCamelCase(result.rows);
};

// Run the full pairing pipeline (LLM1 → rules → score → LLM2)
app.post('/api/sommelier/pair', async (req, res) => {
  try {
    const { dish, context, skipCache } = req.body;
    if (!dish) return res.status(400).json({ error: 'dish is required' });

    const inventory = await loadInventory();
    const userId = req.user?.userId;

    // Load few-shot from feedback (limited to recent 30 entries)
    let userFeedback = [];
    if (userId) {
      const fb = await pool.query(`
        SELECT pf.dish, pf.rating, pf.category, w.name || ' ' || COALESCE(w.vintage::text, '') AS wine_label
          FROM pairing_feedback pf
          LEFT JOIN wines w ON w.id = pf.wine_id
         WHERE pf.user_id = $1
         ORDER BY pf.created_at DESC
         LIMIT 30
      `, [userId]);
      userFeedback = fb.rows;
    }

    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;

    const result = await runPairing({
      pool,
      inventory,
      dish,
      context: context || {},
      userId,
      userFeedback,
      tasteProfile,
      skipCache: Boolean(skipCache),
    });

    res.json(result);
  } catch (error) {
    console.error('Sommelier pair error:', error);
    res.status(500).json({ error: 'Failed to compute pairing', details: error.message });
  }
});

// Record user feedback on a sommelier suggestion
app.post('/api/sommelier/feedback', async (req, res) => {
  try {
    const { wineId, dish, rating, category, criteria, context } = req.body;
    if (!dish || !rating || !['UP', 'DOWN'].includes(rating)) {
      return res.status(400).json({ error: 'dish and rating (UP|DOWN) are required' });
    }

    const userId = req.user?.userId;
    await pool.query(`
      INSERT INTO pairing_feedback (user_id, wine_id, dish, rating, category, criteria_json, context_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId, wineId || null, dish, rating, category || null, criteria || null, context || null]);

    // Update taste profile (Phase 2.10)
    if (userId && wineId) {
      const wineRes = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
      if (wineRes.rows.length > 0) {
        const wine = convertKeysToCamelCase(wineRes.rows[0]);
        const current = await getTasteProfile(pool, userId);
        const next = applyFeedback(current, wine, rating);
        await upsertTasteProfile(pool, userId, next);
      }
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Sommelier feedback error:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

// Phase 7.1 — Reverse pairing: vin → plats
app.post('/api/sommelier/reverse-pair', async (req, res) => {
  try {
    const { wineId } = req.body;
    if (!wineId) return res.status(400).json({ error: 'wineId required' });
    const wineRes = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
    if (wineRes.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(wineRes.rows[0]);
    const result = await suggestDishesForWine(wine);
    res.json(result);
  } catch (error) {
    console.error('Reverse pair error:', error);
    res.status(500).json({ error: 'Failed to compute reverse pairing' });
  }
});

// Phase 7.2 — Multi-course menu pairing
app.post('/api/sommelier/menu', async (req, res) => {
  try {
    const { dishes, context } = req.body;
    if (!Array.isArray(dishes) || dishes.length === 0) {
      return res.status(400).json({ error: 'dishes must be a non-empty array' });
    }
    const userId = req.user?.userId;
    const inventory = await loadInventory();
    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;
    const result = await pairMenu({ pool, inventory, dishes, userId, userFeedback: [], tasteProfile });
    res.json(result);
  } catch (error) {
    console.error('Menu pair error:', error);
    res.status(500).json({ error: 'Failed to pair menu' });
  }
});

// Phase 13.1 — Mode "explique-moi" pour un accord
app.post('/api/sommelier/explain', async (req, res) => {
  try {
    const { dish, wineId, criteria } = req.body;
    if (!dish || !wineId) return res.status(400).json({ error: 'dish and wineId required' });
    const wineRes = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
    if (wineRes.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(wineRes.rows[0]);
    const explanation = await explainPairing(dish, wine, criteria);
    res.json({ explanation });
  } catch (error) {
    console.error('Explain pairing error:', error);
    res.status(500).json({ error: 'Failed to explain pairing' });
  }
});

// ────────────────────────────────────────────
// Phase 8 — Proactive features
// ────────────────────────────────────────────

app.get('/api/sommelier/alerts/drink-before', async (req, res) => {
  try {
    const horizon = parseInt(req.query.horizonMonths) || 12;
    const inventory = await loadInventory();
    const alerts = drinkBeforeAlerts(inventory, { horizonMonths: horizon });
    res.json({ count: alerts.length, alerts });
  } catch (error) {
    console.error('drink-before error:', error);
    res.status(500).json({ error: 'Failed to compute alerts' });
  }
});

app.post('/api/sommelier/anticipation', async (req, res) => {
  try {
    const { eventDate, limit } = req.body;
    if (!eventDate) return res.status(400).json({ error: 'eventDate required' });
    const inventory = await loadInventory();
    const result = anticipationForEvent(inventory, eventDate, { limit: limit ?? 5 });
    res.json({ event: eventDate, count: result.length, suggestions: result });
  } catch (error) {
    console.error('anticipation error:', error);
    res.status(500).json({ error: 'Failed to compute anticipation' });
  }
});

app.get('/api/sommelier/purchase-suggestions', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const journal = (await pool.query('SELECT * FROM journal ORDER BY date DESC LIMIT 500')).rows;
    const suggestions = purchaseSuggestions(inventory, convertKeysToCamelCase(journal));
    res.json({ count: suggestions.length, suggestions });
  } catch (error) {
    console.error('purchase-suggestions error:', error);
    res.status(500).json({ error: 'Failed to compute purchase suggestions' });
  }
});

// ────────────────────────────────────────────
// Phase 10 — Advanced pairing modes
// ────────────────────────────────────────────

app.post('/api/sommelier/vertical', async (req, res) => {
  try {
    const { producer } = req.body;
    if (!producer) return res.status(400).json({ error: 'producer required' });
    const inventory = await loadInventory();
    const result = buildVerticalTasting(inventory, producer);
    res.json(result);
  } catch (error) {
    console.error('vertical error:', error);
    res.status(500).json({ error: 'Failed to build vertical' });
  }
});

app.post('/api/sommelier/compare', async (req, res) => {
  try {
    const { dish, wineAId, wineBId } = req.body;
    if (!dish || !wineAId || !wineBId) {
      return res.status(400).json({ error: 'dish, wineAId, wineBId required' });
    }
    const r = await pool.query('SELECT * FROM wines WHERE id = ANY($1)', [[wineAId, wineBId]]);
    if (r.rows.length !== 2) return res.status(404).json({ error: 'Wines not found' });
    const wineA = convertKeysToCamelCase(r.rows.find(w => w.id === wineAId));
    const wineB = convertKeysToCamelCase(r.rows.find(w => w.id === wineBId));
    const result = await compareForDish(dish, wineA, wineB);
    res.json(result);
  } catch (error) {
    console.error('compare error:', error);
    res.status(500).json({ error: 'Failed to compare wines' });
  }
});

app.get('/api/sommelier/blind', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const result = blindTasting(inventory);
    if (!result) return res.status(404).json({ error: 'No wine in cave' });
    res.json(result);
  } catch (error) {
    console.error('blind error:', error);
    res.status(500).json({ error: 'Failed to start blind tasting' });
  }
});

// ────────────────────────────────────────────
// Phase 11 — Wine lifecycle
// ────────────────────────────────────────────

app.get('/api/wines/aging-recommendations', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const recs = agingRecommendations(inventory);
    res.json({ count: recs.length, recommendations: recs });
  } catch (error) {
    console.error('aging-recommendations error:', error);
    res.status(500).json({ error: 'Failed to compute aging recommendations' });
  }
});

app.get('/api/wines/duplicates', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const dupes = findDuplicates(inventory);
    res.json({ count: dupes.length, groups: dupes });
  } catch (error) {
    console.error('duplicates error:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

app.get('/api/cellar/projection', async (req, res) => {
  try {
    const yearsAhead = parseInt(req.query.yearsAhead) || 5;
    const inventory = await loadInventory();
    const journal = (await pool.query('SELECT * FROM journal ORDER BY date DESC LIMIT 500')).rows;
    const result = cellarProjection(inventory, convertKeysToCamelCase(journal), { yearsAhead });
    res.json(result);
  } catch (error) {
    console.error('projection error:', error);
    res.status(500).json({ error: 'Failed to compute projection' });
  }
});

// Phase 13.3 — Budget tracking
app.get('/api/cellar/budget', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const inventory = await loadInventory();
    // Inventory needs bottles attached for budget; fetch them
    const bottlesRes = await pool.query('SELECT * FROM bottles');
    const bottles = convertKeysToCamelCase(bottlesRes.rows);
    const enriched = inventory.map(w => ({ ...w, bottles: bottles.filter(b => b.wineId === w.id) }));
    const journal = (await pool.query('SELECT * FROM journal ORDER BY date DESC LIMIT 500')).rows;
    const result = computeBudget(enriched, convertKeysToCamelCase(journal), { monthsBack: months });
    res.json(result);
  } catch (error) {
    console.error('budget error:', error);
    res.status(500).json({ error: 'Failed to compute budget' });
  }
});

// Phase 9 — External data (stubs that use AI estimates today, replace with real APIs)
app.get('/api/wines/:id/external/community', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM wines WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(r.rows[0]);
    const data = await fetchCommunityData(wine);
    res.json(data || { source: 'NONE', error: 'No data available' });
  } catch (error) {
    console.error('community error:', error);
    res.status(500).json({ error: 'Failed to fetch community data' });
  }
});

app.get('/api/wines/:id/external/market-value', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM wines WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(r.rows[0]);
    const data = await fetchMarketValue(wine);
    res.json(data || { source: 'NONE' });
  } catch (error) {
    console.error('market-value error:', error);
    res.status(500).json({ error: 'Failed to fetch market value' });
  }
});

app.get('/api/wines/:id/external/press', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM wines WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(r.rows[0]);
    const data = await fetchPressScores(wine);
    res.json(data || { source: 'NONE' });
  } catch (error) {
    console.error('press error:', error);
    res.status(500).json({ error: 'Failed to fetch press scores' });
  }
});

// Phase 5 — pgvector embeddings management
app.post('/api/wines/refresh-embeddings', async (req, res) => {
  try {
    const limit = parseInt(req.body?.limit) || 100;
    const result = await updateMissingEmbeddings(pool, { limit });
    res.json(result);
  } catch (error) {
    console.error('refresh-embeddings error:', error);
    res.status(500).json({ error: 'Failed to refresh embeddings', details: error.message });
  }
});

// Phase 4.3 — Streaming sommelier (Server-Sent Events)
// Sends partial events: criteria → candidates → picks
app.get('/api/sommelier/pair-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const dish = req.query.dish;
    if (!dish) {
      send('error', { message: 'dish required' });
      return res.end();
    }
    send('status', { phase: 'extract-criteria' });

    const criteria = await extractCriteria(dish, {});
    send('criteria', criteria);

    send('status', { phase: 'matching' });
    const inventory = await loadInventory();
    const userId = req.user?.userId;
    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;

    const result = await runPairing({
      pool, inventory, dish, context: {}, userId, userFeedback: [], tasteProfile, skipCache: false,
    });

    send('candidates', result.candidates);
    send('picks', result.picks);
    send('done', { fromCache: result.fromCache, cave_size: result.cave_size });
  } catch (error) {
    send('error', { message: error.message });
  } finally {
    res.end();
  }
});

// Phase 6.1 — OCR: extract wine info from a label image
// Body: { image: "base64...", mimeType: "image/jpeg" }
app.post('/api/wines/extract-from-image', async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) required' });
    const extracted = await extractFromLabel(image, mimeType || 'image/jpeg');
    res.json(extracted);
  } catch (error) {
    console.error('OCR error:', error);
    res.status(500).json({ error: 'Failed to extract from image', details: error.message });
  }
});

// Get current user's taste profile
app.get('/api/sommelier/taste-profile', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const profile = await getTasteProfile(pool, userId);
    res.json(profile || null);
  } catch (error) {
    console.error('Get taste-profile error:', error);
    res.status(500).json({ error: 'Failed to fetch taste profile' });
  }
});

// Discover which AI providers are configured (used by frontend Settings)
app.get('/api/ai/providers', async (req, res) => {
  res.json({
    providers: {
      gemini: isProviderConfigured('gemini'),
      claude: isProviderConfigured('claude'),
    },
    defaults: getTaskDefaults(),
  });
});

// Phase 3.1 - Enrich aromas in batch (vins sans profil)
// Body: { onlyMissing: boolean, useConsensus: boolean, limit: number }
app.post('/api/wines/enrich-aromas', async (req, res) => {
  try {
    const { onlyMissing = true, useConsensus = false, limit = 50 } = req.body || {};
    const userId = req.user?.userId;

    const filter = onlyMissing
      ? `WHERE aroma_profile IS NULL OR array_length(aroma_profile, 1) IS NULL OR array_length(aroma_profile, 1) < 3 OR aroma_source IS NULL`
      : '';
    const result = await pool.query(`SELECT * FROM wines ${filter} ORDER BY created_at DESC LIMIT $1`, [limit]);
    const wines = convertKeysToCamelCase(result.rows);

    const enriched = [];
    const failed = [];

    for (const wine of wines) {
      try {
        const profile = await enrichWine(wine, { useConsensus });
        await pool.query(`
          UPDATE wines SET
            aroma_profile = $1,
            aroma_source = $2,
            aroma_confidence = $3,
            aroma_provider = $4,
            aroma_verified_at = CASE WHEN $2 = 'CONSENSUS' THEN now() ELSE aroma_verified_at END,
            updated_at = now()
          WHERE id = $5
        `, [
          profile.aromas,
          profile.source,
          profile.confidence,
          (profile.providers || []).join(',') || 'gemini',
          wine.id,
        ]);
        enriched.push({ id: wine.id, name: wine.name, aromas: profile.aromas, confidence: profile.confidence });
      } catch (err) {
        console.error(`Enrich failed for ${wine.id}:`, err.message);
        failed.push({ id: wine.id, name: wine.name, error: err.message });
      }
    }

    res.json({
      processed: wines.length,
      enriched: enriched.length,
      failed: failed.length,
      results: enriched,
      errors: failed,
    });
  } catch (error) {
    console.error('Batch enrich error:', error);
    res.status(500).json({ error: 'Failed to enrich aromas', details: error.message });
  }
});

// Phase 3.4 - Audit dashboard: vins suspects (profils faibles ou vides)
app.get('/api/wines/audit', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, name, producer, vintage, region, type,
        aroma_profile, aroma_source, aroma_confidence, aroma_verified_at, updated_at
      FROM wines
      WHERE
        aroma_profile IS NULL
        OR array_length(aroma_profile, 1) IS NULL
        OR array_length(aroma_profile, 1) < 3
        OR aroma_source IS NULL
        OR (aroma_source = 'AI' AND aroma_confidence = 'LOW')
        OR (aroma_source = 'AI' AND updated_at < now() - interval '12 months')
      ORDER BY
        CASE WHEN aroma_profile IS NULL THEN 0 ELSE 1 END,
        CASE WHEN aroma_confidence = 'LOW' THEN 0 WHEN aroma_confidence = 'MEDIUM' THEN 1 ELSE 2 END,
        updated_at ASC
      LIMIT 100
    `);
    res.json({
      count: result.rowCount,
      wines: convertKeysToCamelCase(result.rows),
    });
  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ error: 'Failed to run audit' });
  }
});

// Phase 3.3 - Re-derive aroma profile from tasting notes (closes the loop)
app.post('/api/wines/:id/refresh-from-tastings', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const notesRes = await pool.query('SELECT * FROM tasting_notes WHERE wine_id = $1 ORDER BY date DESC', [id]);
    const aromas = aromasFromTastingNotes(convertKeysToCamelCase(notesRes.rows));
    if (aromas.length < 3) {
      return res.status(400).json({ error: 'Not enough aromas in tasting notes (need ≥3)', found: aromas.length });
    }
    const result = await pool.query(`
      UPDATE wines SET
        aroma_profile = $1,
        aroma_source = 'TASTING',
        aroma_confidence = 'HIGH',
        aroma_verified_at = now(),
        aroma_verified_by = $2,
        updated_at = now()
      WHERE id = $3
      RETURNING *
    `, [aromas, userId || null, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    res.json({ wine: convertKeysToCamelCase(result.rows[0]), aromas });
  } catch (error) {
    console.error('Refresh-from-tastings error:', error);
    res.status(500).json({ error: 'Failed to refresh from tastings' });
  }
});

// Update aroma profile manually (Phase 1.4 - validation UI)
app.put('/api/wines/:id/aroma-profile', async (req, res) => {
  try {
    const { id } = req.params;
    const { aromaProfile, source, confidence } = req.body;
    if (!Array.isArray(aromaProfile)) {
      return res.status(400).json({ error: 'aromaProfile must be an array' });
    }
    const userId = req.user?.userId;
    const result = await pool.query(`
      UPDATE wines SET
        aroma_profile = $1,
        aroma_source = $2,
        aroma_confidence = $3,
        aroma_verified_at = now(),
        aroma_verified_by = $4,
        updated_at = now()
      WHERE id = $5
      RETURNING *
    `, [
      aromaProfile,
      source || 'USER',
      confidence || 'HIGH',
      userId || null,
      id,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Update aroma-profile error:', error);
    res.status(500).json({ error: 'Failed to update aroma profile' });
  }
});

// Phase 4.4 — Pre-warming common dishes at startup.
// Pre-computes LLM1 criteria for the 50 most common dishes so the very first
// pairing request is fast.
const COMMON_DISHES = [
  'poulet rôti', 'saumon grillé', 'sushis', 'fromage de chèvre', 'fromage à pâte dure',
  'magret de canard', 'côte de bœuf', 'agneau de pré-salé', 'cassoulet', 'choucroute',
  'bouillabaisse', 'risotto aux champignons', 'pâtes carbonara', 'pizza margherita', 'fondue savoyarde',
  'raclette', 'plateau de charcuterie', 'huîtres', 'tartare de bœuf', 'curry de poulet',
  'bo bun', 'pad thaï', 'paella', 'tagine d\'agneau', 'couscous',
  'tajine de poisson', 'apéritif léger', 'apéritif charcuterie', 'foie gras', 'comté',
  'roquefort', 'tarte au citron', 'tarte tatin', 'fondant chocolat', 'crème brûlée',
  'salade de chèvre chaud', 'pissaladière', 'quiche lorraine', 'blanquette de veau', 'navarin d\'agneau',
  'pintade rôtie', 'lapin moutarde', 'gigot d\'agneau', 'magret au miel', 'truite aux amandes',
  'lotte au safran', 'cabillaud beurre blanc', 'sole meunière', 'noix de saint-jacques', 'risotto truffe',
];

const prewarmCommonDishes = async () => {
  if (process.env.VINOFLOW_PREWARM !== 'true') return;
  console.log('🔥 Pre-warming pairing cache for common dishes...');
  let warmed = 0;
  for (const dish of COMMON_DISHES) {
    try {
      const criteria = await extractCriteria(dish, {});
      await setCriteriaCache(pool, dish, criteria);
      warmed++;
    } catch (e) {
      // Skip silently — likely no API key
    }
    // Avoid hammering the API
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`🔥 Pre-warmed ${warmed}/${COMMON_DISHES.length} dishes`);
};

// Start server
app.listen(port, () => {
  console.log(`🍷 VinoFlow Backend running on port ${port}`);
  // Run pre-warming in background after server is up
  setTimeout(() => { prewarmCommonDishes().catch(() => {}); }, 5000);
});
