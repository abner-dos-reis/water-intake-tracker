const notifier = require('node-notifier');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

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
// Track a precise scheduled notification (ms since epoch). When set, the periodic
// poll should avoid firing a separate reminder for the same window.
let nextScheduledAt = 0;

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
          // Resolve icon: try payload path, then public/<name>, then fallback
          let iconPath = path.join(__dirname, '..', '..', 'public', 'water.png');
          try {
            if (n.icon) {
              const candidate = path.join(__dirname, '..', '..', n.icon.replace(/^\//, ''));
              const candidatePublic = path.join(__dirname, '..', '..', 'public', n.icon.replace(/^\//, ''));
              if (fs.existsSync(candidate)) iconPath = candidate;
              else if (fs.existsSync(candidatePublic)) iconPath = candidatePublic;
            }
          } catch (e) {
            // ignore fs errors and use default
          }
          try {
            console.log('Notifier: showing pending notification with iconPath =', iconPath);
            notifier.notify({
              title: toTitleCase(n.title),
              message: n.message,
              icon: iconPath,
              wait: false
            });
          } catch (notifyErr) {
            console.error('node-notifier failed to show notification with icon:', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
            // try without icon as last resort
            try {
              console.log('Notifier: falling back to notify without icon for title=', n.title);
              notifier.notify({ title: toTitleCase(n.title), message: n.message, wait: false });
            } catch (e2) {
              console.error('Fallback notify also failed:', e2 && e2.message ? e2.message : e2);
            }
          }
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
  // If we already reminded recently, skip
  if (now - lastReminder < sixtyMinutes) {
    return;
  }

  // If there's an upcoming precise scheduled notification (set by LISTEN after a drink),
  // avoid firing the periodic poll reminder that would duplicate it. We use a small
  // buffer (5 minutes) to cover race conditions between timeout and poll.
  if (nextScheduledAt && nextScheduledAt > now && nextScheduledAt - now < (65 * 60 * 1000)) {
    console.log('Skipping periodic reminder because a precise scheduled notification exists at', new Date(nextScheduledAt).toISOString());
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
    // Before notifying, mark the next scheduled time so periodic polls won't also fire
    try { nextScheduledAt = Date.now() + sixtyMinutes; } catch (e) {}
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
      // set nextScheduledAt to help dedupe against periodic poll reminders
      nextScheduledAt = target.getTime();
      if (ms <= 0) {
        // already past, run immediately
        console.log('Scheduled drink time already passed, running checkAndNotify now');
        checkAndNotify();
        nextScheduledAt = 0;
        return;
      }
      console.log('Scheduling next notification at', target.toISOString());
      scheduledTimeout = setTimeout(() => {
        // clear our scheduled marker before firing so checkAndNotify's own logic
        // doesn't get suppressed accidentally
        try { nextScheduledAt = 0; } catch (e) {}
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
          // if it's a last_drink event, schedule 60 minutes after the provided drank_at (or now)
          if (payload && payload.type === 'last_drink') {
            try {
              const drankAtIso = payload.drank_at || new Date().toISOString();
              console.log('Received last_drink payload, scheduling 60m after drank_at =', drankAtIso);
              scheduleForDrankAt(drankAtIso);
            } catch (e) {
              console.error('Failed to schedule from last_drink payload:', e && e.message ? e.message : e);
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
              let iconPath = path.join(__dirname, '..', '..', 'public', 'water.png');
              try {
                if (payload.icon) {
                  const candidate = path.join(__dirname, '..', '..', payload.icon.replace(/^\//, ''));
                  const candidatePublic = path.join(__dirname, '..', '..', 'public', payload.icon.replace(/^\//, ''));
                  if (fs.existsSync(candidate)) iconPath = candidate;
                  else if (fs.existsSync(candidatePublic)) iconPath = candidatePublic;
                }
              } catch (e) {}
              try {
                console.log('Notifier: showing payload notification with iconPath =', iconPath);
                notifier.notify({ title: toTitleCase(payload.title), message: payload.message, icon: iconPath, wait: false });
              } catch (notifyErr) {
                console.error('node-notifier failed to show notification with icon:', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
                try { console.log('Notifier: falling back to notify without icon for payload title=', payload.title); notifier.notify({ title: toTitleCase(payload.title), message: payload.message, wait: false }); } catch (e2) { console.error('Fallback notify also failed:', e2 && e2.message ? e2.message : e2); }
              }
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
    // On startup, schedule 60 minutes from now (so next notification is ~60m after boot)
    try {
      const nowIso = new Date().toISOString();
      console.log('Scheduling first notify ~60 minutes from startup');
      scheduleForDrankAt(nowIso);
    } catch (e) {
      console.error('Failed to schedule on startup:', e && e.message ? e.message : e);
    }
  } catch (e) {
    console.error('Failed to setup Postgres LISTEN:', e.message || e);
  }
}

start().catch(e => console.error('Notifier failed:', e));
