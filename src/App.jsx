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
      
      // If last access is from a previous day, reset the intake
      if (lastAccess && lastAccess < today) {
        setIntake(0);
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
      
      // Save current access date
      await saveLastAccessDate(today);
      
      await loadWaterTarget();
      await loadTodayIntake();
      setIsLoading(false);
    };
    loadInitialData();
  }, []);

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
    
    setShowCustom(false);
  };



  const percent = waterTarget ? Math.min(100, Math.round((intake / waterTarget) * 100)) : 0;

  return (
    <div className="app-dark-bg">
      <header className="header">
        <h1>Water Intake Tracker</h1>
      </header>
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
        {showCustom && (
          <div className="custom-popup" onClick={() => setShowCustom(false)}>
            <div className="custom-popup-inner" onClick={e => e.stopPropagation()}>
              <div className="custom-popup-title">Choose Amount</div>
              {CUSTOM_OPTIONS.map(opt => (
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
        </>
        )}
      </main>
    </div>
  );
}

export default App;
