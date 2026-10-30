# AI Media Agent

讓每一家企業，都擁有自己的 AI 媒體團隊。企業主上傳影片、照片與語音後，
由 AI 自動理解內容、產生剪輯提案與社群文案，最後由使用者選擇版本並發布。

本專案為第一階段產品骨架，使用 Next.js App Router、TypeScript、Tailwind CSS
與 Supabase Auth 建置。

## 技術規格

- Next.js（App Router）
- TypeScript
- Tailwind CSS v4
- Supabase（`@supabase/supabase-js`、`@supabase/ssr`）
- Lucide React

## 開始使用

1. 安裝套件：

   ```bash
   npm install
   ```

2. 複製環境變數範例並填入 Supabase 專案資訊：

   ```bash
   cp .env.example .env.local
   ```

   在 `.env.local` 內填入：

   ```
   NEXT_PUBLIC_SUPABASE_URL=你的 Supabase 專案 URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase anon public key
   ```

   兩個值都可以在 Supabase 專案的 Settings → API 頁面找到。

3. 啟動本機開發伺服器：

   ```bash
   npm run dev
   ```

   開啟 [http://localhost:3000](http://localhost:3000) 即可預覽。

## 常用指令

```bash
npm run dev     # 啟動開發伺服器
npm run lint    # 執行 ESLint 檢查
npm run build   # 建置正式版本
```

## 專案結構

```
src/
  app/                公開頁面與後台頁面（App Router）
  components/          依功能拆分的 UI 元件（home / auth / dashboard / create）
  lib/
    supabase/          Supabase client（瀏覽器端／伺服器端／middleware）
    data/              假資料存取函式，之後可改接 Supabase
    validation/        表單驗證邏輯
  types/               共用 TypeScript 型別定義
  proxy.ts             路由保護（登入導向、未登入導向）
```

## 開發須知

在進行任何開發前，請先閱讀 [`AGENTS.md`](./AGENTS.md)。
