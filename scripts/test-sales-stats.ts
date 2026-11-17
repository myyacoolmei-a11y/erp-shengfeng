/**
 * 業務統計 — 純函式與接線檢查。
 * run: npx tsx scripts/test-sales-stats.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateSalesStats,
  casePaymentStatus,
  dateInRange,
  formatSalesCount,
  formatSalesMoney,
  mapSalesCaseCategory,
  matchesSalesFilter,
  quoteCaseKey,
  receivableCaseKey,
  repairCaseKey,
  resolveSalesIdentity,
  resolveSalesStatsDateRange,
  timestampToTaipeiDate,
  UNASSIGNED_SALES_KEY,
  UNASSIGNED_SALES_NAME,
  userSalesKey,
  workOrderCaseKey,
  type SalesStatCase,
} from "../shared/salesStats.ts";
import { isQuoteWon } from "../shared/quoteStatus.ts";
import {
  hasFeaturePermission,
  resolveFeaturePermissions,
} from "../shared/userPermissions.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function caseRow(partial: Partial<SalesStatCase> & Pick<SalesStatCase, "caseKey" | "salesKey" | "salesName">): SalesStatCase {
  return {
    salesUserId: null,
    date: "2026-09-05",
    customerName: "王小姐",
    category: "安裝",
    content: "BD 冷氣",
    wonAmount: 0,
    receivedAmount: 0,
    status: "未收款",
    ...partial,
  };
}

function testCategoryMapping() {
  assert(mapSalesCaseCategory("新裝") === "安裝", "新裝 → 安裝");
  assert(mapSalesCaseCategory("裝新機") === "安裝", "裝新機 → 安裝");
  assert(mapSalesCaseCategory("安裝新機") === "安裝", "安裝新機 → 安裝");
  assert(mapSalesCaseCategory("保養") === "保養", "保養");
  assert(mapSalesCaseCategory("壁掛式保養") === "保養", "壁掛式保養");
  assert(mapSalesCaseCategory("保固服務") === "保養", "保固服務");
  assert(mapSalesCaseCategory("維修") === "維修", "維修");
  assert(mapSalesCaseCategory("維修項目") === "維修", "維修項目");
  assert(mapSalesCaseCategory(null, "repair") === "維修", "repair source → 維修");
  assert(mapSalesCaseCategory("遷機") === "其他", "遷機 → 其他");
  assert(mapSalesCaseCategory("清洗") === "其他", "清洗 → 其他");
  assert(mapSalesCaseCategory("其他") === "其他", "其他");
  assert(mapSalesCaseCategory("") === "其他", "empty → 其他");
}

function testWonDateNotCreatedAt() {
  const created = timestampToTaipeiDate(new Date("2026-08-28T10:00:00+08:00"));
  const won = timestampToTaipeiDate(new Date("2026-09-05T10:00:00+08:00"));
  const install = "2026-09-20";
  assert(created === "2026-08-28", "created Taipei date");
  assert(won === "2026-09-05", "wonAt Taipei date");
  assert(dateInRange(won, "2026-09-01", "2026-09-30"), "won in September");
  assert(!dateInRange(created, "2026-09-01", "2026-09-30"), "createdAt August not in September");
  assert(!dateInRange(install, "2026-09-01", "2026-09-04"), "install date is not 成交日期");
  assert(isQuoteWon("已成交"), "已成交 counts");
  assert(!isQuoteWon("客戶確認中"), "cancelled win status excluded");
}

function testDedupeAndTotals() {
  const lele = userSalesKey(2);
  const hong = userSalesKey(8);
  const cases: SalesStatCase[] = [
    caseRow({
      caseKey: quoteCaseKey(11),
      salesKey: lele,
      salesUserId: 2,
      salesName: "樂樂",
      date: "2026-09-03",
      category: "安裝",
      content: "BD 冷氣 2 台",
      wonAmount: 58000,
      receivedAmount: 58000,
      status: "已結案",
    }),
    caseRow({
      caseKey: quoteCaseKey(12),
      salesKey: lele,
      salesUserId: 2,
      salesName: "樂樂",
      date: "2026-09-07",
      category: "保養",
      customerName: "XX餐廳",
      content: "冷氣保養 5 組",
      wonAmount: 15000,
      receivedAmount: 15000,
      status: "已結案",
    }),
    caseRow({
      caseKey: repairCaseKey(3),
      salesKey: lele,
      salesUserId: 2,
      salesName: "樂樂",
      date: "2026-09-12",
      category: "維修",
      customerName: "林先生",
      content: "冷氣漏水",
      wonAmount: 2500,
      receivedAmount: 0,
      status: "未收款",
    }),
    caseRow({
      caseKey: quoteCaseKey(21),
      salesKey: hong,
      salesUserId: 8,
      salesName: "洪宇風",
      date: "2026-09-01",
      category: "安裝",
      wonAmount: 275000,
      receivedAmount: 240000,
      status: "部分收款",
    }),
    caseRow({
      caseKey: quoteCaseKey(99),
      salesKey: UNASSIGNED_SALES_KEY,
      salesUserId: null,
      salesName: UNASSIGNED_SALES_NAME,
      date: "2026-09-10",
      category: "其他",
      wonAmount: 1000,
      receivedAmount: 0,
      status: "未收款",
    }),
  ];

  const keys = cases.map((c) => c.caseKey);
  assert(new Set(keys).size === keys.length, "case keys unique (quote/wo/recv not triple-counted)");
  assert(!keys.includes(workOrderCaseKey(11)), "linked WO not a separate case");
  assert(!keys.includes(receivableCaseKey(11)), "linked AR not a separate case");

  const result = aggregateSalesStats(cases, { from: "2026-09-01", to: "2026-09-30" });
  assert(result.rows[0]?.salesName === "洪宇風", "sorted by 成交業績 desc");
  assert(result.rows[0]?.wonAmount === 275000, "洪宇風 won");
  const leleRow = result.rows.find((r) => r.salesName === "樂樂");
  assert(leleRow?.caseCount === 3, "樂樂 3 cases");
  assert(leleRow?.installCount === 1, "樂樂 安裝 1");
  assert(leleRow?.maintenanceCount === 1, "樂樂 保養 1");
  assert(leleRow?.repairCount === 1, "樂樂 維修 1");
  assert(leleRow?.otherCount === 0, "樂樂 其他 0");
  assert(leleRow?.wonAmount === 75500, "樂樂 成交合計");
  assert(leleRow?.receivedAmount === 73000, "樂樂 已收款合計");
  const detailWon = leleRow?.cases.reduce((s, c) => s + c.wonAmount, 0);
  assert(detailWon === leleRow?.wonAmount, "明細加總對回成交業績");

  const unassigned = result.rows.find((r) => r.salesKey === UNASSIGNED_SALES_KEY);
  assert(unassigned?.salesName === UNASSIGNED_SALES_NAME, "NULL 業務顯示未指定業務");
  assert(unassigned?.caseCount === 1, "未指定 1 件");

  assert(result.totals.caseCount === 5, "合計案件數");
  assert(result.totals.wonAmount === 75500 + 275000 + 1000, "合計成交");
  assert(formatSalesMoney(386000) === "$386,000", "money thousands");
  assert(formatSalesMoney(0) === "$0", "zero money");
  assert(formatSalesCount(18) === "18", "count not 18.00");
  assert(casePaymentStatus(50000, 30000) === "部分收款", "partial payment");
  assert(casePaymentStatus(50000, 50000) === "已結案", "paid in full");
  assert(casePaymentStatus(50000, 0) === "未收款", "unpaid");
}

function testSalesFilterAndIdentity() {
  const userById = new Map([[2, { id: 2, displayName: "樂樂" }]]);
  const userByEmployeeId = new Map([[10, { id: 2, displayName: "樂樂" }]]);
  const employeeById = new Map([[10, { id: 10, name: "樂樂" }]]);

  const fromUser = resolveSalesIdentity({
    salesUserId: 2,
    userById,
    userByEmployeeId,
    employeeById,
  });
  assert(fromUser.salesUserId === 2 && fromUser.salesName === "樂樂", "repair sales_user_id");

  const fromQuote = resolveSalesIdentity({
    salesRepId: 10,
    userById,
    userByEmployeeId,
    employeeById,
  });
  assert(fromQuote.salesUserId === 2 && fromQuote.salesName === "樂樂", "quote sales_rep_id → linked user");

  const none = resolveSalesIdentity({
    salesUserId: null,
    salesRepId: null,
    userById,
    userByEmployeeId,
    employeeById,
  });
  assert(none.salesKey === UNASSIGNED_SALES_KEY, "null → 未指定業務");
  assert(none.salesName === UNASSIGNED_SALES_NAME, "unassigned name");

  const employeeOnly = resolveSalesIdentity({
    salesRepId: 99,
    userById,
    userByEmployeeId,
    employeeById: new Map([[99, { id: 99, name: "只在員工檔" }]]),
  });
  assert(employeeOnly.salesName === "只在員工檔", "unlinked employee keeps name");
  assert(employeeOnly.salesUserId === null, "unlinked employee has no user id");

  assert(matchesSalesFilter(fromUser, "all"), "all");
  assert(matchesSalesFilter(fromUser, "2"), "single sales");
  assert(!matchesSalesFilter(fromUser, UNASSIGNED_SALES_KEY), "user not unassigned");
  assert(matchesSalesFilter(none, UNASSIGNED_SALES_KEY), "filter 未指定業務");
}

function testEmptyAndPermissions() {
  const empty = aggregateSalesStats([], { from: "2026-09-01", to: "2026-09-30" });
  assert(empty.rows.length === 0, "empty rows");
  assert(empty.totals.caseCount === 0, "empty totals");

  assert(
    hasFeaturePermission({ role: "admin", featurePermissions: ["receivables", "customers"] }, "sales_stats"),
    "admin with receivables gets 業務統計",
  );
  assert(
    !hasFeaturePermission({ role: "engineer", featurePermissions: ["dispatch_orders", "repair_cases"] }, "sales_stats"),
    "engineer does not get 業務統計",
  );
  assert(
    !hasFeaturePermission({ role: "sales", featurePermissions: ["customers", "quotations"] }, "sales_stats"),
    "sales role does not get company-wide 業務統計",
  );
  const owner = resolveFeaturePermissions({ role: "owner" });
  assert(owner.includes("sales_stats"), "owner has 業務統計");
  const accountant = resolveFeaturePermissions({ role: "accountant" });
  assert(accountant.includes("sales_stats"), "accountant default has 業務統計");
}

function testWiring() {
  const nav = read("shared/navigationPermissions.ts");
  assert(nav.includes('key: "sales_stats"'), "nav has 業務統計");
  assert(nav.includes('label: "業務統計"'), "nav label");
  assert(nav.includes('path: "/sales-stats"'), "nav path");
  const workIdx = nav.indexOf('path: "/work-hours-stats"');
  const salesIdx = nav.indexOf('path: "/sales-stats"');
  const notifIdx = nav.indexOf('path: "/notification-settings"');
  assert(workIdx > 0 && salesIdx > workIdx && salesIdx < notifIdx, "業務統計 between 工時統計 and 通知中心");

  const app = read("client/src/App.tsx");
  assert(app.includes('path="/sales-stats"'), "App route");
  assert(app.includes('feature="sales_stats"'), "feature guard");
  assert(app.includes("admin") && app.includes("accountant"), "stats roles on page");

  const layout = read("client/src/components/layout.tsx");
  assert(layout.includes("TrendingUp"), "lucide TrendingUp icon");
  assert(!layout.includes("react-icons"), "no extra icon library");

  const page = read("client/src/pages/sales-stats.tsx");
  assert(page.includes("【{expanded.salesName}｜案件明細】"), "detail title format");
  assert(page.includes("此條件下尚無業務案件"), "empty state copy");
  assert(page.includes("overflow-x-auto"), "mobile horizontal scroll");
  assert(page.includes('useState<Preset>("month")'), "default 本月");
  assert(page.includes("全部業務"), "sales filter all");
  assert(page.includes("UNASSIGNED_SALES_KEY"), "unassigned option");
  assert(!page.includes("第 1 名") && !page.includes("排行榜") && !page.includes("冠軍"), "no ranking UI");
  assert(!page.includes("PieChart") && !page.includes("BarChart"), "no charts");

  const service = read("server/lib/statistics/salesStatsService.ts");
  assert(service.includes("quotesTable.wonAt"), "成交日期 uses won_at");
  assert(service.includes("consumedWoIds"), "dedupe linked work orders");
  assert(service.includes("consumedRecvIds"), "dedupe linked receivables");
  assert(service.includes("quoteCaseKey"), "quote id is canonical case");
  assert(service.includes("receivedAmount"), "已收款 from AR receivedAmount");
  assert(service.includes("repairCasesTable.salesUserId"), "repair uses sales_user_id");
  assert(service.includes("linkedEmployeeId"), "quote salesRep mapped via linked employee");
  assert(!service.includes("db.insert"), "stats service is read-only");
  assert(!service.includes("db.update"), "stats service does not update");

  const workHoursPage = read("client/src/pages/work-hours-stats.tsx");
  assert(workHoursPage.includes("工時統計"), "work-hours page untouched title");
  assert(workHoursPage.includes("此條件下尚無工時紀錄"), "work-hours empty copy intact");

  const routes = read("server/routes/index.ts");
  assert(routes.includes("salesStatsRouter"), "API router mounted");

  const quoteWin = read("server/lib/quoteWinDispatch.ts");
  assert(quoteWin.includes("findExistingWorkOrder"), "win dispatch still dedupes WO");
}

function testDatePresets() {
  const month = resolveSalesStatsDateRange("month");
  assert(month != null && month.from.endsWith("-01"), "month starts on 1st");
  const today = resolveSalesStatsDateRange("today");
  assert(today != null && today.from === today.to, "today is single day");
  const custom = resolveSalesStatsDateRange("custom", "2026-08-01", "2026-08-15");
  assert(custom?.from === "2026-08-01" && custom.to === "2026-08-15", "custom range");
  assert(resolveSalesStatsDateRange("custom") == null, "custom requires dates");
}

testCategoryMapping();
testWonDateNotCreatedAt();
testDedupeAndTotals();
testSalesFilterAndIdentity();
testEmptyAndPermissions();
testWiring();
testDatePresets();

if (process.exitCode) {
  console.error("sales-stats tests failed");
} else {
  console.log("sales-stats tests passed");
}
