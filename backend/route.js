import express from "express";
const router = express.Router();
import { query, run } from "./db.js";

// Helper function to convert SQL.js result into clean JSON array of objects
const format = (res) => {
  if (!res || !res.values || !res.columns) return [];
  return res.values.map((row) =>
    Object.fromEntries(row.map((v, i) => [res.columns[i], v]))
  );
};

/* === BASE TABLES === */

// Fetch all users
router.get("/users", (req, res) => {
  try {
    const sql = `
      SELECT user_id, name, age
      FROM Users
      ORDER BY user_id ASC;
    `;
    res.json(format(query(sql)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch all health logs (optional filter by user_id)
router.get("/health-logs", (req, res) => {
  try {
    const { user_id } = req.query;
    let sql = `
      SELECT h.log_id, h.user_id, u.name, h.log_date, h.steps, h.calories, h.sleep_hours
      FROM HealthLogs h
      JOIN Users u ON h.user_id = u.user_id
    `;
    if (user_id) {
      sql += ` WHERE h.user_id = ${parseInt(user_id, 10)}`;
    }
    sql += ` ORDER BY h.log_date DESC, h.log_id DESC;`;
    res.json(format(query(sql)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* === ANALYTICS QUERIES === */

// 1. Overall Platform Summary / KPI Stats
router.get("/stats", (req, res) => {
  try {
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM Users) AS total_users,
        (SELECT COUNT(*) FROM HealthLogs) AS total_logs,
        (SELECT COALESCE(SUM(steps), 0) FROM HealthLogs) AS total_steps,
        (SELECT ROUND(AVG(calories), 1) FROM HealthLogs) AS avg_calories,
        (SELECT ROUND(AVG(sleep_hours), 1) FROM HealthLogs) AS avg_sleep,
        (SELECT COUNT(DISTINCT user_id) FROM HealthLogs) AS active_loggers
      ;
    `;
    const rows = format(query(sql));
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Daily activity summary (aggregation across all users per date)
router.get("/daily-activity", (req, res) => {
  try {
    const sql = `
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
    res.json(format(query(sql)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Average health metrics per user (joined)
router.get("/user-averages", (req, res) => {
  try {
    const sql = `
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
    res.json(format(query(sql)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Most active users (Leaderboard based on total steps & calories)
router.get("/most-active", (req, res) => {
  try {
    const sql = `
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
    res.json(format(query(sql)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Inactive users (dormant for 14+ / 30+ days relative to latest log or reference date)
router.get("/inactive-users", (req, res) => {
  try {
    const days = parseInt(req.query.days || "14", 10);
    // Evaluates inactivity against latest dataset date to handle historical datasets cleanly,
    // as well as users who have never logged any data.
    const sql = `
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
    res.json(format(query(sql)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* === DATA INGESTION (SIMULATE WEARABLE SYNC) === */

// Ingest a new wearable health log
router.post("/health-logs", (req, res) => {
  try {
    const { user_id, log_date, steps, calories, sleep_hours } = req.body;
    if (!user_id || !log_date || steps === undefined || calories === undefined || sleep_hours === undefined) {
      return res.status(400).json({ error: "Missing required wearable fields" });
    }

    const insertSql = `
      INSERT INTO HealthLogs (user_id, log_date, steps, calories, sleep_hours)
      VALUES (?, ?, ?, ?, ?);
    `;
    run(insertSql, [
      parseInt(user_id, 10),
      log_date,
      parseInt(steps, 10),
      parseInt(calories, 10),
      parseFloat(sleep_hours),
    ]);

    res.status(201).json({ success: true, message: "Wearable telemetry synced successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register a new user
router.post("/users", (req, res) => {
  try {
    const { name, age } = req.body;
    if (!name || !age) {
      return res.status(400).json({ error: "Name and age are required" });
    }

    const insertSql = `INSERT INTO Users (name, age) VALUES (?, ?);`;
    run(insertSql, [name, parseInt(age, 10)]);

    res.status(201).json({ success: true, message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;