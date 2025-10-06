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

// Record backend start time so we don't deliver pending notifications that were
// created before this process started (prevents mass-fire on docker restart).
const serverStart = new Date();

// Create tables if not exists
pool.query(`CREATE TABLE IF NOT EXISTS water_intake (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  date DATE NOT NULL,
  amount INTEGER NOT NULL
)`);

pool.query(`CREATE TABLE IF NOT EXISTS last_drinks (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  drank_at TIMESTAMP DEFAULT now()
)`);

pool.query(`CREATE TABLE IF NOT EXISTS last_access (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE,
  last_date DATE NOT NULL
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

pool.query(`CREATE TABLE IF NOT EXISTS pending_notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
)`);

// Ensure we don't accidentally queue duplicate notifications forever
pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_notifications_unique ON pending_notifications (user_id, title, message)`).catch(e => {
  // ignore errors here; index may exist or DB may not support IF NOT EXISTS in some versions
});

// Cleanup very old pending notifications on startup (7+ days)
pool.query(`DELETE FROM pending_notifications WHERE created_at < now() - interval '7 days'`).catch(e => {
  // don't crash on cleanup errors
  console.error('Failed to cleanup old pending_notifications:', e && e.message ? e.message : e);
});

pool.query(`CREATE TABLE IF NOT EXISTS notification_acks (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  played_at TIMESTAMP DEFAULT now()
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
    // record last drink timestamp for scheduling
    try {
      await pool.query('INSERT INTO last_drinks (user_id) VALUES ($1)', [user_id || 'default']);
      // emit a NOTIFY so host-notifier can reschedule precisely
      const payload = JSON.stringify({ type: 'last_drink', user_id: user_id || 'default', drank_at: new Date().toISOString() });
      await pool.query('SELECT pg_notify($1, $2)', ['notifications', payload]);
    } catch (e) {
      console.error('Failed to record last_drink or notify:', e && e.message ? e.message : e);
    }
    res.status(201).json({ message: 'Intake registered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Return last drink timestamp for a user
app.get('/api/last-drink', async (req, res) => {
  const { user_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT drank_at FROM last_drinks WHERE user_id = $1 ORDER BY drank_at DESC LIMIT 1',
      [user_id || 'default']
    );
    res.json({ last_drink_at: result.rows.length > 0 ? result.rows[0].drank_at : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Compute next notification timestamp for a user
app.get('/api/next-notify', async (req, res) => {
  const { user_id } = req.query;
  const uid = user_id || 'default';
  try {
    // check if user already reached target for today
    const today = new Date().toISOString().slice(0,10);
    const intakeRes = await pool.query('SELECT SUM(amount) as total FROM water_intake WHERE user_id = $1 AND date = $2', [uid, today]);
    const total = intakeRes.rows[0].total || 0;
    const targetRes = await pool.query('SELECT water_target FROM user_settings WHERE user_id = $1', [uid]);
    const target = targetRes.rows.length > 0 ? targetRes.rows[0].water_target : 2000;
    if (total >= target) return res.json({ next: null, reason: 'target_reached' });

    // get last drink and last ack
    const lastDrinkRes = await pool.query('SELECT drank_at FROM last_drinks WHERE user_id = $1 ORDER BY drank_at DESC LIMIT 1', [uid]);
    const lastAckRes = await pool.query('SELECT played_at FROM notification_acks WHERE user_id = $1 ORDER BY played_at DESC LIMIT 1', [uid]);
    const lastDrink = lastDrinkRes.rows.length > 0 ? lastDrinkRes.rows[0].drank_at : null;
    const lastAck = lastAckRes.rows.length > 0 ? lastAckRes.rows[0].played_at : null;

    const now = new Date();
    let next = null;

    if (lastDrink && (!lastAck || new Date(lastDrink) > new Date(lastAck))) {
      next = new Date(new Date(lastDrink).getTime() + 60 * 60 * 1000);
    } else if (lastAck) {
      next = new Date(new Date(lastAck).getTime() + 60 * 60 * 1000);
    } else {
      // no previous notifications/acks; schedule 60 minutes from now, except midnight rule
      next = new Date(now.getTime() + 60 * 60 * 1000);
    }

    // If the next falls into the midnight hour (00:00-00:59), move to 01:00
    if (next.getHours() === 0) {
      next.setHours(1, 0, 0, 0);
    }

    return res.json({ next: next.toISOString(), reason: 'scheduled' });
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

// Create a pending notification (from frontend)
app.post('/api/notifications', async (req, res) => {
  const { user_id, title, message } = req.body;
  console.log('POST /api/notifications received:', { headers: req.headers, body: req.body });
  if (!title || !message) return res.status(400).json({ error: 'Missing title or message' });
  try {
    // If client explicitly requests non-persistent (real-time) notification, just send NOTIFY
    // with a JSON payload so host-notifier can act immediately without storing rows.
    if (req.body && req.body.persist === false) {
      const payload = JSON.stringify({ user_id: user_id || 'default', title, message });
      try {
        // Use pg_notify via SELECT so we can pass the payload as a parameter safely
        await pool.query('SELECT pg_notify($1, $2)', ['notifications', payload]);
      } catch (e) {
        console.error('Failed to send NOTIFY with payload:', e.message || e);
      }
      return res.status(200).json({ message: 'Notification signaled (non-persistent)' });
    }

    // Default: upsert into pending_notifications so it's durable if host is down
    await pool.query(
      `INSERT INTO pending_notifications (user_id, title, message)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, title, message)
       DO UPDATE SET created_at = now(), message = EXCLUDED.message`,
      [user_id || 'default', title, message]
    );

    // notify listeners via Postgres NOTIFY (without payload)
    try {
      await pool.query("NOTIFY notifications, 'new'");
    } catch (e) {
      console.error('Failed to send NOTIFY:', e.message || e);
    }
    res.status(201).json({ message: 'Notification queued' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch and consume pending notifications (for host-notifier)
app.get('/api/notifications/pending', async (req, res) => {
  try {
    // Return and delete pending notifications in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT id, user_id, title, message, created_at FROM pending_notifications WHERE created_at >= $1 ORDER BY created_at', [serverStart]);
      if (result.rows.length > 0) {
        const ids = result.rows.map(r => r.id);
        await client.query('DELETE FROM pending_notifications WHERE id = ANY($1::int[])', [ids]);
      }
      await client.query('COMMIT');
      res.json({ notifications: result.rows });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin endpoint: clear pending notifications for a user (or all if user_id omitted)
app.post('/api/notifications/clear', async (req, res) => {
  const { user_id } = req.body;
  try {
    if (user_id) {
      const result = await pool.query('DELETE FROM pending_notifications WHERE user_id = $1 RETURNING id', [user_id]);
      return res.json({ deleted: result.rowCount });
    } else {
      const result = await pool.query('DELETE FROM pending_notifications RETURNING id');
      return res.json({ deleted: result.rowCount });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Host notifier posts here after playing sound
app.post('/api/notifications/ack', async (req, res) => {
  const { user_id } = req.body;
  try {
    await pool.query('INSERT INTO notification_acks (user_id) VALUES ($1)', [user_id || 'default']);
    res.json({ message: 'ack recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Frontend can query last ack time
app.get('/api/notifications/last-ack', async (req, res) => {
  const { user_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT played_at FROM notification_acks WHERE user_id = $1 ORDER BY played_at DESC LIMIT 1',
      [user_id || 'default']
    );
    res.json({ last_played: result.rows.length > 0 ? result.rows[0].played_at : null });
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

// Get last access date
app.get('/api/last-access', async (req, res) => {
  const { user_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT last_date FROM last_access WHERE user_id = $1',
      [user_id || 'default']
    );
    res.json({ last_date: result.rows.length > 0 ? result.rows[0].last_date : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update last access date
app.post('/api/last-access', async (req, res) => {
  const { user_id, date } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  try {
    await pool.query(`
      INSERT INTO last_access (user_id, last_date) 
      VALUES ($1, $2) 
      ON CONFLICT (user_id) 
      DO UPDATE SET last_date = $2
    `, [user_id || 'default', date]);
    res.json({ message: 'Last access date updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
