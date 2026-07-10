import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { handleLineWebhook } from "./routes/lineWebhook.ts";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Production build: server runs from dist/server/ so public is at ../public
// Dev mode (tsx): server runs from server/ so public is at ../dist/public
const publicDir = (() => {
  const prodPath = path.resolve(__dirname, "../public");
  const devPath = path.resolve(__dirname, "../dist/public");
  try {
    return require("fs").statSync(prodPath).isDirectory() ? prodPath : devPath;
  } catch {
    return devPath;
  }
})();

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const JSON_BODY_LIMIT = "20mb";

app.use(cors());

/** LINE webhook requires raw body for signature verification — register before express.json(). */
app.post(
  "/api/line/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    void handleLineWebhook(req, res);
  },
);

app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

app.use("/api", router);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  const entityTooLarge =
    err &&
    typeof err === "object" &&
    "type" in err &&
    (err as { type?: string }).type === "entity.too.large";

  if (entityTooLarge) {
    res.status(413).json({ error: "錄音太長或檔案太大，請控制在15秒內" });
    return;
  }

  next(err);
});

// Serve hashed assets with long-term cache
app.use(
  "/assets",
  express.static(path.join(publicDir, "assets"), {
    maxAge: "1y",
    immutable: true,
  }),
);

// Serve other static files (favicon, images, etc.) without long cache
app.use(express.static(publicDir, { maxAge: 0 }));

// SPA fallback — return index.html for any non-API route
app.use((req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

export default app;
