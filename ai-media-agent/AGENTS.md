<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI Media Agent — 開發須知

在對這個專案進行任何開發之前，請務必先閱讀本機安裝版本所對應的官方文件，
**不要依賴訓練資料中過時的記憶**，因為 Next.js、React、Tailwind CSS 的 API
與慣例在不同版本間常有重大變動。

## 開發前必讀

1. **Next.js**：優先閱讀 `node_modules/next/dist/docs/`（隨安裝版本內建，
   內容與目前專案使用的版本完全對應），而不是憑印象假設 API 用法。
   重點確認 App Router、Server/Client Component、`params`／`searchParams`
   是否為 Promise、Route Handler、Middleware 等章節。
2. **React**：確認 `node_modules/react/package.json` 的版本號，並以該版本
   官方文件為準（例如 Hook 行為、Server Components 相關限制）。
3. **Tailwind CSS**：本專案使用 Tailwind CSS v4（CSS-first 設定，設定寫在
   `src/app/globals.css` 的 `@theme` 區塊，而非 `tailwind.config.js`）。
   請先確認 `node_modules/tailwindcss/package.json` 版本，避免套用 v3 語法。
4. **@supabase/ssr**：Supabase 在 Next.js App Router 的建議寫法會隨版本
   調整（例如 cookies 的 `getAll`/`setAll` API），請以 `node_modules/@supabase/ssr`
   內的型別與官方文件為準。

## 專案結構原則

- 所有頁面放在 `src/app` 下，遵循 App Router 慣例。
- 可重複使用的 UI 拆分至 `src/components`，依功能分類子資料夾
  （`home`、`auth`、`dashboard`、`create`）。
- 型別定義集中於 `src/types`。
- 尚未串接後端的資料，透過 `src/lib/data` 內的函式（例如 `getRecentContent`、
  `getBrands`）提供假資料，之後要改接 Supabase 時，只需替換函式內部實作，
  不應更動呼叫端的元件。
- Supabase client 建立邏輯集中於 `src/lib/supabase`，禁止在其他地方直接
  寫死金鑰或另外建立 client 實例。

## 程式品質底線

- 禁止使用 `any`。
- 所有非同步操作（表單送出、登入、登出）都需要處理 loading 與 error 狀態。
- 修改後請務必執行 `npm run lint` 與 `npm run build`，確保皆無錯誤再提交。
