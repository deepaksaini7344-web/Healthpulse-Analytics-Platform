import express from "express";
import cors from "cors";
import path from "path";
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

// Serve frontend static files from root directory if served together
app.use(express.static(path.resolve(__dirname, "..")));

// Mount API routes
app.use("/api", healthRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server after DB is ready
async function startServer() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(` HealthPulse Analytics API is active!`);
      console.log(` Listening on: http://localhost:${PORT}`);
      console.log(` API Endpoints: http://localhost:${PORT}/api/stats`);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error("Failed to initialize database or start server:", error);
    process.exit(1);
  }
}

startServer();
