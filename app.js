/**
 * HealthPulse Analytics Platform - Client-Side Controller & DBMS Engine
 * Seamless Dual-Mode: Uses Express Backend API when online, or embedded SQLite WASM.
 */

// Application State
const state = {
  engineMode: 'WASM', // 'API' or 'WASM'
  apiBaseUrl: 'http://localhost:5000/api',
  db: null,
  users: [],
  charts: {
    dailyActivity: null,
    sleepCalories: null,
  },
  currentThresholdDays: 14,
};

// Seed Users for local SQLite WASM Engine fallback
const SEED_USERS = [
  [1, 'Alice', 25],
  [2, 'Bob', 32],
  [3, 'Charlie', 29],
  [4, 'Ajay', 35],
  [5, 'Sonam', 41],
  [6, 'Jagmohan', 27],
  [7, 'Vivek', 38],
  [8, 'Farhan', 22],
];

// Seed Health Logs for local SQLite WASM Engine fallback
const SEED_LOGS = [
  [1, 1, '2026-09-01', 8000, 320, 7.2],
  [2, 1, '2026-09-02', 9200, 360, 7.0],
  [3, 1, '2026-09-03', 10000, 390, 7.5],
  [4, 1, '2026-09-04', 8700, 340, 7.1],

  [5, 2, '2026-09-01', 4000, 180, 6.0],
  [6, 2, '2026-09-03', 4500, 190, 6.2],
  [7, 2, '2026-09-06', 3000, 160, 5.8],

  [8, 3, '2026-09-01', 12000, 500, 8.1],
  [9, 3, '2026-09-02', 11000, 480, 7.9],
  [10, 3, '2026-09-03', 12500, 520, 8.0],
  [11, 3, '2026-09-04', 13000, 540, 8.3],

  [12, 4, '2026-09-10', 3500, 160, 5.6],
  [13, 4, '2026-09-15', 3000, 150, 5.5],

  [14, 5, '2026-09-01', 6500, 280, 6.8],
  [15, 5, '2026-09-02', 7000, 300, 6.9],
  [16, 5, '2026-09-05', 7200, 310, 7.0],

  [17, 6, '2026-09-01', 9000, 360, 7.4],
  [18, 6, '2026-09-02', 9100, 370, 7.6],
  [19, 6, '2026-09-03', 8800, 350, 7.3],

  [20, 7, '2026-09-20', 5000, 220, 6.2],
  [21, 7, '2026-09-04', 4800, 210, 6.1],

  [22, 8, '2026-09-06', 7500, 310, 7.0],
];

// Helper: Convert SQLite WASM result to standard array of objects
function formatSqlResult(res) {
  if (!res || !res.length || !res[0].values) return [];
  const { columns, values } = res[0];
  return values.map((row) =>
    Object.fromEntries(row.map((val, idx) => [columns[idx], val]))
  );
}

// Initialize Local SQLite WASM Database
async function initLocalWasmDb() {
  if (typeof initSqlJs === 'undefined') {
    throw new Error('SQL.js library not loaded.');
  }

  const SQL = await initSqlJs({
    locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
  });

  state.db = new SQL.Database();

  // Create Tables
  state.db.run(`
    CREATE TABLE IF NOT EXISTS Users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER
    );

    CREATE TABLE IF NOT EXISTS HealthLogs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      log_date DATE NOT NULL,
      steps INTEGER NOT NULL,
      calories INTEGER NOT NULL,
      sleep_hours REAL NOT NULL,
      FOREIGN KEY (user_id) REFERENCES Users(user_id)
    );
  `);

  // Insert seed users
  const stmtUser = state.db.prepare('INSERT INTO Users (user_id, name, age) VALUES (?, ?, ?)');
  SEED_USERS.forEach((u) => stmtUser.run(u));
  stmtUser.free();

  // Insert seed logs
  const stmtLog = state.db.prepare(
    'INSERT INTO HealthLogs (log_id, user_id, log_date, steps, calories, sleep_hours) VALUES (?, ?, ?, ?, ?, ?)'
  );
  SEED_LOGS.forEach((l) => stmtLog.run(l));
  stmtLog.free();

  console.log('Embedded SQLite WASM initialized with seed data.');
}

