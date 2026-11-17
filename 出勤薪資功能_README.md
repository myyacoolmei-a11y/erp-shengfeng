# 晟風 ERP｜出勤與薪資模組（開發版本）

## 本次新增
- `/employees/attendance`：行政／老闆每日出勤登記、請假、早退、中途離開、原始異動紀錄。API 支援一日多時段，但此版前端尚未提供多時段編輯器。
- `/employees/settings`：限 owner / super_admin；員工薪資設定、勞健保個人負擔、計薪種類、生效日，保存歷史。
- `/employees/payroll`：限 owner / super_admin；行政紀錄自動帶入或老闆手動數字結算、獎金／加班／請假扣款／保險，核准後鎖定，提供列印簡明薪資明細、已付款狀態。
- 後端所有薪資 API 均使用角色驗證，行政 API 不回傳薪資資料。

## 必要的資料庫步驟（**先備份正式資料庫**）
1. 確認 `DATABASE_URL` 指向正確環境。
2. 部署**前**於有授權的環境執行 `npm run db:migrate-attendance-payroll`。此指令只建立新資料表，不刪除原資料。
3. 成功後才部署含新 API 的程式碼，避免 `relation does not exist` 錯誤。
4. 首次由老闆設定每位員工的計薪方式及底薪；設定前無法建立薪資草稿。

## 使用及計算注意
- 薪資資料以**整數分**儲存，UI 以元顯示。
- 有月薪、日薪、時薪、按件、工程等計價選項。按件及工程屬單筆約定計價草稿，不是完整的按件／工程結算流水帳。
- **這是初步可操作版本，不是已完成的法遵薪資引擎。** 事假／病假／特休等不能只套單一扣薪公式，因此請假扣款目前由老闆確認合法金額後輸入；全勤、加班法定計算、假別上限、勞健保級距自動更新尚未實作。
- 按件與工程的契約計價與正職雇用應依實際法律關係區分。外包者保險金額請勿機械套用。
- 目前提供簡易列印明細，不是正式 PDF 範本與 Excel 匯出；部分付款、解除核准及薪資更正流程尚未實作。
- 行政出勤的上/下班時間是手動輸入，未強制進行有效工時計算或排班核對；薪資核准前務必人工確認法定工時紀錄及假別。
- **不可直接把整份舊 ZIP 覆蓋較新的 main 分支**：請先比對 ZIP 版本與 GitHub 最新變更，僅合併本次修改檔案。

## 修改清單
- `server/routes/attendancePayroll.ts` (新增)
- `server/routes/index.ts`
- `client/src/pages/employee-attendance-payroll.tsx` (新增)
- `client/src/pages/employees.tsx`
- `client/src/App.tsx`
- `scripts/db-migrate-attendance-payroll.sql` (新增)
- `scripts/db-migrate-attendance-payroll.mjs` (新增)
- `package.json`

## 尚待驗證
- 需在能安裝專案依賴的 Node 環境執行 `npm ci && npm run typecheck && npm run build`。
- 需在測試資料庫跑 migration 和完整 API／權限／算薪情境測試，再上 Railway。
