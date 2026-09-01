/**
 * One-shot「客戶成交・建立派工單」.
 * Creates the work order first, then marks the quote won — same transaction.
 */
import { eq, sql } from "drizzle-orm";
import {
  db,
  quotesTable,
  quoteItemsTable,
  workOrdersTable,
  workOrderEquipmentItemsTable,
  customersTable,
  employeesTable,
} from "@workspace/db";
import { categoryToProjectType, deriveQuoteCustomer, stripQuotePricingFromNotes } from "../../shared/workOrderNotes.ts";
import {
  QUOTE_STATUS_WON,
  QUOTE_STATUS_LOST,
  formatLostReason,
} from "./quoteStatus";
import { deriveDispatchStatus } from "./quoteWorkflow";
import { emitWorkOrderCreatedNotifications } from "./notifications/workOrdersNotificationHook";
import { logger } from "./logger";

export type WinAndDispatchSuccess = {
  ok: true;
  created: boolean;
  workOrderId: number;
  workOrderNumber: string | null;
  scheduledDate: string | null;
  quoteId: number;
  quoteStatus: string;
};

export type WinAndDispatchFailure = {
  ok: false;
  status: number;
  error: string;
  workOrderId?: number;
  workOrderNumber?: string | null;
};

export type WinAndDispatchResult = WinAndDispatchSuccess | WinAndDispatchFailure;

function isPgUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505");
}

function toEquipmentQuantity(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.round(n);
}

function formatWorkOrderNumber(id: number, at = new Date()): string {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `WO-${year}${month}${day}-${String(id).padStart(4, "0")}`;
}

