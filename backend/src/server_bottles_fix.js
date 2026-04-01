// POST create bottle
app.post('/api/bottles', async (req, res) => {
  try {
    const bottle = req.body;
    
    // Convertir location en JSONB si c'est une string
    let locationJson = bottle.location;
    if (typeof bottle.location === 'string') {
      try {
        locationJson = JSON.parse(bottle.location);
      } catch {
        locationJson = { raw: bottle.location };
      }
    }
    
    const result = await pool.query(`
      INSERT INTO bottles (wine_id, location, added_by_user_id, purchase_date, is_consumed)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      bottle.wineId || bottle.wine_id,
      locationJson,
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
