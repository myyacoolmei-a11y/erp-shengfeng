/**
 * 派工單頁籤整併 — run: npx tsx scripts/test-wo-list-tabs.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_FILTER_TABS,
  constructionProgressLabel,
  listStatusBadge,
  matchesAdminFilter,
  statusesForListFilter,
  tabForWorkOrder,
} from "../shared/workOrderListTabs.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

assert(ADMIN_FILTER_TABS.join(",") === "待施工,異常／暫停,施工完成,歷史紀錄", "four tabs only");
assert(!ADMIN_FILTER_TABS.includes("待派工" as never), "no 待派工 tab");
assert(!ADMIN_FILTER_TABS.includes("施工中" as never), "no 施工中 tab");

for (const status of ["待施工", "待派工", "待處理", "施工中", "進行中", null]) {
  assert(tabForWorkOrder({ status }) === "待施工", `${status} → 待施工`);
  assert(matchesAdminFilter({ status }, "待施工"), `${status} visible in 待施工`);
}

assert(tabForWorkOrder({ status: "待施工", fieldStatus: "en_route" }) === "待施工", "出發中 stays 待施工");
assert(tabForWorkOrder({ status: "施工中", fieldStatus: "in_progress" }) === "待施工", "已到場 stays 待施工");
assert(tabForWorkOrder({ status: "待施工", fieldStatus: "paused" }) === "異常／暫停", "paused → 異常／暫停");
assert(tabForWorkOrder({ status: "異常／暫停" }) === "異常／暫停", "paused status");
assert(tabForWorkOrder({ status: "已完成" }) === "施工完成", "已完成");
assert(tabForWorkOrder({ status: "已結案" }) === "歷史紀錄", "已結案");

assert(listStatusBadge("待派工") === "待施工", "badge 待派工");
assert(listStatusBadge("施工中") === "待施工", "badge 施工中");
assert(listStatusBadge("進行中") === "待施工", "badge 進行中");

assert(constructionProgressLabel(null) === "未開始", "progress 未開始");
assert(constructionProgressLabel("en_route") === "出發中", "progress 出發中");
assert(constructionProgressLabel("in_progress") === "已到場", "progress 已到場");

const pending = statusesForListFilter("待施工");
assert(pending.includes("待派工") && pending.includes("施工中") && pending.includes("進行中"), "API 待施工 expands");
assert(statusesForListFilter("待派工").includes("待施工"), "API 待派工 still finds 待施工");
assert(statusesForListFilter("施工中").includes("待施工"), "API 施工中 still finds 待施工");
assert(statusesForListFilter("施工完成").join() === "已完成", "API 施工完成 → 已完成");

const page = readFileSync(join(root, "client/src/pages/work-orders.tsx"), "utf8");
assert(!page.includes("查看施工"), "list button removed");
assert(page.includes("施工人員：未安排"), "unassigned crew copy");
assert(page.includes("施工進度："), "progress on card");
assert(page.includes('ADMIN_FILTER_TABS'), "uses shared tabs");

const form = readFileSync(join(root, "client/src/components/work-order-form.tsx"), "utf8");
assert(form.includes('["待施工", "異常／暫停", "已完成", "已結案"]'), "form statuses simplified");

const progressRoute = readFileSync(join(root, "server/routes/workOrderFieldProgress.ts"), "utf8");
assert(progressRoute.includes('status: "異常／暫停"'), "pause writes 異常／暫停");
assert(progressRoute.includes('status: "待施工"'), "resume writes 待施工");
assert(progressRoute.includes('status: "已完成"'), "complete still 已完成");

const win = readFileSync(join(root, "server/lib/quoteWinDispatch.ts"), "utf8");
assert(win.includes('status: "待施工"'), "win still creates 待施工");

const hours = readFileSync(join(root, "client/src/pages/work-hours-stats.tsx"), "utf8");
assert(hours.includes("工時統計"), "work-hours untouched");

if (process.exitCode) {
  console.error("work-order list tab tests failed");
} else {
  console.log("work-order list tab tests passed");
}
