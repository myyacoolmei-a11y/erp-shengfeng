# 獨立 Railway 部署（工務通 ERP）

此目錄是獨立產品，**不要**接到晟風 Railway Project 或晟風 production database。

## 1. 建立新 GitHub repo
將本目錄 `gongwutong-erp/` 推成新 repository（例如 `gongwutong-erp`）。
不要合併進 `erp-shengfeng` 的 `main`。

## 2. 建立新 Railway Project
- New Project → Deploy from GitHub repo（工務通 repo）
- 新增 PostgreSQL plugin（**新的資料庫**，不是晟風那台）
- 服務 Root Directory 設為專案根（本目錄）

## 3. 環境變數（獨立）
- `DATABASE_URL` = Railway 新 Postgres 連線字串（不可用晟風的）
- `PORT` = Railway 提供
- `JWT_SECRET` = 新的隨機密鑰
- `APP_URL` / `PUBLIC_APP_URL` / `APP_BASE_URL` = 新網址
- 其餘選填見 `.env.example`

開機會跑 `ensureCompanyModulesMigration`，建立 `companies`、`company_features`，並套用「業務試用版」。
