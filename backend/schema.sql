-- ============================================================================
-- HealthPulse Analytics Platform: Database Schema & Analytics Queries
-- ============================================================================

-- 1. Table: Users
CREATE TABLE IF NOT EXISTS Users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER CHECK(age > 0)
);

-- 2. Table: HealthLogs (Wearable telemetry streams)
CREATE TABLE IF NOT EXISTS HealthLogs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    log_date DATE NOT NULL,
    steps INTEGER NOT NULL CHECK(steps >= 0),
    calories INTEGER NOT NULL CHECK(calories >= 0),
    sleep_hours REAL NOT NULL CHECK(sleep_hours >= 0 AND sleep_hours <= 24),
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- Indexing for performance optimization
CREATE INDEX IF NOT EXISTS idx_healthlogs_user_id ON HealthLogs(user_id);
CREATE INDEX IF NOT EXISTS idx_healthlogs_date ON HealthLogs(log_date);

-- ============================================================================
-- SEED DATA
-- ============================================================================

INSERT INTO Users (user_id, name, age) VALUES
(1, 'Alice', 25),
(2, 'Bob', 32),
(3, 'Charlie', 29),
(4, 'Ajay', 35),
(5, 'Sonam', 41),
(6, 'Jagmohan', 27),
(7, 'Vivek', 38),
(8, 'Farhan', 22);

INSERT INTO HealthLogs (log_id, user_id, log_date, steps, calories, sleep_hours) VALUES
(1, 1, '2026-09-01', 8000, 320, 7.2),
(2, 1, '2026-09-02', 9200, 360, 7.0),
(3, 1, '2026-09-03', 10000, 390, 7.5),
(4, 1, '2026-09-04', 8700, 340, 7.1),
(5, 2, '2026-09-01', 4000, 180, 6.0),
(6, 2, '2026-09-03', 4500, 190, 6.2),
(7, 2, '2026-09-06', 3000, 160, 5.8),
(8, 3, '2026-09-01', 12000, 500, 8.1),
(9, 3, '2026-09-02', 11000, 480, 7.9),
(10, 3, '2026-09-03', 12500, 520, 8.0),
(11, 3, '2026-09-04', 13000, 540, 8.3),
(12, 4, '2026-09-10', 3500, 160, 5.6),
(13, 4, '2026-09-15', 3000, 150, 5.5),
(14, 5, '2026-09-01', 6500, 280, 6.8),
(15, 5, '2026-09-02', 7000, 300, 6.9),
(16, 5, '2026-09-05', 7200, 310, 7.0),
(17, 6, '2026-09-01', 9000, 360, 7.4),
(18, 6, '2026-09-02', 9100, 370, 7.6),
(19, 6, '2026-09-03', 8800, 350, 7.3),
(20, 7, '2026-09-20', 5000, 220, 6.2),
(21, 7, '2026-09-04', 4800, 210, 6.1),
(22, 8, '2026-09-06', 7500, 310, 7.0);

-- ============================================================================
-- CORE ANALYTICAL QUERIES
-- ============================================================================

-- Query 1: Daily Activity Summary
-- Groups logs by date, aggregates active users count, average steps, calories, and sleep.
SELECT
    log_date,
    COUNT(DISTINCT user_id) AS active_users,
    ROUND(AVG(steps), 2) AS avg_steps,
    ROUND(AVG(calories), 2) AS avg_calories,
    ROUND(AVG(sleep_hours), 2) AS avg_sleep
FROM HealthLogs
GROUP BY log_date
ORDER BY log_date ASC;

-- Query 2: User Averages & Benchmarking
-- Computes lifetime averages of steps, calories, and sleep per user.
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

-- Query 3: Most Active Users (Leaderboard)
-- Sums total steps and calories burned to produce overall activity rankings.
SELECT
    u.user_id,
    u.name,
    COUNT(h.log_id) AS days_tracked,
    SUM(h.steps) AS total_steps,
    SUM(h.calories) AS total_calories,
    ROUND(AVG(h.steps), 0) AS daily_step_avg
FROM Users u
JOIN HealthLogs h ON u.user_id = h.user_id
GROUP BY u.user_id, u.name
ORDER BY total_steps DESC;

-- Query 4: Inactive Users Identification
-- Flags users whose last sync was over 14/30 days ago, or who never synced.
SELECT
    u.user_id,
    u.name,
    u.age,
    MAX(h.log_date) AS last_active_date,
    CASE 
        WHEN MAX(h.log_date) IS NULL THEN 'Never Logged'
        ELSE CAST(julianday((SELECT MAX(log_date) FROM HealthLogs)) - julianday(MAX(h.log_date)) AS INTEGER) || ' days ago'
    END AS dormancy_duration
FROM Users u
LEFT JOIN HealthLogs h ON u.user_id = h.user_id
GROUP BY u.user_id, u.name, u.age
HAVING last_active_date IS NULL 
    OR last_active_date < DATE((SELECT MAX(log_date) FROM HealthLogs), '-14 day')
ORDER BY last_active_date ASC;
