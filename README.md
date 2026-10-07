# 🫀 HealthPulse Analytics Platform

A health analytics and DBMS platform that processes continuous biometric telemetry from wearable devices (steps walked, calories burned, and sleep duration), computes aggregate activity patterns, benchmarks performance, and flags dormant users for re-engagement.

---

## 🚀 Key Features

1. **Relational Database Management (DBMS Core)**:
   - Structured schema with `Users` and `HealthLogs` tables with relational integrity and foreign keys.
   - Clean indexing on `user_id` and `log_date`.
   - Complete SQL reference in [`backend/schema.sql`](backend/schema.sql).

2. **Analytical Insights & Queries**:
   - **Daily Activity Patterns**: Calculates active user count, average steps, calories, and sleep duration grouped by date.
   - **User Performance Benchmarks**: Lifetime averages of steps, calories, and sleep per user.
   - **Activity Champions (Leaderboard)**: Top active users ranked by aggregate volume of steps and calories.
   - **Dormant & Inactive User Detection**: Identifies users who have not synced data in 7, 14, or 30+ days (or who have never synced), with direct nudge triggers.

3. **Dual Execution Engine**:
   - **Direct Browser WASM Engine**: Runs the full SQLite relational engine inside the browser using `sql.js` WebAssembly. No Node.js or database installation required to view and test!
   - **Node.js / Express REST API**: Ready-to-run Express server in `backend/` serving `/api/stats`, `/api/daily-activity`, `/api/user-averages`, `/api/most-active`, and `/api/inactive-users`.

4. **Interactive Dashboard**:
   - High-impact dark mode with glassmorphic cards and ambient lighting.
   - Interactive trend charts powered by Chart.js (Daily steps & active loggers, sleep vs calories correlation).
   - Live Wearable Telemetry Sync modal to inject new data points on the fly.
   - Built-in SQL Query Inspector drawer to inspect and copy relational queries.

---

## 📂 Project Structure

```
ProjectDbms/
│
├── index.html           # Main HealthPulse Analytics Dashboard
├── styles.css           # Modern CSS design system & glassmorphism
├── app.js               # Client controller, SQL.js WASM engine & Chart.js logic
├── README.md            # Comprehensive documentation
│
└── backend/
    ├── db.js            # Database connection & table initializer
    ├── route.js         # Analytical REST API route handlers
    ├── server.js        # Express web server & static file host
    ├── package.json     # Node.js dependencies & scripts
    └── schema.sql       # Pure SQL DDL, DML seed, and analytical queries
```

---

## 🏃 Quick Start Guide

### Option 1: Instant Local View (Recommended)
You can view the dashboard immediately by running Python's built-in HTTP server:
```bash
python -m http.server 3000
```
Open **[http://localhost:3000](http://localhost:3000)** in any web browser.

### Option 2: Run with Node.js & Express API Backend
If you have Node.js installed:
```bash
cd backend
npm install
npm start
```
The server will start on **http://localhost:5000**, with API routes mounted under `/api/`.
Open **[http://localhost:5000](http://localhost:5000)** to view the dashboard connected directly to the Express backend.

---

## 📊 SQL Analytics Queries Reference

### 1. Daily Activity Patterns
```sql
SELECT
    log_date,
    COUNT(DISTINCT user_id) AS active_users,
    ROUND(AVG(steps), 2) AS avg_steps,
    ROUND(AVG(calories), 2) AS avg_calories,
    ROUND(AVG(sleep_hours), 2) AS avg_sleep
FROM HealthLogs
GROUP BY log_date
ORDER BY log_date ASC;
```

### 2. User Performance Averages
```sql
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
```

### 3. Activity Champions Leaderboard
```sql
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
```

### 4. Inactive Users Identification
```sql
SELECT
    u.user_id,
    u.name,
    u.age,
    MAX(h.log_date) AS last_active,
    CASE 
      WHEN MAX(h.log_date) IS NULL THEN 'Never Synced'
      ELSE CAST(julianday((SELECT MAX(log_date) FROM HealthLogs)) - julianday(MAX(h.log_date)) AS INTEGER) || ' days ago'
    END AS days_inactive
FROM Users u
LEFT JOIN HealthLogs h ON u.user_id = h.user_id
GROUP BY u.user_id, u.name, u.age
HAVING last_active IS NULL 
   OR last_active < DATE((SELECT MAX(log_date) FROM HealthLogs), '-14 day')
ORDER BY last_active ASC;
```
