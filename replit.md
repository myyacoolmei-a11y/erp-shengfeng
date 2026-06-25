# 晟風工程 ERP

冷氣工程公司全功能 ERP 系統，支援客戶管理、報價單、派工單、工程進度、收款、保固、保養提醒等功能。

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/erp run dev` — run the ERP frontend (port 18996)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, path `/api`)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + shadcn/ui + TailwindCSS v4 + Wouter routing
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — DB schema (customers, acUnits, quotes, workOrders, progress, payments, warranties, maintenanceReminders)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks (from codegen)
- `lib/api-zod/src/generated/` — generated Zod schemas used by API server
- `artifacts/api-server/src/routes/` — all Express route handlers
- `artifacts/erp/src/pages/` — all frontend pages
- `artifacts/erp/src/components/layout.tsx` — sidebar navigation layout

## Architecture decisions

- Contract-first API: OpenAPI spec defines the contract, codegen produces both server-side Zod schemas and client-side React Query hooks
- DB `numeric` type for monetary amounts — routes convert with `parseFloat(string)` / `String(number)` at boundaries
- `includeOld` query param on `/customers` — by default only shows customers created within 2 years (via `createdAt >= twoYearsAgo`); set `includeOld=true` to see all
- Shared proxy routes traffic: `/api` → api-server (port 8080), `/` → erp frontend (port 18996)
- All pages use React Query for data fetching with proper cache invalidation on mutations

## Product

8 functional modules all in Traditional Chinese (繁體中文):
1. **儀表板** — KPI summary cards + work order status breakdown + recent customers
2. **客戶管理** — CRUD + search (name/phone/address/email) + 2-year filter
3. **客戶詳情** — 7 tabs: 基本資料、冷氣設備、報價單、派工單、收款、保固、保養提醒
4. **報價單管理** — CRUD + status filter + print preview + convert to work order
5. **派工單管理** — CRUD + status filter + inline progress log
6. **收款紀錄** — CRUD + monthly stats + link to quote/work order
7. **保固管理** — CRUD + auto-highlight expiring/expired warranties
8. **保養提醒** — CRUD + status filter + 30-day upcoming filter + mark complete

## User preferences

- Interface language: Traditional Chinese (繁體中文)
- Target users: admin staff (non-technical)
- Simple, clean UI — no unnecessary complexity

## Gotchas

- Run `pnpm run typecheck:libs` before checking leaf packages if you get "Module has no exported member" errors — stale lib declarations
- Do NOT run `pnpm dev` at workspace root — use workflows instead
- DB amounts are `numeric` strings in Drizzle; always `parseFloat()` before sending to frontend
- After any OpenAPI change, run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks and schemas

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
