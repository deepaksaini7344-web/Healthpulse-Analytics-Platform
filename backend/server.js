import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { initDB } from "./db.js";
import healthRoutes from "./route.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize DB promise once (supports serverless re-use and local server)
let dbPromise = null;
export function getDb() {
  if (!dbPromise) {
    dbPromise = initDB().catch((err) => {
      console.error("Database initialization failed:", err);
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// Ensure database is ready before processing API requests
app.use(async (req, res, next) => {
  try {
    await getDb();
    next();
  } catch (err) {
    res.status(500).json({ error: "Database initialization failed: " + err.message });
  }
});

// Candidate directories for static files (supports both backend-root and repo-root deployments)
const staticDirs = [
  path.resolve(__dirname, "public"),
  path.resolve(__dirname, ".."),
  path.resolve(__dirname),
];

for (const dir of staticDirs) {
  if (fs.existsSync(dir)) {
    app.use(express.static(dir));
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount API routes
app.use("/api", healthRoutes);

// Explicit root endpoint: serve index.html
app.get("/", (req, res) => {
  for (const dir of staticDirs) {
    const indexPath = path.join(dir, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  res.status(404).send("HealthPulse Analytics Platform: index.html not found.");
});

// Fallback for frontend assets / SPA refresh
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path === "/health") {
    return next();
  }
  for (const dir of staticDirs) {
    const indexPath = path.join(dir, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  next();
});

// Start server
async function startServer() {
  try {
    await getDb();
    app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(` HealthPulse Analytics API is active!`);
      console.log(` Listening on: http://localhost:${PORT}`);
      console.log(` API Endpoints: http://localhost:${PORT}/api/stats`);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

startServer();

export default app;