// Execute Query via Local WASM or Backend API
async function runQuery(type, params = {}) {
  // Check if API is available
  if (state.engineMode === 'API') {
    try {
      let url = `${state.apiBaseUrl}/${type}`;
      const queryParams = new URLSearchParams(params).toString();
      if (queryParams) url += `?${queryParams}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API fetch failed, falling back to local SQLite WASM engine:', err);
      state.engineMode = 'WASM';
      updateEngineBadge();
    }
  }

  // Fallback / Standalone: Local SQLite WASM execution
  if (!state.db) {
    await initLocalWasmDb();
  }

  let sql = '';
  switch (type) {
    case 'stats':
      sql = `
        SELECT 
          (SELECT COUNT(*) FROM Users) AS total_users,
          (SELECT COUNT(*) FROM HealthLogs) AS total_logs,
          (SELECT COALESCE(SUM(steps), 0) FROM HealthLogs) AS total_steps,
          (SELECT ROUND(AVG(calories), 1) FROM HealthLogs) AS avg_calories,
          (SELECT ROUND(AVG(sleep_hours), 1) FROM HealthLogs) AS avg_sleep,
          (SELECT COUNT(DISTINCT user_id) FROM HealthLogs) AS active_loggers;
      `;
      break;

    case 'daily-activity':
      sql = `
        SELECT
          log_date,
          COUNT(DISTINCT user_id) AS active_users,
          ROUND(AVG(steps), 2) AS avg_steps,
          ROUND(AVG(calories), 2) AS avg_calories,
          ROUND(AVG(sleep_hours), 2) AS avg_sleep
        FROM HealthLogs
        GROUP BY log_date
        ORDER BY log_date ASC;
      `;
      break;

    case 'user-averages':
      sql = `
        SELECT
          u.user_id,
          u.name,
          u.age,
          COUNT(h.log_id) AS total_logged_days,
          ROUND(AVG(h.steps), 2) AS avg_steps,
          ROUND(AVG(h.calories), 2) AS avg_calories,
          ROUND(AVG(h.sleep_hours), 2) AS avg_sleep
        FROM Users u
        JOIN HealthLogs h ON u.user_id = h.user_id
        GROUP BY u.user_id, u.name, u.age
        ORDER BY avg_steps DESC;
      `;
      break;

    case 'most-active':
      sql = `
        SELECT
          u.user_id,
          u.name,
          COUNT(h.log_id) AS log_count,
          SUM(h.steps) AS total_steps,
          SUM(h.calories) AS total_calories,
          ROUND(AVG(h.steps), 0) AS daily_avg_steps
        FROM Users u
        JOIN HealthLogs h ON u.user_id = h.user_id
        GROUP BY u.user_id, u.name
        ORDER BY total_steps DESC;
      `;
      break;

    case 'inactive-users':
      const days = params.days || state.currentThresholdDays || 14;
      sql = `
        SELECT
          u.user_id,
          u.name,
          u.age,
          MAX(h.log_date) AS last_active,
          (SELECT MAX(log_date) FROM HealthLogs) AS platform_latest_date,
          CASE 
            WHEN MAX(h.log_date) IS NULL THEN 999
            ELSE CAST(julianday((SELECT MAX(log_date) FROM HealthLogs)) - julianday(MAX(h.log_date)) AS INTEGER)
          END AS days_inactive
        FROM Users u
        LEFT JOIN HealthLogs h ON u.user_id = h.user_id
        GROUP BY u.user_id, u.name, u.age
        HAVING last_active IS NULL 
           OR last_active < DATE((SELECT MAX(log_date) FROM HealthLogs), '-${days} day')
        ORDER BY days_inactive DESC;
      `;
      break;

    case 'users':
      sql = `SELECT user_id, name, age FROM Users ORDER BY user_id ASC;`;
      break;

    case 'health-logs':
      if (params.user_id) {
        sql = `
          SELECT h.log_id, h.user_id, u.name, h.log_date, h.steps, h.calories, h.sleep_hours
          FROM HealthLogs h
          JOIN Users u ON h.user_id = u.user_id
          WHERE h.user_id = ${parseInt(params.user_id, 10)}
          ORDER BY h.log_date DESC;
        `;
      } else {
        sql = `
          SELECT h.log_id, h.user_id, u.name, h.log_date, h.steps, h.calories, h.sleep_hours
          FROM HealthLogs h
          JOIN Users u ON h.user_id = u.user_id
          ORDER BY h.log_date DESC;
        `;
      }
      break;

    default:
      throw new Error(`Unknown query type: ${type}`);
  }

  const rawRes = state.db.exec(sql);
  const formatted = formatSqlResult(rawRes);
  if (type === 'stats') return formatted[0] || {};
  return formatted;
}

// Check Backend Availability
async function detectBackend() {
  try {
    const res = await fetch(`${state.apiBaseUrl}/stats`, { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      state.engineMode = 'API';
    } else {
      state.engineMode = 'WASM';
    }
  } catch (e) {
    state.engineMode = 'WASM';
  }
  updateEngineBadge();
}

// Update UI Badge for Active Engine
function updateEngineBadge() {
  const badgeText = document.getElementById('engineStatusText');
  const badge = document.getElementById('engineBadge');
  if (state.engineMode === 'API') {
    badgeText.textContent = 'Node/Express API Online';
    badge.title = 'Connected to http://localhost:5000/api';
    badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  } else {
    badgeText.textContent = 'SQLite WASM Core (Client)';
    badge.title = 'Embedded Browser SQLite Engine';
    badge.style.borderColor = 'rgba(6, 182, 212, 0.4)';
  }
}

// Render Platform KPI Metrics
async function renderKpis() {
  try {
    const stats = await runQuery('stats');
    const inactiveUsers = await runQuery('inactive-users', { days: state.currentThresholdDays });

    document.getElementById('valTotalSteps').textContent = Number(stats.total_steps || 0).toLocaleString();
    document.getElementById('valAvgCalories').textContent = `${stats.avg_calories || 0} kcal`;
    document.getElementById('valAvgSleep').textContent = `${stats.avg_sleep || 0} hrs`;

    const inactiveCount = inactiveUsers.length;
    document.getElementById('valInactiveUsers').textContent = inactiveCount;
    document.getElementById('headerInactiveCount').textContent = inactiveCount;
  } catch (err) {
    console.error('Error rendering KPIs:', err);
  }
}

// Render Visual Charts
async function renderCharts() {
  const dailyData = await runQuery('daily-activity');

  const dates = dailyData.map((d) => d.log_date);
  const avgSteps = dailyData.map((d) => d.avg_steps);
  const activeUsers = dailyData.map((d) => d.active_users);
  const avgCalories = dailyData.map((d) => d.avg_calories);
  const avgSleep = dailyData.map((d) => d.avg_sleep);

  // 1. Daily Activity Chart (Steps & Active Users)
  const ctxDaily = document.getElementById('dailyActivityChart').getContext('2d');
  if (state.charts.dailyActivity) state.charts.dailyActivity.destroy();

  state.charts.dailyActivity = new Chart(ctxDaily, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Avg Steps Walked',
          data: avgSteps,
          backgroundColor: 'rgba(16, 185, 129, 0.65)',
          borderColor: '#10b981',
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'ySteps',
        },
        {
          label: 'Active Users',
          data: activeUsers,
          type: 'line',
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.15)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointBackgroundColor: '#06b6d4',
          pointRadius: 4,
          yAxisID: 'yUsers',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } } },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#fff',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans' } },
        },
        ySteps: {
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#10b981' },
          title: { display: true, text: 'Steps Walked', color: '#10b981' },
        },
        yUsers: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#06b6d4', stepSize: 1 },
          title: { display: true, text: 'Active Loggers', color: '#06b6d4' },
        },
      },
    },
  });

  // 2. Sleep vs Calories Correlation Chart
  const ctxSleep = document.getElementById('sleepCaloriesChart').getContext('2d');
  if (state.charts.sleepCalories) state.charts.sleepCalories.destroy();

  state.charts.sleepCalories = new Chart(ctxSleep, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Avg Calories Burned (kcal)',
          data: avgCalories,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          yAxisID: 'yCalories',
        },
        {
          label: 'Avg Sleep Duration (hrs)',
          data: avgSleep,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          fill: false,
          tension: 0.35,
          borderWidth: 2,
          yAxisID: 'ySleep',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } } },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#fff',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b' },
        },
        yCalories: {
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#f59e0b' },
          title: { display: true, text: 'Calories (kcal)', color: '#f59e0b' },
        },
        ySleep: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#8b5cf6' },
          title: { display: true, text: 'Sleep (hours)', color: '#8b5cf6' },
        },
      },
    },
  });
}

// Render Leaderboard (Most Active Users)
async function renderLeaderboard() {
  const activeUsers = await runQuery('most-active');
  const tbody = document.getElementById('leaderboardBody');
  tbody.innerHTML = '';

  const maxSteps = activeUsers.length ? Math.max(...activeUsers.map((u) => u.total_steps)) : 1;

  activeUsers.forEach((user, index) => {
    const rank = index + 1;
    let rankBadgeClass = 'rank-other';
    if (rank === 1) rankBadgeClass = 'rank-1';
    else if (rank === 2) rankBadgeClass = 'rank-2';
    else if (rank === 3) rankBadgeClass = 'rank-3';

    const percent = Math.round((user.total_steps / maxSteps) * 100);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-badge ${rankBadgeClass}">${rank}</span></td>
      <td>
        <div class="user-cell">
          <div class="user-avatar">${user.name.charAt(0)}</div>
          <div><strong>${user.name}</strong> <span style="font-size:0.75rem; color:#64748b;">(ID: ${user.user_id})</span></div>
        </div>
      </td>
      <td><strong>${Number(user.total_steps).toLocaleString()}</strong></td>
      <td><span style="color:#f59e0b;">${Number(user.total_calories).toLocaleString()} kcal</span></td>
      <td>${Number(user.daily_avg_steps).toLocaleString()} / day</td>
      <td>
        <div class="progress-bar-bg" title="${percent}% of top performer">
          <div class="progress-bar-fill" style="width: ${percent}%;"></div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render User Performance Benchmarks
async function renderUserAverages() {
  const averages = await runQuery('user-averages');
  const tbody = document.getElementById('averagesBody');
  tbody.innerHTML = '';

  averages.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${u.user_id}</td>
      <td><strong>${u.name}</strong></td>
      <td>${u.age} yrs</td>
      <td><span class="text-emerald font-semibold">${Number(u.avg_steps).toLocaleString()}</span></td>
      <td><span class="text-amber font-semibold">${u.avg_calories} kcal</span></td>
      <td><span class="text-violet font-semibold">${u.avg_sleep} hrs</span></td>
      <td>
        <button class="btn-table-action" onclick="viewUserHistory(${u.user_id}, '${u.name}')">
          History
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Inactive Users Watchdog
async function renderInactiveUsers() {
  const threshold = state.currentThresholdDays;
  const inactives = await runQuery('inactive-users', { days: threshold });
  const tbody = document.getElementById('inactiveBody');
  tbody.innerHTML = '';

  if (inactives.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #10b981; padding: 24px;">
          ✓ All registered participants are currently active within ${threshold} days!
        </td>
      </tr>
    `;
    return;
  }

  inactives.forEach((user) => {
    const isNever = !user.last_active;
    const daysText = isNever ? 'Never Synced' : `${user.days_inactive} days dormant`;

    const statusBadge = isNever
      ? `<span class="status-chip status-dormant">Zero Telemetry</span>`
      : user.days_inactive > 20
      ? `<span class="status-chip status-dormant">Critical Inactive</span>`
      : `<span class="status-chip status-warning">Dormant ${user.days_inactive}d</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${user.user_id}</td>
      <td>
        <div class="user-cell">
          <div class="user-avatar" style="background: rgba(244,63,94,0.15); color: #fda4af; border-color: rgba(244,63,94,0.3);">
            ${user.name.charAt(0)}
          </div>
          <div><strong>${user.name}</strong></div>
        </div>
      </td>
      <td>${user.age} yrs</td>
      <td>${user.last_active || '<span style="color:#64748b;">N/A</span>'}</td>
      <td><span style="color:#fda4af; font-weight:600;">${daysText}</span></td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn-reengage" onclick="triggerReengagement(${user.user_id}, '${user.name}')">
          Nudge User
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Populate User Selection dropdown in Modal
async function populateUserDropdown() {
  const users = await runQuery('users');
  state.users = users;
  const select = document.getElementById('formUserId');
  select.innerHTML = '';

  users.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.user_id;
    opt.textContent = `${u.name} (Age: ${u.age}, ID: #${u.user_id})`;
    select.appendChild(opt);
  });
}

// View User History Modal
window.viewUserHistory = async function (userId, userName) {
  const modal = document.getElementById('userHistoryModal');
  const title = document.getElementById('historyModalTitle');
  const tbody = document.getElementById('userHistoryBody');

  title.textContent = `Telemetry Logs for ${userName} (ID #${userId})`;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading logs...</td></tr>';
  modal.classList.add('active');

  const logs = await runQuery('health-logs', { user_id: userId });
  tbody.innerHTML = '';

  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#64748b;">No logs recorded for this user yet.</td></tr>';
    return;
  }

  logs.forEach((log) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${log.log_date}</strong></td>
      <td><span class="text-emerald">${Number(log.steps).toLocaleString()}</span></td>
      <td><span class="text-amber">${log.calories} kcal</span></td>
      <td><span class="text-violet">${log.sleep_hours} hrs</span></td>
    `;
    tbody.appendChild(tr);
  });
};

// Trigger Re-engagement Alert
window.triggerReengagement = function (userId, userName) {
  showToast(`Re-engagement notification dispatched to ${userName} (ID #${userId})!`, 'info');
};

// Handle New Wearable Log Submission
async function handleLogSubmit(e) {
  e.preventDefault();
  const userId = document.getElementById('formUserId').value;
  const logDate = document.getElementById('formLogDate').value;
  const steps = parseInt(document.getElementById('formSteps').value, 10);
  const calories = parseInt(document.getElementById('formCalories').value, 10);
  const sleep = parseFloat(document.getElementById('formSleep').value);

  if (!userId || !logDate || isNaN(steps) || isNaN(calories) || isNaN(sleep)) {
    showToast('Please fill out all fields accurately.', 'error');
    return;
  }

  try {
    if (state.engineMode === 'API') {
      const res = await fetch(`${state.apiBaseUrl}/health-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          log_date: logDate,
          steps,
          calories,
          sleep_hours: sleep,
        }),
      });
      if (!res.ok) throw new Error('API submission failed');
    } else {
      // Local SQLite WASM Insertion
      const insertSql = `
        INSERT INTO HealthLogs (user_id, log_date, steps, calories, sleep_hours)
        VALUES (?, ?, ?, ?, ?);
      `;
      state.db.run(insertSql, [userId, logDate, steps, calories, sleep]);
    }

    showToast(`Successfully logged ${steps.toLocaleString()} steps for user!`, 'success');
    document.getElementById('syncModalOverlay').classList.remove('active');
    document.getElementById('wearableLogForm').reset();
    setDefaultLogDate();

    // Refresh all components
    await refreshAll();
  } catch (err) {
    console.error('Submission error:', err);
    showToast(`Failed to record log: ${err.message}`, 'error');
  }
}

// Toast Notification System
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Copy SQL Query Snippet
window.copySql = function (elementId) {
  const code = document.getElementById(elementId).innerText;
  navigator.clipboard.writeText(code).then(() => {
    showToast('SQL query copied to clipboard!', 'success');
  });
};

// Scroll to section helper
window.scrollToSection = function (id) {
  const elem = document.getElementById(id);
  if (elem) elem.scrollIntoView({ behavior: 'smooth' });
};

// Set default date in modal to realistic current date
function setDefaultLogDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('formLogDate').value = today;
}

// Refresh all components
async function refreshAll() {
  await renderKpis();
  await renderCharts();
  await renderLeaderboard();
  await renderUserAverages();
  await renderInactiveUsers();
}

// Setup Event Listeners
function setupEventListeners() {
  // Modal triggers
  const syncModal = document.getElementById('syncModalOverlay');
  document.getElementById('openLogModalBtn').addEventListener('click', () => syncModal.classList.add('active'));
  document.getElementById('closeModalBtn').addEventListener('click', () => syncModal.classList.remove('active'));
  document.getElementById('cancelModalBtn').addEventListener('click', () => syncModal.classList.remove('active'));

  // Close User History Modal
  document.getElementById('closeHistoryModalBtn').addEventListener('click', () => {
    document.getElementById('userHistoryModal').classList.remove('active');
  });

  // SQL Inspector Drawer
  const inspector = document.getElementById('sqlInspectorDrawer');
  document.getElementById('toggleSqlInspectorBtn').addEventListener('click', () => {
    inspector.classList.toggle('open');
  });
  document.getElementById('closeInspectorBtn').addEventListener('click', () => {
    inspector.classList.remove('open');
  });

  // Inactivity threshold selector
  document.getElementById('thresholdDaysSelect').addEventListener('change', (e) => {
    state.currentThresholdDays = parseInt(e.target.value, 10);
    renderInactiveUsers();
    renderKpis();
  });

  // Form submit
  document.getElementById('wearableLogForm').addEventListener('submit', handleLogSubmit);

  // Manual Refresh Button
  document.getElementById('refreshDataBtn').addEventListener('click', async () => {
    showToast('Refreshing DBMS analytics...', 'info');
    await refreshAll();
  });
}

// Bootstrapping Platform
async function bootstrap() {
  try {
    setDefaultLogDate();
    setupEventListeners();

    // Check backend first, fallback to SQLite WASM
    await detectBackend();
    if (state.engineMode === 'WASM') {
      await initLocalWasmDb();
    }

    await populateUserDropdown();
    await refreshAll();

    console.log('HealthPulse Analytics platform initialized successfully.');
  } catch (err) {
    console.error('Fatal initialization error:', err);
    showToast(`Initialization error: ${err.message}`, 'error');
  }
}

// Kick off when DOM is ready
document.addEventListener('DOMContentLoaded', bootstrap);
