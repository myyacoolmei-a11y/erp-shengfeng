import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

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
