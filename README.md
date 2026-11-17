# 晟風空調工程管理助手 ERP — Standalone

A self-contained build of **Cheng Feng HVAC Management Assistant ERP** (晟風空調工程管理助手 ERP). No pnpm workspace or Replit-specific tooling required.

## Requirements

- **Node.js 20+**
- **PostgreSQL** database

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set DATABASE_URL (and optionally PORT, JWT_SECRET)

# 3. Push the database schema
npm run db:push

# 4. Build the app
npm run build

# 5. Start the server
npm start
```

The server runs on `http://localhost:3000` by default (or the port set in `PORT`).

---

## Environment Variables

| Variable       | Required | Default | Description |
|----------------|----------|---------|-------------|
| `DATABASE_URL` | **Yes**  | —       | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/db` |
| `PORT`         | No       | `3000`  | Port the HTTP server listens on |
| `NODE_ENV`     | No       | —       | Set to `production` for production deployments |
| `JWT_SECRET`   | No       | auto-generated per-run | Secret for signing JWT tokens. **Always set this in production** |

---

## Default Login

On first start, a default **owner** account is seeded automatically:

| Field    | Value              |
|----------|--------------------|
| Username | `owner`            |
| Password | `ShengFeng2024!`   |

**Change this password immediately after first login.**

---

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
```

### Railway / Render

1. Connect your GitHub repository.
2. Set `DATABASE_URL` in environment variables.
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`

### VPS / cPanel (build locally, upload `dist/`)

```bash
# On your local machine
npm install && npm run build

# Upload dist/ folder + package.json to your server
# Then on the server:
npm install --omit=dev
npm start
```

### Environment variable notes

- All packages are bundled by esbuild — no `node_modules` needed at runtime
  except for `pino-pretty` logging workers.
- For zero-dependency production deployment, set `LOG_LEVEL=silent` to skip
  pino-pretty workers entirely.

---

## DB Migrations

```bash
# Push schema changes to the database
npm run db:push

# Open Drizzle Studio (visual DB browser)
npm run db:studio
```

---

## Project Structure

```
standalone/
├── client/src/       React frontend (ERP pages, components, contexts)
├── server/           Express API server (routes, auth, middleware)
├── shared/
│   ├── db/           Drizzle ORM schema + DB connection
│   ├── schemas/      Zod validation schemas (server-side)
│   └── api-client/   TanStack Query hooks (client-side)
├── build.mjs         Build script (Vite + esbuild)
├── vite.config.ts    Vite configuration
├── drizzle.config.ts Drizzle Kit configuration
└── package.json
```

---

## Scripts

| Script          | Description |
|-----------------|-------------|
| `npm run build` | Build client (Vite) + server (esbuild) → `dist/` |
| `npm start`     | Start the production server from `dist/` |
| `npm run dev`   | Run server directly with tsx (dev mode) |
| `npm run db:push` | Apply DB schema to the connected database |
| `npm run db:studio` | Open Drizzle Studio |
