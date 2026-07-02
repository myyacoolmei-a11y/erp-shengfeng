import app from "./app";
import { logger } from "./lib/logger";
import { seedDefaultUser, ensureSuperAdmin } from "./routes/auth";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default to 3000 so the app works out-of-the-box without extra env config
const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Static file serving (production) ──────────────────────────────────────
// The Vite build writes to dist/public; at runtime this file is in
// dist/server/main.mjs, so "../public" correctly points to dist/public.
const publicDir = path.join(__dirname, "../public");

// Serve Vite-built assets (fallthrough so unmatched paths hit SPA catch-all below)
app.use(express.static(publicDir, { maxAge: "1y", immutable: true, fallthrough: true }));

// SPA catch-all: every non-API request returns index.html so that
// client-side routing (Wouter) works on hard refresh / direct URL access.
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(publicDir, "index.html"));
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error starting server");
    process.exit(1);
  }

  logger.info({ port }, `Server listening — http://localhost:${port}`);

  // Create the default super_admin account on first start if the DB is empty
  await seedDefaultUser();
  // Upgrade existing "admin" account to super_admin if no super_admin exists yet
  await ensureSuperAdmin();
});
