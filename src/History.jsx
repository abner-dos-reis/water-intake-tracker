import { useState } from 'react';
import './History.css';

// Example history data (to be replaced with real backend data in the future)
const exampleHistory = [
  { date: '2025-09-07', total: 2100 },
  { date: '2025-09-08', total: 1800 },
  { date: '2025-09-09', total: 2200 },
  { date: '2025-09-11', total: 2000 },
  { date: '2025-09-12', total: 2100 },
  { date: '2025-09-14', total: 2000 },
  { date: '2025-09-15', total: 2100 },
];

function getMonthDays(year, month) {
  const days = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

function History({ waterTarget = 2000 }) {
  const [selected, setSelected] = useState(null);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const days = getMonthDays(year, month);
  const historyMap = Object.fromEntries(exampleHistory.map(h => [h.date, h.total]));

  return (
    <div className="history-bg">
      <header className="header">
        <h1>Water Intake Tracker</h1>
      </header>
      <main>
        <h2>Water intake history</h2>
        <div className="calendar">
          <div className="calendar-header">
            <span>September {year}</span>
          </div>
          <div className="calendar-grid">
            {[...Array(new Date(year, month, 1).getDay()).keys()].map(i => (
              <div key={'empty-' + i} className="calendar-cell empty"></div>
            ))}
            {days.map(day => {
              const dateStr = day.toISOString().slice(0, 10);
              const reached = historyMap[dateStr] >= waterTarget;
              return (
                <div
                  key={dateStr}
                  className={`calendar-cell${reached ? ' reached' : ''}${selected === dateStr ? ' selected' : ''}`}
                  onClick={() => setSelected(dateStr)}
                >
                  {day.getDate()}
                </div>
              );
            })}
          </div>
        </div>
        <div className="history-graph">
          <div className="graph-label">Select a valid date</div>
          <svg width="100%" height="120" viewBox="0 0 320 120">
            {/* Eixo Y */}
            <line x1="30" y1="10" x2="30" y2="110" stroke="#444" />
            {/* Eixo X */}
            <line x1="30" y1="110" x2="310" y2="110" stroke="#444" />
            {/* Pontos e linhas */}
            {exampleHistory.map((h, i, arr) => {
              if (i === 0) return null;
              const prev = arr[i - 1];
              const x1 = 30 + ((new Date(prev.date).getDate() - 1) * 10);
              const y1 = 110 - (prev.total / 2200) * 100;
              const x2 = 30 + ((new Date(h.date).getDate() - 1) * 10);
              const y2 = 110 - (h.total / 2200) * 100;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4faaff" strokeWidth="2" />;
            })}
            {exampleHistory.map((h, i) => {
              const x = 30 + ((new Date(h.date).getDate() - 1) * 10);
              const y = 110 - (h.total / 2200) * 100;
              return <circle key={h.date} cx={x} cy={y} r="5" fill="#fff" stroke="#2196f3" strokeWidth="2" />;
            })}
          </svg>
        </div>
      </main>
    </div>
  );
}

export default History;
