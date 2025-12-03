import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3100;

const JWT_SECRET = process.env.JWT_SECRET || 'votre-jwt-secret-super-securise-changez-moi-absolument';

// Middleware
app.use(cors());
app.use(express.json());

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
    res.json(convertKeysToCamelCase(result.rows));
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
    res.status(500).json({ error: 'Failed to create wine', details: error.message });
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
    const result = await pool.query('SELECT * FROM bottles ORDER BY created_at DESC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching bottles:', error);
    res.status(500).json({ error: 'Failed to fetch bottles' });
  }
});

app.post('/api/bottles', async (req, res) => {
  try {
    const bottle = req.body;
    
    let locationJson = bottle.location;
    if (typeof bottle.location === 'string') {
      locationJson = { label: bottle.location };
    }
    if (!locationJson) {
      locationJson = { label: 'Non trié' };
    }
    
    const result = await pool.query(`
      INSERT INTO bottles (wine_id, location, added_by_user_id, purchase_date, is_consumed)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      bottle.wineId || bottle.wine_id,
      JSON.stringify(locationJson),
      bottle.addedByUserId || bottle.added_by_user_id,
      bottle.purchaseDate || bottle.purchase_date,
      bottle.isConsumed || bottle.is_consumed || false
    ]);
    
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating bottle:', error);
    res.status(500).json({ error: 'Failed to create bottle', details: error.message });
  }
});

app.put('/api/bottles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    let locationJson = updates.location;
    if (locationJson && typeof locationJson === 'string') {
      locationJson = { label: locationJson };
    }
    
    const result = await pool.query(`
      UPDATE bottles SET
        location = COALESCE($2, location),
        is_consumed = COALESCE($3, is_consumed),
        consumed_date = COALESCE($4, consumed_date),
        gifted_to = COALESCE($5, gifted_to),
        gift_occasion = COALESCE($6, gift_occasion)
      WHERE id = $1
      RETURNING *
    `, [
      id,
      locationJson ? JSON.stringify(locationJson) : null,
      updates.isConsumed,
      updates.consumedDate,
      updates.giftedTo,
      updates.giftOccasion
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bottle not found' });
    }
    
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating bottle:', error);
    res.status(500).json({ error: 'Failed to update bottle' });
  }
});

// ========== RACKS ENDPOINTS ==========

app.get('/api/racks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM racks ORDER BY created_at DESC');
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

app.delete('/api/racks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM racks WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rack not found' });
    }
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting rack:', error);
    res.status(500).json({ error: 'Failed to delete rack' });
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

// ========== HISTORY/JOURNAL ENDPOINTS ==========

app.get('/api/history', async (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.post('/api/history', async (req, res) => {
  try {
    console.log('Journal entry received:', req.body);
    res.status(201).json({ success: true, message: 'Journal entry logged' });
  } catch (error) {
    console.error('Error creating history:', error);
    res.status(500).json({ error: 'Failed to create history entry' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🍷 VinoFlow Backend running on port ${port}`);
});
