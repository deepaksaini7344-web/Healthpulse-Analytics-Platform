import initSqlJs from "sql.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;

export async function initDB() {
  const SQL = await initSqlJs({
    locateFile: (file) => {
      const localPath = path.resolve(__dirname, "node_modules/sql.js/dist", file);
      if (fs.existsSync(localPath)) {
        return localPath;
      }
      return path.resolve(__dirname, "../node_modules/sql.js/dist", file);
    },
  });

  db = new SQL.Database();

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS Users (
      user_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER
    );

    CREATE TABLE IF NOT EXISTS HealthLogs (
      log_id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      log_date DATE NOT NULL,
      steps INTEGER NOT NULL,
      calories INTEGER NOT NULL,
      sleep_hours REAL NOT NULL,
      FOREIGN KEY (user_id) REFERENCES Users(user_id)
    );
  `);

  // Insert seed users
  const users = [
    [1, "Alice", 25],
    [2, "Bob", 32],
    [3, "Charlie", 29],
    [4, "Ajay", 35],
    [5, "Sonam", 41],
    [6, "Jagmohan", 27],
    [7, "Vivek", 38],
    [8, "Farhan", 22],
  ];

  const insertUser = db.prepare(
    "INSERT INTO Users (user_id, name, age) VALUES (?, ?, ?)"
  );
  users.forEach((row) => insertUser.run(row));
  insertUser.free();

  // Insert seed health logs
  const logs = [
    [1, 1, "2026-09-01", 8000, 320, 7.2],
    [2, 1, "2026-09-02", 9200, 360, 7.0],
    [3, 1, "2026-09-03", 10000, 390, 7.5],
    [4, 1, "2026-09-04", 8700, 340, 7.1],

    [5, 2, "2026-09-01", 4000, 180, 6.0],
    [6, 2, "2026-09-03", 4500, 190, 6.2],
    [7, 2, "2026-09-06", 3000, 160, 5.8],

    [8, 3, "2026-09-01", 12000, 500, 8.1],
    [9, 3, "2026-09-02", 11000, 480, 7.9],
    [10, 3, "2026-09-03", 12500, 520, 8.0],
    [11, 3, "2026-09-04", 13000, 540, 8.3],

    [12, 4, "2026-09-10", 3500, 160, 5.6],
    [13, 4, "2026-09-15", 3000, 150, 5.5],

    [14, 5, "2026-09-01", 6500, 280, 6.8],
    [15, 5, "2026-09-02", 7000, 300, 6.9],
    [16, 5, "2026-09-05", 7200, 310, 7.0],

    [17, 6, "2026-09-01", 9000, 360, 7.4],
    [18, 6, "2026-09-02", 9100, 370, 7.6],
    [19, 6, "2026-09-03", 8800, 350, 7.3],

    [20, 7, "2026-09-20", 5000, 220, 6.2],
    [21, 7, "2026-09-04", 4800, 210, 6.1],

    [22, 8, "2026-09-06", 7500, 310, 7.0],
  ];

  const insertLog = db.prepare(
    "INSERT INTO HealthLogs (log_id, user_id, log_date, steps, calories, sleep_hours) VALUES (?, ?, ?, ?, ?, ?)"
  );
  logs.forEach((row) => insertLog.run(row));
  insertLog.free();

  console.log(`Database initialized successfully with ${users.length} users and ${logs.length} health records.`);
  return db;
}

export function query(sql) {
  if (!db) {
    throw new Error("Database not initialized. Please call initDB() first.");
  }
  const r = db.exec(sql);
  return r.length ? r[0] : { columns: [], values: [] };
}

export function run(sql, params = []) {
  if (!db) {
    throw new Error("Database not initialized. Please call initDB() first.");
  }
  return db.run(sql, params);
}

export function getRawDb() {
  return db;
}