async function lockQuoteRow(tx: any, quoteId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${quoteId})`);
  await tx.execute(sql`SELECT id FROM quotes WHERE id = ${quoteId} FOR UPDATE`);
  const [quote] = await tx
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, quoteId));
  return quote ?? null;
}

async function findExistingWorkOrder(tx: any, quoteId: number) {
  const rows = await tx
    .select({
      id: workOrdersTable.id,
      workOrderNumber: workOrdersTable.workOrderNumber,
      scheduledDate: workOrdersTable.scheduledDate,
      status: workOrdersTable.status,
    })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.quoteId, quoteId))
    .orderBy(sql`${workOrdersTable.createdAt} DESC NULLS LAST`, sql`${workOrdersTable.id} DESC`)
    .limit(1);
  return rows[0] ?? null;
}

function successFromExisting(
  quoteId: number,
  existing: { id: number; workOrderNumber: string | null; scheduledDate: string | null },
): WinAndDispatchSuccess {
  return {
    ok: true,
    created: false,
    workOrderId: existing.id,
    workOrderNumber: existing.workOrderNumber,
    scheduledDate: existing.scheduledDate,
    quoteId,
    quoteStatus: QUOTE_STATUS_WON,
  };
}

export async function winQuoteAndCreateWorkOrder(quoteId: number): Promise<WinAndDispatchResult> {
  try {
    const result = await db.transaction(async tx => {
      const quote = await lockQuoteRow(tx, quoteId);
      if (!quote) {
        return { ok: false as const, status: 404, error: "找不到報價單" };
      }

      const existing = await findExistingWorkOrder(tx, quoteId);
      if (existing) {
        await tx
          .update(quotesTable)
          .set({
            status: QUOTE_STATUS_WON,
            lostReason: null,
            dispatchStatus: deriveDispatchStatus(QUOTE_STATUS_WON, existing.status),
          })
          .where(eq(quotesTable.id, quoteId));
        return successFromExisting(quoteId, existing);
      }

      const [customer, salesRep, items] = await Promise.all([
        quote.customerId
          ? tx
              .select()
              .from(customersTable)
              .where(eq(customersTable.id, quote.customerId))
              .then(rows => rows[0] ?? null)
          : Promise.resolve(null),
        quote.salesRepId
          ? tx
              .select({ name: employeesTable.name })
              .from(employeesTable)
              .where(eq(employeesTable.id, quote.salesRepId))
              .then(rows => rows[0] ?? null)
          : Promise.resolve(null),
        tx
          .select()
          .from(quoteItemsTable)
          .where(eq(quoteItemsTable.quoteId, quoteId))
          .orderBy(quoteItemsTable.sortOrder),
      ]);

      const derived = deriveQuoteCustomer({
        customerId: quote.customerId,
        customerName: quote.customerName ?? customer?.name,
        customerPhone: quote.customerPhone ?? customer?.mobile ?? customer?.phone,
      });
      const customerId = derived.customerId;
      const customerName = (derived.customerName || customer?.name || "").trim();
      const mobilePhone = (derived.customerPhone || customer?.mobile || customer?.phone || "").trim();
      const contactPerson = (quote.contactPerson || customer?.contactPerson || "").trim();
      const installAddress = (quote.address || customer?.address || "").trim();

      if (!customerId && !customerName) {
        return {
          ok: false as const,
          status: 400,
          error: "請先填寫客戶姓名，才能成交並建立派工單",
        };
      }
      if (!customerId && !mobilePhone) {
        return {
          ok: false as const,
          status: 400,
          error: "請先填寫客戶電話，才能成交並建立派工單",
        };
      }

      const firstCategory = items[0]?.category ?? "裝新機";
      const salesLine = salesRep?.name ? `負責業務：${salesRep.name}` : "";
      const notes = stripQuotePricingFromNotes([quote.notes, salesLine].filter(Boolean).join("\n\n")) || null;

      const [order] = await tx
        .insert(workOrdersTable)
        .values({
          quoteId,
          customerId,
          customerName: customerName || customer?.name || null,
          title: quote.title,
          status: "待施工",
          contactPerson: contactPerson || null,
          mobilePhone: mobilePhone || null,
          installAddress: installAddress || null,
          scheduledDate: null,
          scheduledTime: null,
          projectType: categoryToProjectType(firstCategory),
          description: quote.description || null,
          notes,
        })
        .returning();

      const workOrderNumber = formatWorkOrderNumber(order.id);
      const [updated] = await tx
        .update(workOrdersTable)
        .set({ workOrderNumber })
        .where(eq(workOrdersTable.id, order.id))
        .returning();

      if (items.length > 0) {
        await tx.insert(workOrderEquipmentItemsTable).values(
          items.map((item, idx) => ({
            workOrderId: order.id,
            productId: item.productId ?? null,
            quoteItemId: item.id,
            category: item.category || null,
            itemName: item.itemName || null,
            brand: item.brand || null,
            model: item.model || null,
            quantity: toEquipmentQuantity(item.quantity),
            unit: item.unit || null,
            notes: item.notes || null,
            sortOrder: item.sortOrder ?? idx,
            unitPrice: String(item.unitPrice ?? 0),
          })),
        );
      }

      await tx
        .update(quotesTable)
        .set({
          status: QUOTE_STATUS_WON,
          lostReason: null,
          dispatchStatus: deriveDispatchStatus(QUOTE_STATUS_WON, updated.status),
        })
        .where(eq(quotesTable.id, quoteId));

      return {
        ok: true as const,
        created: true,
        workOrderId: updated.id,
        workOrderNumber: updated.workOrderNumber,
        scheduledDate: updated.scheduledDate,
        quoteId,
        quoteStatus: QUOTE_STATUS_WON,
      };
    });

    if (result.ok && result.created) {
      const [created] = await db
        .select()
        .from(workOrdersTable)
        .where(eq(workOrdersTable.id, result.workOrderId))
        .limit(1);
      if (created) {
        void emitWorkOrderCreatedNotifications(created).catch(err => {
          logger.error({ err, workOrderId: created.id }, "work order create notification failed");
        });
      }
    }

    return result;
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      const existing = await db
        .select({
          id: workOrdersTable.id,
          workOrderNumber: workOrdersTable.workOrderNumber,
          scheduledDate: workOrdersTable.scheduledDate,
        })
        .from(workOrdersTable)
        .where(eq(workOrdersTable.quoteId, quoteId))
        .orderBy(sql`${workOrdersTable.createdAt} DESC NULLS LAST`, sql`${workOrdersTable.id} DESC`)
        .limit(1);
      if (existing[0]) {
        return successFromExisting(quoteId, existing[0]);
      }
    }
    logger.error({ err, quoteId }, "winQuoteAndCreateWorkOrder failed");
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "成交並建立派工單失敗，資料未變更",
    };
  }
}

export async function markQuoteLost(
  quoteId: number,
  reason?: string | null,
  detail?: string | null,
): Promise<{ ok: true } | WinAndDispatchFailure> {
  try {
    return await db.transaction(async tx => {
      const quote = await lockQuoteRow(tx, quoteId);
      if (!quote) {
        return { ok: false as const, status: 404, error: "找不到報價單" };
      }

      const existing = await findExistingWorkOrder(tx, quoteId);
      if (existing) {
        return {
          ok: false as const,
          status: 409,
          error: "此報價單已建立派工單，無法標記未成交",
          workOrderId: existing.id,
          workOrderNumber: existing.workOrderNumber,
        };
      }

      await tx
        .update(quotesTable)
        .set({
          status: QUOTE_STATUS_LOST,
          lostReason: formatLostReason(reason, detail),
          dispatchStatus: "未派工",
        })
        .where(eq(quotesTable.id, quoteId));

      return { ok: true as const };
    });
  } catch (err) {
    logger.error({ err, quoteId }, "markQuoteLost failed");
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "標記未成交失敗",
    };
  }
}

export { isQuoteLost } from "./quoteStatus";
