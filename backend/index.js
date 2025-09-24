const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.DB_HOST || 'db',
  database: process.env.POSTGRES_DB || 'waterdb',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  port: 5432,
});

// Create tables if not exists
pool.query(`CREATE TABLE IF NOT EXISTS water_intake (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  date DATE NOT NULL,
  amount INTEGER NOT NULL
)`);

pool.query(`CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE,
  water_target INTEGER NOT NULL DEFAULT 2000
)`);

pool.query(`CREATE TABLE IF NOT EXISTS daily_celebrations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  date DATE NOT NULL,
  celebrated BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, date)
)`);

// Register water intake
app.post('/api/intake', async (req, res) => {
  const { user_id, date, amount } = req.body;
  if (!date || !amount) return res.status(400).json({ error: 'Missing fields' });
  try {
    await pool.query(
      'INSERT INTO water_intake (user_id, date, amount) VALUES ($1, $2, $3)',
      [user_id || 'default', date, amount]
    );
    res.status(201).json({ message: 'Intake registered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get daily total
app.get('/api/intake', async (req, res) => {
  const { user_id, date } = req.query;
  try {
    const result = await pool.query(
      'SELECT SUM(amount) as total FROM water_intake WHERE user_id = $1 AND date = $2',
      [user_id || 'default', date]
    );
    res.json({ total: result.rows[0].total || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get history
app.get('/api/history', async (req, res) => {
  const { user_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT date, SUM(amount) as total FROM water_intake WHERE user_id = $1 GROUP BY date ORDER BY date',
      [user_id || 'default']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set water target
app.post('/api/settings/target', async (req, res) => {
  const { user_id, water_target } = req.body;
  if (!water_target) return res.status(400).json({ error: 'Missing water_target' });
  try {
    await pool.query(`
      INSERT INTO user_settings (user_id, water_target) 
      VALUES ($1, $2) 
      ON CONFLICT (user_id) 
      DO UPDATE SET water_target = $2
    `, [user_id || 'default', water_target]);
    res.json({ message: 'Water target updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get water target
app.get('/api/settings/target', async (req, res) => {
  const { user_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT water_target FROM user_settings WHERE user_id = $1',
      [user_id || 'default']
    );
    if (result.rows.length === 0) {
      res.json({ water_target: 2000 }); // default value
    } else {
      res.json({ water_target: result.rows[0].water_target });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset daily intake
app.delete('/api/intake/reset', async (req, res) => {
  const { user_id, date } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  try {
    await pool.query(
      'DELETE FROM water_intake WHERE user_id = $1 AND date = $2',
      [user_id || 'default', date]
    );
    res.json({ message: 'Daily intake reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark celebration as done for the day
app.post('/api/celebration/mark', async (req, res) => {
  const { user_id, date } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  try {
    await pool.query(`
      INSERT INTO daily_celebrations (user_id, date, celebrated) 
      VALUES ($1, $2, true) 
      ON CONFLICT (user_id, date) 
      DO UPDATE SET celebrated = true
    `, [user_id || 'default', date]);
    res.json({ message: 'Celebration marked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if already celebrated today
app.get('/api/celebration/check', async (req, res) => {
  const { user_id, date } = req.query;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  try {
    const result = await pool.query(
      'SELECT celebrated FROM daily_celebrations WHERE user_id = $1 AND date = $2',
      [user_id || 'default', date]
    );
    res.json({ celebrated: result.rows.length > 0 && result.rows[0].celebrated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
