import { and, eq, lte, ne, isNotNull } from "drizzle-orm";
import {
  db,
  receivablesTable,
  customersTable,
  employeesTable,
} from "@workspace/db";
import { RECEIVABLE_COLLECTION_KIND } from "../../../shared/reminders/types.ts";
import type { ReceivableReminderSummary } from "../../../shared/reminders/types.ts";
import { addDays, taipeiToday } from "./dateUtils.ts";
import {
  mapReceivableRow,
  summarizeItems,
} from "./receivableCollectionMessage.ts";

const REMINDER_SELECT = {
  id: receivablesTable.id,
  customerName: customersTable.name,
  projectName: receivablesTable.projectName,
  totalAmount: receivablesTable.totalAmount,
  receivedAmount: receivablesTable.receivedAmount,
  expectedPaymentDate: receivablesTable.expectedPaymentDate,
  paymentMethod: receivablesTable.paymentMethod,
  notes: receivablesTable.notes,
  salesRepName: employeesTable.name,
  contactPhone: customersTable.phone,
  customerMobile: customersTable.mobile,
};

export async function fetchReceivableCollectionReminders(
  appBaseUrl: string,
): Promise<ReceivableReminderSummary> {
  const today = taipeiToday();
  const horizon = addDays(today, 3);

  const rows = await db
    .select(REMINDER_SELECT)
    .from(receivablesTable)
    .leftJoin(customersTable, eq(receivablesTable.customerId, customersTable.id))
    .leftJoin(employeesTable, eq(customersTable.primarySalesRepId, employeesTable.id))
    .where(
      and(
        ne(receivablesTable.paymentStatus, "已收款"),
        isNotNull(receivablesTable.expectedPaymentDate),
        lte(receivablesTable.expectedPaymentDate, horizon),
      ),
    )
    .orderBy(receivablesTable.expectedPaymentDate);

  const items = rows
    .map(row =>
      mapReceivableRow(
        {
          ...row,
          contactPhone: row.contactPhone || row.customerMobile || null,
        },
        appBaseUrl,
        today,
      ),
    )
    .filter((item): item is NonNullable<typeof item> => item != null);

  return summarizeItems(items);
}

export { RECEIVABLE_COLLECTION_KIND };
