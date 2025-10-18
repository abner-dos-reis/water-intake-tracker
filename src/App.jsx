import React, { useState, useEffect } from 'react';
import './App.css';

const DEFAULT_WATER_TARGET = 2000; // Default value for new users
const CUP_ML = 500;
const BOTTLE_ML = 800;
const CUSTOM_OPTIONS = [
  { icon: '☕', label: '100ml', value: 100 },
  { icon: '🥤', label: '200ml', value: 200 },
  { icon: '🍶', label: '300ml', value: 300 },
  { icon: '🧃', label: '400ml', value: 400 },
  { icon: '🥛', label: '700ml', value: 700 },
  { icon: '🫙', label: '800ml', value: 800 },
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function App() {
  const [intake, setIntake] = useState(0);
  const [showCongrats, setShowCongrats] = useState(false);
  const [waterTarget, setWaterTarget] = useState(null); // Starts null until loaded from backend
  const [editingTarget, setEditingTarget] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().slice(0, 10));
  const [isTargetLoaded, setIsTargetLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userHidCelebration, setUserHidCelebration] = useState(false);
  const instanceIdRef = React.useRef(`inst_${Math.random().toString(36).slice(2,9)}`);


  // Function to get current date in YYYY-MM-DD format
  const getTodayDate = () => new Date().toISOString().slice(0, 10);

  // Function to load today's intake from backend
  const loadTodayIntake = async () => {
    try {
      const today = getTodayDate();
      const response = await fetch(`${API_URL}/api/intake?user_id=default&date=${today}`);
      if (response.ok) {
        const data = await response.json();
        const newIntake = data.total || 0;
        setIntake(newIntake);
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      // Fallback to localStorage if backend is not available
      const today = getTodayDate();
      const key = `water_${today}`;
      const stored = JSON.parse(localStorage.getItem(key) || '0');
      setIntake(stored);
    }
  };

  // Function to save intake to backend
  const saveIntakeToBackend = async (amount) => {
    try {
      const today = getTodayDate();
      const response = await fetch(`${API_URL}/api/intake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: 'default',
          date: today,
          amount: amount
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      // Fallback to localStorage if backend is not available
      const today = getTodayDate();
      const key = `water_${today}`;
      const current = JSON.parse(localStorage.getItem(key) || '0');
      localStorage.setItem(key, JSON.stringify(current + amount));
    }
  };

  // Function to load water target from backend
  const loadWaterTarget = async () => {
    try {
      isUserChange.current = false; // Mark that this is not a user change
      const response = await fetch(`${API_URL}/api/settings/target?user_id=default`);
      if (response.ok) {
        const data = await response.json();
        setWaterTarget(data.water_target || DEFAULT_WATER_TARGET);
        setIsTargetLoaded(true);
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      // Fallback to localStorage if backend is not available
      const stored = localStorage.getItem('water_target');
      const target = stored ? JSON.parse(stored) : DEFAULT_WATER_TARGET;
      setWaterTarget(target);
      setIsTargetLoaded(true);
    }
  };

  // Function to save water target to backend
  const saveWaterTarget = async (target) => {
    try {
      const response = await fetch(`${API_URL}/api/settings/target`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: 'default',
          water_target: target
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      // Fallback to localStorage if backend is not available
      localStorage.setItem('water_target', JSON.stringify(target));
    }
  };



  // Function to hide celebration when user clicks YAY
  const markCelebrationAsSeen = () => {
    setShowCongrats(false);
    setUserHidCelebration(true); // Mark that user has hidden the celebration
  };

  // Reference to control if it's a user change or initial load
  const isUserChange = React.useRef(false);
  const lastNotifRef = React.useRef(0);
  // Prevent local audio from playing multiple times in a short window
  const lastLocalPlayRef = React.useRef(0);
  const LOCAL_PLAY_DEDUPE_MS = 8000;
  // Guard to ensure the recurring scheduler starts only once per mounted app
  const schedulerStartedRef = React.useRef(false);
  // Refs to control scheduler timeout/interval so other handlers can reset them
  const schedulerTimeoutRef = React.useRef(null);
  const schedulerIntervalRef = React.useRef(null);

  // Notification sound
  const playNotificationSound = () => {
    // Prevent rapid duplicate local plays
    try {
      const now = Date.now();
      if (now - lastLocalPlayRef.current < LOCAL_PLAY_DEDUPE_MS) {
        console.log('Skipping local sound: recently played');
        return;
      }
      lastLocalPlayRef.current = now;
    } catch (e) {
      // ignore
    }
    // Try to play external mp3 first, fallback to WebAudio beep
    try {
      // use sound.mp3 placed in public/
      const audio = new window.Audio('/sound.mp3');
      const playPromise = audio.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(() => {
          // fallback to beep
          tryBeep();
        });
      }
    } catch (e) {
      tryBeep();
    }
  };

  const tryBeep = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
        o.stop(ctx.currentTime + 0.06);
      }, 200);
    } catch (e) {
      console.debug('Beep fallback failed', e);
    }
  };

  // Queue a system notification on the backend (host-notifier will display it with sound)
  const toTitleCase = (s) => s.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

  // Queue a system notification on the backend (host-notifier will display it with sound)
  const queueSystemNotification = async (title = 'Time to drink water', message = 'Recommendation: 300ml') => {
    // Prevent rapid repeated sends from UI or other sources
    const nowTs = Date.now();
    if (nowTs - lastNotifRef.current < 10000) {
      console.log('Skipping send: recently sent notification', { sinceMs: nowTs - lastNotifRef.current });
      showInlineToast('Notification already sent recently');
      return;
    }
    lastNotifRef.current = nowTs;
    try {
      const tTitle = toTitleCase(title);
      // Try to send a non-persistent real-time notification first (host-notifier will handle immediately).
      // If host/backend doesn't support it, backend will fall back to persist by default.
      try {
        console.log('queueSystemNotification: sending to', `${API_URL}/api/notifications`);
        // include icon so host-notifier can show it; backend will ignore if not supported
        const payload = { user_id: 'default', title: tTitle, message, persist: false, icon: '/water.png' };
        const res = await fetch(`${API_URL}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          cache: 'no-store'
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        // keep the friendly original toast message
        showInlineToast(`${tTitle} — ${message}`);
      } catch (err) {
        console.error('queueSystemNotification fetch error, attempting sendBeacon fallback:', err);
        // Try sendBeacon as a last-resort fallback (fire-and-forget). Some browsers
        // may restrict fetch in certain contexts; beacon can sometimes succeed.
        try {
          if (navigator && navigator.sendBeacon) {
            const payload = JSON.stringify({ user_id: 'default', title: tTitle, message, persist: false });
            const blob = new Blob([payload], { type: 'application/json' });
            const ok = navigator.sendBeacon(`${API_URL}/api/notifications`, blob);
            console.log('sendBeacon fallback used, result:', ok);
            showInlineToast(`${tTitle} — ${message}`);
          } else {
            showInlineToast(`Failed to send notification: ${err.message || err}`);
          }
        } catch (e2) {
          console.error('sendBeacon fallback failed:', e2);
          showInlineToast(`Failed to send notification: ${err.message || err}`);
        }
      }
      // Wait for host-notifier to either consume the queued notification or ack playback.
      // Poll for up to 8 seconds (1s interval). If host consumed the pending notification
      // or returned an ack newer than the queue time, don't play local fallback sound.
      const queuedAt = new Date();
      const maxWaitMs = 8000;
      const intervalMs = 1000;
      const start = Date.now();
      let handledByHost = false;
      while (Date.now() - start < maxWaitMs) {
        try {
          // Check last ack
          const res = await fetch(`${API_URL}/api/notifications/last-ack?user_id=default`);
          if (res.ok) {
            const data = await res.json();
            const last = data.last_played ? new Date(data.last_played) : null;
            if (last && last >= queuedAt) {
              handledByHost = true;
              break;
            }
          }
        } catch (e) {
          // ignore and continue polling
        }

        try {
          // If pending list is empty, host picked it up (so it will play sound)
          const p = await fetch(`${API_URL}/api/notifications/pending`);
          if (p.ok) {
            const pd = await p.json();
            const list = pd.notifications || [];
              if (list.length === 0) {
                console.log('Pending list empty: assuming host consumed notification');
                handledByHost = true;
                break;
              }
          }
        } catch (e) {
          // ignore
        }

        await new Promise(r => setTimeout(r, intervalMs));
      }

      if (!handledByHost) {
        playNotificationSound();
      }
      else {
        // If host consumed the pending notification but didn't ack (no playback),
        // wait a short grace period for ack; if still no ack, play local sound.
        try {
          const resA = await fetch(`${API_URL}/api/notifications/last-ack?user_id=default`);
          let last = null;
          if (resA.ok) {
            const da = await resA.json();
            last = da.last_played ? new Date(da.last_played) : null;
          }
          console.log('Host ack check: last ack =', last);
          if (!last || last < queuedAt) {
            // wait briefly for host to post ack
            await new Promise(r => setTimeout(r, 1500));
            try {
              const resB = await fetch(`${API_URL}/api/notifications/last-ack?user_id=default`);
              if (resB.ok) {
                const db = await resB.json();
                const last2 = db.last_played ? new Date(db.last_played) : null;
                console.log('Host ack re-check: last ack =', last2);
                if (!last2 || last2 < queuedAt) {
                  playNotificationSound();
                }
              } else {
                playNotificationSound();
              }
            } catch (e) {
              playNotificationSound();
            }
          }
        } catch (e) {
          // ignore and don't block
        }
      }
    } catch (e) {
      console.error('Failed to queue system notification:', e);
      // fallback to inline toast only
      showInlineToast(`${title} — ${message}`);
    }
  };

  // Inline toast state for visual fallback/testing
  const [toast, setToast] = React.useState({ visible: false, message: '' });
  const [testBtnDisabled, setTestBtnDisabled] = React.useState(false);
  const showInlineToast = (message, ms = 4000) => {
    setToast({ visible: true, message });
    setTimeout(() => setToast({ visible: false, message: '' }), ms);
  };

  // Function to save last access date
  const saveLastAccessDate = async (date) => {
    try {
      await fetch(`${API_URL}/api/last-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: 'default',
          date: date
        })
      });
    } catch (error) {
      console.error('Error saving last access date:', error);
    }
  };

  // Function to get last access date
  const getLastAccessDate = async () => {
    try {
      const response = await fetch(`${API_URL}/api/last-access?user_id=default`);
      if (response.ok) {
        const data = await response.json();
        return data.last_date;
      }
    } catch (error) {
      console.error('Error getting last access date:', error);
    }
    return null;
  };

  // Load initial data synchronously
  useEffect(() => {
    const loadInitialData = async () => {
      setUserHidCelebration(false); // Reset - user can see celebration again
      
      // Check last access date
      const lastAccess = await getLastAccessDate();
      const today = getTodayDate();
      
      // If last access is from a previous day, reset the intake locally and on the backend for TODAY
      if (lastAccess && lastAccess < today) {
        setIntake(0);
        try {
          // reset for today to ensure today's count is zero
          await fetch(`${API_URL}/api/intake/reset`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: 'default',
              date: today
            })
          });
        } catch (error) {
          console.error('Error resetting intake:', error);
        }
        // update local marker
        localStorage.setItem('last_active_day', today);
      }

      // Save current access date (backend) regardless
      await saveLastAccessDate(today);
      
      await loadWaterTarget();
      await loadTodayIntake();
      setIsLoading(false);
    };
    loadInitialData();
  }, []);

  // Minimal inter-instance sync: BroadcastChannel with localStorage fallback
  useEffect(() => {
    const key = 'water-sync-v1';
    let bc = null;
    try { if ('BroadcastChannel' in window) bc = new BroadcastChannel(key); } catch (e) { bc = null; }

    const onMessage = (msg) => {
      try {
        const data = msg && msg.data ? msg.data : (typeof msg === 'string' ? JSON.parse(msg) : msg);
        if (!data || data.inst === instanceIdRef.current) return;
        // If remote indicates a newer change, reload authoritative values from server
        if (data.ts && data.ts > (window.__water_last_ts__ || 0)) {
          window.__water_last_ts__ = data.ts;
          // reload authoritative intake and target
          loadTodayIntake();
          loadWaterTarget();
        }
      } catch (e) {}
    };

    if (bc) bc.addEventListener('message', onMessage);
    const onStorage = (ev) => { try { if (ev.key !== key) return; const data = JSON.parse(ev.newValue || '{}'); onMessage(data); } catch (e) {} };
    window.addEventListener('storage', onStorage);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadTodayIntake();
        loadWaterTarget();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => { try { if (bc) bc.removeEventListener('message', onMessage); bc && bc.close(); } catch (e) {}; window.removeEventListener('storage', onStorage); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  // publish state to other instances when intake or waterTarget changes
  useEffect(() => {
    try {
      const key = 'water-sync-v1';
      const payload = { inst: instanceIdRef.current, ts: Date.now(), intake, waterTarget };
      try { if ('BroadcastChannel' in window) { const bc = new BroadcastChannel(key); bc.postMessage(payload); bc.close(); } } catch (e) {}
      try { localStorage.setItem(key, JSON.stringify(payload)); } catch (e) {}
    } catch (e) {}
  }, [intake, waterTarget]);

  // Poll backend for last_drink every 10s to keep instances in sync with DB (authoritative)
  useEffect(() => {
    let interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/last-drink?user_id=default`);
        if (res.ok) {
          const data = await res.json();
          const last = data.last_drink_at ? new Date(data.last_drink_at).getTime() : 0;
          if (last > (window.__last_drank_ts__ || 0)) {
            window.__last_drank_ts__ = last;
            await loadTodayIntake();
          }
        }
      } catch (e) {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Recurring notification scheduler
  React.useEffect(() => {
    let intervalId = null;
    let timeoutId = null;
    // Only start the scheduler once per mounted App instance
    if (schedulerStartedRef.current) return;
    schedulerStartedRef.current = true;

    const scheduleHourlyNotifications = () => {
      // Schedule to run every 60 minutes
      intervalId = setInterval(() => {
        if (waterTarget && intake >= waterTarget) return; // skip if goal met
        queueSystemNotification();
      }, 60 * 60 * 1000);
      // store refs so other parts can clear/reset
      schedulerIntervalRef.current = intervalId;
      return intervalId;
    };

    // Schedule the next notification after ms milliseconds and then start the hourly interval.
    const scheduleNextNotification = (ms) => {
      // clear existing
      try { if (schedulerTimeoutRef.current) clearTimeout(schedulerTimeoutRef.current); } catch (e) {}
      try { if (schedulerIntervalRef.current) clearInterval(schedulerIntervalRef.current); } catch (e) {}
      schedulerTimeoutRef.current = setTimeout(() => {
        if (!(waterTarget && intake >= waterTarget)) queueSystemNotification();
        // after firing, start the regular hourly interval
        scheduleHourlyNotifications();
      }, ms);
      timeoutId = schedulerTimeoutRef.current;
      return schedulerTimeoutRef.current;
    };

    const now = new Date();
    // If it's the midnight hour, wait until 01:00 for first notification
    if (now.getHours() === 0) {
      const msToOne = ((60 - now.getMinutes()) * 60 - now.getSeconds()) * 1000;
      // schedule first at 01:00, then hourly
      scheduleNextNotification(msToOne);
    } else {
      // Start the interval such that the first notification happens after 60 minutes
      // (we don't fire immediately on page load)
      scheduleNextNotification(60 * 60 * 1000);
    }

    return () => {
      try { if (schedulerTimeoutRef.current) clearTimeout(schedulerTimeoutRef.current); } catch (e) {}
      try { if (schedulerIntervalRef.current) clearInterval(schedulerIntervalRef.current); } catch (e) {}
      schedulerStartedRef.current = false;
    };
  }, [intake, waterTarget]);

  // Save target to backend only when user changes it (not on initial load)
  useEffect(() => {
    if (isTargetLoaded && isUserChange.current) {
      saveWaterTarget(waterTarget);
    }
  }, [waterTarget, isTargetLoaded]);

  // Check celebration when all data is loaded
  useEffect(() => {
    // Only check after all data is loaded
    if (!isLoading && waterTarget && waterTarget > 0) {
      // Show celebration if goal reached AND user hasn't hidden it
      if (intake >= waterTarget && intake > 0 && !showCongrats && !userHidCelebration) {
        setShowCongrats(true);
      }
    }
  }, [waterTarget, intake, isLoading, showCongrats, userHidCelebration]);

  // Check date change every minute and reset at 00:00
  useEffect(() => {
    const checkDateChange = async () => {
      const today = getTodayDate();
      if (today !== currentDate) {
        setCurrentDate(today);
        setIntake(0);
        setShowCongrats(false);

        // Reset intake if the app was offline during midnight
        const lastAccess = await getLastAccessDate();
        if (lastAccess && lastAccess < today) {
          try {
            await fetch(`${API_URL}/api/intake/reset`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                user_id: 'default',
                date: lastAccess
              })
            });
          } catch (error) {
            console.error('Error resetting intake:', error);
          }
        }

        await saveLastAccessDate(today);
        loadTodayIntake();
      }
    };

    // Check immediately
    checkDateChange();

    // Set up check every minute
    const interval = setInterval(checkDateChange, 60000);

    return () => clearInterval(interval);
  }, [currentDate]);

  const handleAdd = async (amount) => {
    // Save to backend first
    await saveIntakeToBackend(amount);
    
    // Then reload the correct value from backend
    await loadTodayIntake();

    // Publish an explicit sync signal so other open instances reload authoritative state
    try {
      const key = 'water-sync-state-v1';
      const payload = { inst: instanceIdRef.current, ts: Date.now(), reload: true };
      try { if ('BroadcastChannel' in window) { const bc = new BroadcastChannel(key); bc.postMessage(payload); bc.close(); } } catch (e) {}
      try { localStorage.setItem(key, JSON.stringify(payload)); } catch (e) {}
    } catch (e) {}
    
    setShowCustom(false);
    // Reset the notification countdown: schedule next notification 60 minutes from now
    try {
      const ms = 60 * 60 * 1000;
      if (typeof schedulerTimeoutRef !== 'undefined' && schedulerTimeoutRef && schedulerTimeoutRef.current) {
        clearTimeout(schedulerTimeoutRef.current);
      }
      // Schedule next after 60 minutes; it will start the regular hourly interval after firing
      const t = setTimeout(() => {
        if (!(waterTarget && intake >= waterTarget)) queueSystemNotification();
        // start hourly interval after this
        try { if (schedulerIntervalRef.current) clearInterval(schedulerIntervalRef.current); } catch (e) {}
        schedulerIntervalRef.current = setInterval(() => { if (!(waterTarget && intake >= waterTarget)) queueSystemNotification(); }, 60 * 60 * 1000);
      }, ms);
      schedulerTimeoutRef.current = t;
    } catch (e) {
      console.error('Failed to reset scheduler after drinking:', e);
    }
  };



  const percent = waterTarget ? Math.min(100, Math.round((intake / waterTarget) * 100)) : 0;

  return (
    <div className="app-dark-bg">
      <header className="header">
        <h1>Water Intake Tracker</h1>
      </header>
      {/* Inline toast fallback */}
      {toast.visible && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: '#222', color: '#fff', padding: '0.8rem 1rem', borderRadius: '0.6rem', zIndex: 3000, boxShadow: '0 6px 20px rgba(0,0,0,0.4)' }}>
          {toast.message}
        </div>
      )}
      <main>
        <h2>Today</h2>
        {isLoading ? (
          <div className="loading-placeholder">
            Loading...
          </div>
        ) : (
          <>
        {waterTarget !== null && (
          <div className="water-target-info">
            <span className="info-icon">i</span>
            Water Target: {editingTarget ? (
              <>
                <input
                  type="number"
                  min={100}
                  max={10000}
                  value={waterTarget}
                  onChange={e => {
                    isUserChange.current = true; // Mark that this is a user change
                    setWaterTarget(Number(e.target.value));
                  }}
                  className="target-input"
                  style={{ width: 70 }}
                /> ml
                <button className="save-btn" onClick={() => setEditingTarget(false)}>OK</button>
              </>
            ) : (
              <>
                {waterTarget} ml
                <button className="edit-btn" onClick={() => setEditingTarget(true)}>edit</button>
              </>
            )}
          </div>
        )}
        <div className="progress-circle">
          <svg width="220" height="220">
            <circle cx="110" cy="110" r="90" stroke="#222b3a" strokeWidth="20" fill="none" />
            <circle
              cx="110" cy="110" r="90"
              stroke="#2196f3"
              strokeWidth="20"
              fill="none"
              strokeDasharray={2 * Math.PI * 90}
              strokeDashoffset={2 * Math.PI * 90 * (1 - percent / 100)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.5s' }}
            />
          </svg>
          <div className="progress-center">
            <div className="progress-amount">{intake} ml</div>
            <div className="progress-percent">{percent} %</div>
          </div>
        </div>
        <div className="add-portion-label">+ Add a Portion of Water</div>
        <div className="portion-buttons">
          <button className="portion-btn" onClick={() => handleAdd(CUP_ML)}>
            <span role="img" aria-label="cup">🥤</span> CUP {CUP_ML}ml
          </button>
          <button className="portion-btn" onClick={() => handleAdd(BOTTLE_ML)}>
            <span role="img" aria-label="bottle">🫙</span> BOTTLE {BOTTLE_ML}ml
          </button>
          <button className="portion-btn special" onClick={() => setShowCustom(v => !v)}>
            <span role="img" aria-label="other">💧</span> SOMETHING ELSE
          </button>
        </div>
        {/* Test notification button removed per user request */}
        {showCustom && (
          <div className="custom-popup" onClick={() => setShowCustom(false)}>
            <div className="custom-popup-inner" onClick={e => e.stopPropagation()}>
              <div className="custom-popup-title">Choose Amount</div>
              {CUSTOM_OPTIONS.map(opt => (
                <button key={opt.value} className="custom-option" onClick={() => { handleAdd(opt.value); setShowCustom(false); }}>
                  <span>{opt.icon}</span> {opt.label}
                </button>
              ))}
              <button className="close-popup" onClick={() => setShowCustom(false)}>Close</button>
            </div>
          </div>
        )}
        {showCongrats && (
          <>
            {/* Confetti */}
            {[...Array(20)].map((_, i) => (
              <div 
                key={i} 
                className="confetti" 
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${2 + Math.random() * 2}s`
                }}
              />
            ))}
            <div className="congrats-bar">
              <div className="congrats-content">
                Congrats, You Reached Your Water Intake Goal!
              </div>
              <button className="yay-btn" onClick={markCelebrationAsSeen}>
                YAY! 🎉
              </button>
            </div>
          </>
        )}
        {/* Test button removed in production — host notifications and scheduler remain */}
        </>
        )}
      </main>
    </div>
  );
}

export default App;
