# 工務通 ERP（獨立系統）

這是從晟風工程 ERP **完整複製**出來的獨立產品，供其他公司試用與販售。

**禁止**連到晟風 production database。本專案使用自己的 Railway Project、Database、環境變數與網址。

原本功能都保留，改由「功能模組開關」控制顯示與 API 存取。

## 預設方案：業務試用版

開啟：dashboard、customers、quotes、invoices、payments、accounts_receivable  
關閉：dispatch、maintenance、subsidy、wholesale

## 本機啟動

```bash
cp .env.example .env
# 確認 DATABASE_URL 指向獨立資料庫 gongwutong_erp，不是 shengfeng_erp
npm install
npx drizzle-kit push --config drizzle.config.ts --force
PORT=3100 npm run dev
```

預設帳號：`admin` / `admin1234`（首次登入需改密碼）

## 環境變數

見 `.env.example`。請使用獨立 `DATABASE_URL`、`JWT_SECRET`、`APP_URL`。
