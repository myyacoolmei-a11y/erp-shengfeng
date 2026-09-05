/**
 * Repair-case sales field helpers — run: npx tsx scripts/test-repair-case-sales.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRepairCaseSalesOptions,
  userHasSalesRole,
} from "../server/lib/repairCases/salesOptions.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

assert(userHasSalesRole({ role: "sales" }), "role sales");
assert(userHasSalesRole({ role: "admin", roles: ["sales", "admin"] }), "roles includes sales");
assert(!userHasSalesRole({ role: "technician" }), "technician is not sales");

const options = buildRepairCaseSalesOptions({
  users: [
    { id: 1, displayName: "大陳", role: "admin", isActive: true },
    { id: 2, displayName: "小陳", role: "sales", isActive: true },
    { id: 3, displayName: "離職業務", role: "sales", isActive: false },
    { id: 4, displayName: "洪宇風", role: "technician", isActive: true, employeePosition: "業務" },
    { id: 5, displayName: "", role: "sales", isActive: true },
  ],
});

assert(options[0]?.name === "小陳" || options[0]?.isSales, "sales role first");
assert(options.some(o => o.name === "小陳" && o.isSales), "小陳 is sales");
assert(options.some(o => o.name === "洪宇風" && o.isSales), "員工職稱為業務也排前面");
assert(!options.some(o => o.name === "離職業務"), "inactive excluded by default");
assert(!options.some(o => o.id === 5), "blank display name skipped");

const withInactive = buildRepairCaseSalesOptions({
  users: [
    { id: 3, displayName: "離職業務", role: "sales", isActive: false },
    { id: 2, displayName: "小陳", role: "sales", isActive: true },
  ],
  includeUserId: 3,
});
assert(withInactive.some(o => o.id === 3), "current assignee stays even if inactive");

const schema = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../shared/db/schema/repairCases.ts"),
  "utf8",
);
assert(schema.includes('integer("sales_user_id")'), "schema uses sales_user_id");
assert(!schema.includes("salesperson_id"), "do not add duplicate salesperson_id");
assert(!schema.includes("assignedSalesId"), "do not add assignedSalesId");

const route = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../server/routes/repairCases.ts"),
  "utf8",
);
assert(route.includes("salesUserName: salesUsersTable.displayName"), "list join returns salesUserName");
assert(route.includes("ilike(salesUsersTable.displayName, q)"), "search includes sales name");
assert(route.includes("eq(repairCasesTable.salesUserId"), "filter by salesUserId");
assert(route.includes('router.get("/repair-cases/sales-options"'), "sales options endpoint");

const page = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../client/src/pages/repair-cases.tsx"),
  "utf8",
);
assert(page.includes("負責業務"), "detail shows 負責業務");
assert(page.includes("未指定"), "old cases show 未指定");
assert(page.includes(">業務<") || page.includes("業務</th>"), "list has 業務 column");
assert(page.includes("全部業務"), "sales filter exists");

if (process.exitCode) {
  console.error("repair-case sales tests failed");
} else {
  console.log("repair-case sales tests passed");
}
