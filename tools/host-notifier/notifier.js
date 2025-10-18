const notifier = require('node-notifier');
const fetch = require('node-fetch');
const path = require('path');

const API_URL = process.env.VITE_API_URL || 'http://localhost:4000';
const POLL_MINUTES = process.env.POLL_MINUTES ? Number(process.env.POLL_MINUTES) : 60;
const USER_ID = process.env.USER_ID || 'default';
const { Client } = require('pg');
const PG_CONN = process.env.PG_CONN || 'postgresql://postgres:postgres@localhost:5432/waterdb';
// Track when we last showed the periodic reminder so it's not fired on every poll
let lastReminder = 0;
// Deduplication for rapid duplicate notifications
let lastNotifyKey = null;
let lastNotifyAt = 0;
const NOTIFY_DEDUPE_MS = 5000; // ignore identical notifies within 5 seconds

async function getTodayIntake() {
  const today = new Date().toISOString().slice(0,10);
  try {
    const res = await fetch(`${API_URL}/api/intake?user_id=${USER_ID}&date=${today}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.total || 0;
  } catch (e) {
    console.error('Error fetching intake:', e.message || e);
    return null;
  }
}

async function getWaterTarget() {
  try {
    const res = await fetch(`${API_URL}/api/settings/target?user_id=${USER_ID}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.water_target || 2000;
  } catch (e) {
    console.error('Error fetching water target:', e.message || e);
    return null;
  }
}

async function checkAndNotify() {
  // First, fetch pending notifications from backend
  try {
    const res = await fetch(`${API_URL}/api/notifications/pending`);
    if (res.ok) {
      const data = await res.json();
      const list = data.notifications || [];
      const toTitleCase = (s) => s.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      for (const n of list) {
            try {
              const key = `${n.title}::${n.message}`;
              const now = Date.now();
              if (key === lastNotifyKey && now - lastNotifyAt < NOTIFY_DEDUPE_MS) {
                console.log('Skipping duplicate pending notification:', key);
                continue;
              }
              lastNotifyKey = key;
              lastNotifyAt = now;
            } catch (e) {
              // ignore dedupe errors
            }
        // Play sound first (non-blocking) and ack after it finishes, then show notification shortly after
        if (process.env.SOUND_PATH) {
          try {
            const player = require('child_process').spawn('mpg123', [process.env.SOUND_PATH]);
            player.on('error', (e) => console.error('Error playing sound:', e));
            player.on('close', async (code) => {
              if (code === 0) {
                try {
                  await fetch(`${API_URL}/api/notifications/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: USER_ID }) });
                } catch (e) {
                  console.error('Failed to send ack:', e.message || e);
                }
              }
            });
          } catch (e) {
            console.error('Failed to start player:', e);
          }
        }
        setTimeout(() => {
          const iconPath = n.icon ? path.join(__dirname, '..', '..', n.icon.replace(/^\//, '')) : path.join(__dirname, '..', '..', 'public', 'water.png');
          notifier.notify({
            title: toTitleCase(n.title),
            message: n.message,
            icon: iconPath,
            wait: false
          });
        }, 150);
      }
    }
  } catch (e) {
    console.error('Error fetching pending notifications:', e.message || e);
  }

  // Existing periodic reminder behavior (keep as backup) — but only fire at most once per 60 minutes
  const intake = await getTodayIntake();
  const target = await getWaterTarget();
  if (intake === null || target === null) return;
  if (intake >= target) {
    console.log('Target already reached:', intake, '/', target);
    return;
  }

  const now = Date.now();
  const sixtyMinutes = 60 * 60 * 1000;
  if (now - lastReminder < sixtyMinutes) {
    // skip reminder because we already reminded recently
    return;
  }

  lastReminder = now;

  // Play sound first and then show a desktop notification
  if (process.env.SOUND_PATH) {
    try {
      const player = require('child_process').spawn('mpg123', [process.env.SOUND_PATH]);
      player.on('error', (e) => console.error('Error playing sound:', e));
      player.on('close', async (code) => {
        if (code === 0) {
          try {
            await fetch(`${API_URL}/api/notifications/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: USER_ID }) });
          } catch (e) {
            console.error('Failed to send ack:', e.message || e);
          }
        }
      });
    } catch (e) {
      console.error('Failed to start player:', e);
    }
  }

  setTimeout(() => {
    notifier.notify({
      title: 'Time To Drink Water',
      message: 'Recommendation: 300ml',
      icon: path.join(__dirname, '..', '..', 'public', 'water.png'),
      sound: false,
      wait: false
    });
  }, 150);
}

async function start() {
  console.log('Host notifier starting. Polling every', POLL_MINUTES, 'minutes. API:', API_URL);
  // Run immediately then every POLL_MINUTES
  await checkAndNotify();
  setInterval(checkAndNotify, POLL_MINUTES * 60 * 1000);

  // internal scheduled timeout for precise next-notify after a drink
  let scheduledTimeout = null;
  const scheduleForDrankAt = (drankAtIso) => {
    try {
      if (scheduledTimeout) {
        clearTimeout(scheduledTimeout);
        scheduledTimeout = null;
      }
      const drankAt = new Date(drankAtIso);
      const target = new Date(drankAt.getTime() + 60 * 60 * 1000);
      const now = new Date();
      const ms = target - now;
      if (ms <= 0) {
        // already past, run immediately
        console.log('Scheduled drink time already passed, running checkAndNotify now');
        checkAndNotify();
        return;
      }
      console.log('Scheduling next notification at', target.toISOString());
      scheduledTimeout = setTimeout(() => {
        checkAndNotify();
        scheduledTimeout = null;
      }, ms);
    } catch (e) {
      console.error('Failed to schedule for drankAt:', e && e.message ? e.message : e);
    }
  };

  // Setup Postgres LISTEN to react immediately
  try {
    const pgClient = new Client({ connectionString: process.env.PG_CONN || PG_CONN });
    await pgClient.connect();
    pgClient.on('notification', async (msg) => {
      if (msg.channel === 'notifications') {
        // If the NOTIFY contained a payload, try to parse it and act immediately
        try {
          const payload = msg.payload && msg.payload.length ? JSON.parse(msg.payload) : null;
          // if it's a last_drink event, request backend to compute next-notify and schedule
          if (payload && payload.type === 'last_drink') {
            console.log('Received last_drink payload, requesting next-notify from backend');
            try {
              const r2 = await fetch(`${API_URL}/api/next-notify?user_id=${USER_ID}`);
              if (r2.ok) {
                const nd = await r2.json();
                if (nd && nd.next) {
                  scheduleForDrankAt(nd.next);
                } else {
                  console.log('Backend returned no next notify (reason):', nd && nd.reason);
                }
              }
            } catch (e) {
              console.error('Failed to fetch next-notify:', e && e.message ? e.message : e);
            }
            return;
          }
          // dedupe quick repeated payloads
          const payloadKey = payload && payload.title && payload.message ? `${payload.title}::${payload.message}` : (msg.payload || 'new');
          const now = Date.now();
          if (payloadKey === lastNotifyKey && now - lastNotifyAt < NOTIFY_DEDUPE_MS) {
            console.log('Ignoring duplicate NOTIFY payload:', payloadKey);
            return;
          }
          lastNotifyKey = payloadKey;
          lastNotifyAt = now;
          if (payload && payload.title && payload.message) {
            console.log('Received NOTIFY with payload -> showing immediate notification');
            const toTitleCase = (s) => s.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
            // Play sound first (non-blocking), then show notification shortly after so they align.
            if (process.env.SOUND_PATH) {
              try {
                const player = require('child_process').spawn('mpg123', [process.env.SOUND_PATH]);
                player.on('error', (e) => console.error('Error playing sound:', e));
                player.on('close', async (code) => {
                  if (code === 0) {
                    try {
                      await fetch(`${API_URL}/api/notifications/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: payload.user_id || USER_ID }) });
                    } catch (e) {
                      console.error('Failed to send ack:', e.message || e);
                    }
                  }
                });
              } catch (e) {
                console.error('Failed to start player:', e);
              }
            }
            setTimeout(() => {
              const iconPath = payload.icon ? path.join(__dirname, '..', '..', payload.icon.replace(/^\//, '')) : path.join(__dirname, '..', '..', 'public', 'water.png');
              notifier.notify({ title: toTitleCase(payload.title), message: payload.message, icon: iconPath, wait: false });
            }, 150);
            // done
            return;
          }
        } catch (e) {
          // not a JSON payload — fall back to polling behavior
        }

        console.log('Received NOTIFY notifications -> checking pending...');
        await checkAndNotify();
      }
    });
    await pgClient.query('LISTEN notifications');
    console.log('Listening to Postgres notifications on channel "notifications"');
    // On startup, ask backend for the computed next-notify and schedule if present
    try {
      const r = await fetch(`${API_URL}/api/next-notify?user_id=${USER_ID}`);
      if (r.ok) {
        const d = await r.json();
        if (d && d.next) {
          console.log('Next notify computed on startup:', d.next);
          scheduleForDrankAt(d.next);
        } else {
          console.log('No next notify scheduled (reason):', d && d.reason);
        }
      }
    } catch (e) {
      console.error('Failed to fetch next-notify on startup:', e && e.message ? e.message : e);
    }
  } catch (e) {
    console.error('Failed to setup Postgres LISTEN:', e.message || e);
  }
}

start().catch(e => console.error('Notifier failed:', e));
