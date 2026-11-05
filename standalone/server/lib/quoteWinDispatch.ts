/**
 * Quote win / cancel-win / lost + Public Intent Selection & Formal Quote E-Signature Confirmation.
 * Shares a single transactional work-order creation core so manual win and customer online confirmation
 * produce 100% compatible work orders without duplicates.
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
import type { QuoteConfirmedSnapshot } from "../../shared/db/schema/quotes";
import { categoryToProjectType, deriveQuoteCustomer, stripQuotePricingFromNotes } from "../../shared/workOrderNotes.ts";
import {
  QUOTE_STATUS_WON,
  QUOTE_STATUS_LOST,
  QUOTE_STATUS_PENDING,
  formatLostReason,
  formatQuoteNumber,
  isQuoteWon,
} from "./quoteStatus";
import { deriveDispatchStatus } from "./quoteWorkflow";
import {
  normalizeQuoteDocumentType,
  validateAndComputeIntentSelection,
} from "../../shared/quoteIntentLogic.ts";
import { buildQuotationHtml } from "../../client/src/components/pdf/templates/QuotationTemplate.ts";
import { serializeQuoteItem } from "./quoteDocument";
import { emitWorkOrderCreatedNotifications } from "./notifications/workOrdersNotificationHook";
import { writeAuditLog } from "./audit/auditLogService";
import type { JwtPayload } from "./auth";
import { logger } from "./logger";

export type QuoteActor = {
  id: number;
  displayName: string;
};

function actorFields(
  prefix: "won" | "winCanceled",
  actor?: QuoteActor | null,
) {
  const now = new Date();
  const userId = actor && actor.id > 0 ? actor.id : null;
  const userName = actor?.displayName?.trim() || null;
  if (prefix === "won") {
    return {
      wonAt: now,
      wonBy: userId,
      wonByName: userName,
    };
  }
  return {
    winCanceledAt: now,
    winCanceledBy: userId,
    winCanceledByName: userName,
  };
}

async function maybeAudit(opts: {
  action: string;
  quoteId: number;
  actor?: QuoteActor | null;
  metadata?: Record<string, unknown>;
}) {
  if (!opts.actor || opts.actor.id <= 0) return;
  try {
    await writeAuditLog({
      action: opts.action,
      entityType: "quote",
      entityId: opts.quoteId,
      user: {
        id: opts.actor.id,
        displayName: opts.actor.displayName,
      } as JwtPayload,
      metadata: opts.metadata,
    });
  } catch (err) {
    logger.error({ err, quoteId: opts.quoteId, action: opts.action }, "quote audit log failed");
  }
}

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
  return Math.max(1, Math.round(n));
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
      assignedTo: workOrdersTable.assignedTo,
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

/**
 * Shared transactional work-order creation for a confirmed quote.
 * Creates a pending work order (status "待施工" with scheduledDate = null, which maps to "待派工／待安排" in ERP).
 * Never auto-assigns technicians or scheduledDate.
 */
async function ensureWorkOrderForConfirmedQuoteTx(
  tx: any,
  quote: typeof quotesTable.$inferSelect,
  opts: {
    actor?: QuoteActor | null;
    allowMissingPhone?: boolean;
    extraConfirmfields?: Record<string, unknown>;
  } = {},
): Promise<
  | {
      ok: true;
      created: boolean;
      workOrderId: number;
      workOrderNumber: string | null;
      scheduledDate: string | null;
      salesRepName: string | null;
      items: Array<typeof quoteItemsTable.$inferSelect>;
    }
  | WinAndDispatchFailure
> {
  const quoteId = quote.id;
  const [customer, salesRep, items] = await Promise.all([
    quote.customerId
      ? tx
          .select()
          .from(customersTable)
          .where(eq(customersTable.id, quote.customerId))
          .then((rows: any[]) => rows[0] ?? null)
      : Promise.resolve(null),
    quote.salesRepId
      ? tx
          .select({ name: employeesTable.name })
          .from(employeesTable)
          .where(eq(employeesTable.id, quote.salesRepId))
          .then((rows: any[]) => rows[0] ?? null)
      : Promise.resolve(null),
    tx
      .select()
      .from(quoteItemsTable)
      .where(eq(quoteItemsTable.quoteId, quoteId))
      .orderBy(quoteItemsTable.sortOrder),
  ]);

  const existing = await findExistingWorkOrder(tx, quoteId);
  if (existing) {
    const dispatchStatus = deriveDispatchStatus(
      QUOTE_STATUS_WON,
      existing.status,
      existing.scheduledDate,
      existing.assignedTo,
    );
    const workflowStage =
      existing.scheduledDate || existing.assignedTo ? "已派工" : "待安排派工";
    await tx
      .update(quotesTable)
      .set({
        status: QUOTE_STATUS_WON,
        lostReason: null,
        dispatchStatus,
        workflowStage,
        ...actorFields("won", opts.actor),
        ...(opts.extraConfirmfields ?? {}),
      })
      .where(eq(quotesTable.id, quoteId));
    return {
      ok: true,
      created: false,
      workOrderId: existing.id,
      workOrderNumber: existing.workOrderNumber,
      scheduledDate: existing.scheduledDate,
      salesRepName: salesRep?.name ?? null,
      items,
    };
  }

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

  if (!customerId && !customerName && !opts.allowMissingPhone) {
    return {
      ok: false,
      status: 400,
      error: "請先填寫客戶姓名，才能成交並建立派工單",
    };
  }
  if (!customerId && !mobilePhone && !opts.allowMissingPhone) {
    return {
      ok: false,
      status: 400,
      error: "請先填寫客戶電話，才能成交並建立派工單",
    };
  }

  const firstCategory = items[0]?.category ?? "裝新機";
  const salesLine = salesRep?.name ? `負責業務：${salesRep.name}` : "";
  const formalQuoteNo = formatQuoteNumber(quote.id, quote.createdAt);
  let sourceIntentLine = "";
  if (quote.sourceIntentQuoteId) {
    const [srcQuote] = await tx
      .select({ id: quotesTable.id, createdAt: quotesTable.createdAt })
      .from(quotesTable)
      .where(eq(quotesTable.id, quote.sourceIntentQuoteId))
      .limit(1);
    if (srcQuote) {
      sourceIntentLine = `原始意向單：${formatQuoteNumber(srcQuote.id, srcQuote.createdAt)}`;
    }
  }
  const quoteRefLine = `正式報價單：${formalQuoteNo}`;
  const notes =
    stripQuotePricingFromNotes(
      [quote.notes, salesLine, quoteRefLine, sourceIntentLine].filter(Boolean).join("\n\n"),
    ) || null;

  // Summarize selected brands, models, and total equipment quantity onto the work order header as well
  const brands = [...new Set(items.map((it: any) => (it.brand ?? "").trim()).filter(Boolean))].join("、") || null;
  const models = [...new Set(items.map((it: any) => (it.model ?? "").trim()).filter(Boolean))].join("、") || null;
  const totalQty = items.reduce((sum: number, it: any) => sum + toEquipmentQuantity(it.quantity), 0);

  const [order] = await tx
    .insert(workOrdersTable)
    .values({
      quoteId,
      sourceIntentQuoteId: quote.sourceIntentQuoteId ?? null,
      customerId,
      customerName: customerName || customer?.name || quote.title || "客戶",
      title: quote.title,
      status: "待施工",
      contactPerson: contactPerson || null,
      mobilePhone: mobilePhone || null,
      installAddress: installAddress || null,
      scheduledDate: null,
      scheduledTime: null,
      assignedTo: null,
      assistantTo: null,
      technicians: null,
      primaryTechnician: null,
      projectType: categoryToProjectType(firstCategory),
      acBrand: brands,
      modelNumber: models,
      quantity: totalQty > 0 ? totalQty : null,
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
      items.map((item: any, idx: number) => ({
        workOrderId: order.id,
        productId: item.productId ?? null,
        quoteItemId: item.id,
        category: item.category || null,
        itemName: item.itemName || null,
        brand: item.brand || null,
        model: item.model || null,
        quantity: toEquipmentQuantity(item.quantity),
        unit: item.unit || null,
        notes: [item.notes, item.workContent].filter(Boolean).join("；") || null,
        sortOrder: item.sortOrder ?? idx,
        unitPrice: String(item.unitPrice ?? 0),
      })),
    );
  }

  const dispatchStatus = deriveDispatchStatus(
    QUOTE_STATUS_WON,
    updated.status,
    updated.scheduledDate,
    updated.assignedTo,
  );
  await tx
    .update(quotesTable)
    .set({
      status: QUOTE_STATUS_WON,
      lostReason: null,
      dispatchStatus,
      workflowStage: "待安排派工",
      ...actorFields("won", opts.actor),
      ...(opts.extraConfirmfields ?? {}),
    })
    .where(eq(quotesTable.id, quoteId));

  return {
    ok: true,
    created: true,
    workOrderId: updated.id,
    workOrderNumber: updated.workOrderNumber,
    scheduledDate: updated.scheduledDate,
    salesRepName: salesRep?.name ?? null,
    items,
  };
}

export async function winQuoteAndCreateWorkOrder(
  quoteId: number,
  actor?: QuoteActor | null,
): Promise<WinAndDispatchResult> {
  try {
    const result = await db.transaction(async (tx) => {
      const quote = await lockQuoteRow(tx, quoteId);
      if (!quote) {
        return { ok: false as const, status: 404, error: "找不到報價單" };
      }
      const ensured = await ensureWorkOrderForConfirmedQuoteTx(tx, quote, { actor });
      if (!ensured.ok) return ensured;
      return {
        ok: true as const,
        created: ensured.created,
        workOrderId: ensured.workOrderId,
        workOrderNumber: ensured.workOrderNumber,
        scheduledDate: ensured.scheduledDate,
        quoteId,
        quoteStatus: QUOTE_STATUS_WON,
      };
    });

    if (result.ok) {
      await maybeAudit({
        action: result.created ? "quote.win_and_dispatch" : "quote.win_relink",
        quoteId,
        actor,
        metadata: {
          workOrderId: result.workOrderId,
          workOrderNumber: result.workOrderNumber,
          created: result.created,
        },
      });
    }

    if (result.ok && result.created) {
      const [created] = await db
        .select()
        .from(workOrdersTable)
        .where(eq(workOrdersTable.id, result.workOrderId))
        .limit(1);
      if (created) {
        void emitWorkOrderCreatedNotifications(created).catch((err) => {
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

/**
 * Public Intent Selection:
 * Customer selects candidate option(s) on an intent quote -> Server recalculates from DB prices ->
 * Creates a linked formal quotation containing ONLY selected items & fixed construction items.
 */
export async function submitPublicIntentSelection(opts: {
  intentQuoteId: number;
  selectedItemIds: number[];
  expectedVersion?: number;
}): Promise<
  | {
      ok: true;
      intentQuoteId: number;
      formalQuoteId: number;
      formalQuoteNumber: string;
      totalWithTax: number;
      alreadyConverted: boolean;
    }
  | WinAndDispatchFailure
> {
  try {
    return await db.transaction(async (tx) => {
      const intentQuote = await lockQuoteRow(tx, opts.intentQuoteId);
      if (!intentQuote) {
        return { ok: false as const, status: 404, error: "找不到此意向選擇單" };
      }

      if (normalizeQuoteDocumentType(intentQuote.documentType) !== "intent") {
        return { ok: false as const, status: 400, error: "此單據不是意向選擇單" };
      }

      const currentVersion = Number(intentQuote.confirmedVersion ?? 1);
      if (opts.expectedVersion != null && Number(opts.expectedVersion) !== currentVersion) {
        return {
          ok: false as const,
          status: 409,
          error: "此意向選擇單已由業務更新版本，請重新整理頁面後再選擇",
        };
      }

      // If already converted and the formal quote is already confirmed, return the existing formal quote idempotently
      if (intentQuote.convertedFormalQuoteId) {
        const [existingFormal] = await tx
          .select()
          .from(quotesTable)
          .where(eq(quotesTable.id, intentQuote.convertedFormalQuoteId))
          .limit(1);
        if (existingFormal && (existingFormal.customerConfirmedAt || isQuoteWon(existingFormal.status))) {
          return {
            ok: true as const,
            intentQuoteId: intentQuote.id,
            formalQuoteId: existingFormal.id,
            formalQuoteNumber: formatQuoteNumber(existingFormal.id, existingFormal.createdAt),
            totalWithTax: Number(existingFormal.finalAmount ?? existingFormal.amount ?? 0),
            alreadyConverted: true,
          };
        }
      }

      const rawItems = await tx
        .select()
        .from(quoteItemsTable)
        .where(eq(quoteItemsTable.quoteId, intentQuote.id))
        .orderBy(quoteItemsTable.sortOrder);

      const candidateItems = rawItems.map(serializeQuoteItem);
      const validation = validateAndComputeIntentSelection({
        items: candidateItems,
        intentGroups: intentQuote.intentGroups,
        selectedItemIds: opts.selectedItemIds,
        discountAmount: intentQuote.discountAmount != null ? Number(intentQuote.discountAmount) : 0,
        taxType: intentQuote.taxType,
        baseDescription: intentQuote.description,
      });

      if (!validation.ok) {
        return { ok: false as const, status: 400, error: validation.error };
      }

      const now = new Date();
      let formalQuoteId = intentQuote.convertedFormalQuoteId ?? null;
      let formalCreatedAt: Date = now;

      if (formalQuoteId) {
        const [existingFormal] = await tx
          .select()
          .from(quotesTable)
          .where(eq(quotesTable.id, formalQuoteId))
          .limit(1);
        if (existingFormal) {
          formalCreatedAt = existingFormal.createdAt;
          await tx
            .update(quotesTable)
            .set({
              customerId: intentQuote.customerId,
              customerName: intentQuote.customerName,
              contactPerson: intentQuote.contactPerson,
              customerPhone: intentQuote.customerPhone,
              address: intentQuote.address,
              title: intentQuote.title.replace(/（意向選擇單）$/, ""),
              description: validation.combinedDescription || intentQuote.description,
              notes: intentQuote.notes,
              taxType: intentQuote.taxType,
              salesRepId: intentQuote.salesRepId,
              amount: String(validation.rawSubtotal),
              discountAmount: String(validation.discountAmount),
              finalAmount: String(validation.finalAmountBeforeTax),
              documentType: "formal",
              workflowStage: "待客戶確認",
              status: QUOTE_STATUS_PENDING,
              sourceIntentQuoteId: intentQuote.id,
              confirmedVersion: Number(existingFormal.confirmedVersion ?? 1) + 1,
              updatedAt: now,
            })
            .where(eq(quotesTable.id, formalQuoteId));
          await tx.delete(quoteItemsTable).where(eq(quoteItemsTable.quoteId, formalQuoteId));
        } else {
          formalQuoteId = null;
        }
      }

      if (!formalQuoteId) {
        const [createdFormal] = await tx
          .insert(quotesTable)
          .values({
            customerId: intentQuote.customerId,
            customerName: intentQuote.customerName,
            contactPerson: intentQuote.contactPerson,
            customerPhone: intentQuote.customerPhone,
            address: intentQuote.address,
            title: intentQuote.title.replace(/（意向選擇單）$/, ""),
            description: validation.combinedDescription || intentQuote.description,
            notes: intentQuote.notes,
            taxType: intentQuote.taxType,
            salesRepId: intentQuote.salesRepId,
            amount: String(validation.rawSubtotal),
            discountAmount: String(validation.discountAmount),
            finalAmount: String(validation.finalAmountBeforeTax),
            documentType: "formal",
            workflowStage: "待客戶確認",
            status: QUOTE_STATUS_PENDING,
            dispatchStatus: "未派工",
            sourceIntentQuoteId: intentQuote.id,
            confirmedVersion: 1,
          })
          .returning();
        formalQuoteId = createdFormal.id;
        formalCreatedAt = createdFormal.createdAt;
      }

      if (validation.formalQuoteItems.length > 0) {
        await tx.insert(quoteItemsTable).values(
          validation.formalQuoteItems.map((it, idx) => ({
            quoteId: formalQuoteId!,
            productId: it.productId,
            category: it.category,
            itemName: it.itemName,
            brand: it.brand,
            model: it.model,
            quantity: String(it.quantity),
            unit: it.unit,
            unitPrice: String(it.unitPrice),
            installFee: String(it.installFee),
            subtotal: String(it.subtotal),
            notes: it.notes,
            workContent: it.workContent,
            optionGroupId: it.optionGroupId,
            optionGroupName: it.optionGroupName,
            isRequiredGroup: it.isRequiredGroup,
            selectionMode: "fixed",
            isSelected: true,
            sortOrder: idx,
          })),
        );
      }

      // Mark selected items on the intent quote for record-keeping
      const selectedSet = new Set(validation.selectedOptionIds);
      for (const item of rawItems) {
        await tx
          .update(quoteItemsTable)
          .set({ isSelected: selectedSet.has(item.id) })
          .where(eq(quoteItemsTable.id, item.id));
      }

      await tx
        .update(quotesTable)
        .set({
          convertedFormalQuoteId: formalQuoteId,
          customerSelectedAt: now,
          customerSelections: {
            selectedOptionIds: validation.selectedOptionIds,
            selectedAt: now.toISOString(),
            groups: validation.groupSummary,
            convertedFormalQuoteId: formalQuoteId,
          },
          workflowStage: "已確認",
          updatedAt: now,
        })
        .where(eq(quotesTable.id, intentQuote.id));

      return {
        ok: true as const,
        intentQuoteId: intentQuote.id,
        formalQuoteId,
        formalQuoteNumber: formatQuoteNumber(formalQuoteId, formalCreatedAt),
        totalWithTax: validation.totalWithTax,
        alreadyConverted: false,
      };
    });
  } catch (err) {
    logger.error({ err, intentQuoteId: opts.intentQuoteId }, "submitPublicIntentSelection failed");
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "送出方案選擇失敗",
    };
  }
}

/**
 * Public Formal Quote Confirmation + E-Signature + Automatic Work Order Creation:
 * Validates token/version/agreement, locks quote, stores immutable snapshot + signature,
 * and atomically creates the pending ("待安排") work order.
 */
export async function confirmPublicFormalQuoteAndDispatch(opts: {
  quoteId: number;
  expectedVersion?: number;
  agreedTerms: boolean;
  signatureDataUrl?: string | null;
  confirmationMethod?: "electronic_signature" | "electronic_check";
  baseOrigin?: string;
}): Promise<
  | {
      ok: true;
      alreadyConfirmed: boolean;
      quoteId: number;
      quoteNumber: string;
      confirmedAt: string;
      confirmedVersion: number;
      workOrderId: number;
      workOrderNumber: string | null;
    }
  | WinAndDispatchFailure
> {
  if (!opts.agreedTerms) {
    return {
      ok: false,
      status: 400,
      error: "請先勾選「我已閱讀並同意上述報價內容與施工條款」",
    };
  }

  const rawSig = typeof opts.signatureDataUrl === "string" ? opts.signatureDataUrl.trim() : "";
  if (rawSig && !rawSig.startsWith("data:image/")) {
    return {
      ok: false,
      status: 400,
      error: "簽名影像格式不正確",
    };
  }
  if (rawSig.length > 2_000_000) {
    return {
      ok: false,
      status: 400,
      error: "簽名影像檔案過大，請重新簽名",
    };
  }

  try {
    const txResult = await db.transaction(async (tx) => {
      const quote = await lockQuoteRow(tx, opts.quoteId);
      if (!quote) {
        return { ok: false as const, status: 404, error: "找不到此報價單" };
      }

      if (normalizeQuoteDocumentType(quote.documentType) === "intent") {
        return {
          ok: false as const,
          status: 400,
          error: "此單據為意向選擇單，請先選擇方案產生正式報價單後再確認簽名",
        };
      }

      if (quote.status === QUOTE_STATUS_LOST || quote.workflowStage === "已取消") {
        return {
          ok: false as const,
          status: 400,
          error: "此報價單已取消或失效，無法確認",
        };
      }

      const existingWo = await findExistingWorkOrder(tx, opts.quoteId);
      if (quote.customerConfirmedAt && existingWo) {
        return {
          ok: true as const,
          alreadyConfirmed: true,
          quoteId: quote.id,
          quoteNumber: formatQuoteNumber(quote.id, quote.createdAt),
          confirmedAt: quote.customerConfirmedAt.toISOString(),
          confirmedVersion: Number(quote.confirmedVersion ?? 1),
          workOrderId: existingWo.id,
          workOrderNumber: existingWo.workOrderNumber,
        };
      }

      const currentVersion = Number(quote.confirmedVersion ?? 1);
      if (opts.expectedVersion != null && Number(opts.expectedVersion) !== currentVersion) {
        return {
          ok: false as const,
          status: 409,
          error: "報價單內容已更新為新版本，請重新整理頁面確認最新報價內容",
        };
      }

      const now = new Date();
      const confirmedAtIso = now.toISOString();
      const method: "electronic_signature" | "electronic_check" =
        rawSig ? "electronic_signature" : (opts.confirmationMethod ?? "electronic_check");

      const ensured = await ensureWorkOrderForConfirmedQuoteTx(tx, quote, {
        actor: { id: 0, displayName: quote.customerName || "客戶線上確認" },
        allowMissingPhone: true,
      });
      if (!ensured.ok) return ensured;

      const quoteNumber = formatQuoteNumber(quote.id, quote.createdAt);
      let sourceIntentQuoteNumber: string | null = null;
      if (quote.sourceIntentQuoteId) {
        const [srcQuote] = await tx
          .select({ id: quotesTable.id, createdAt: quotesTable.createdAt })
          .from(quotesTable)
          .where(eq(quotesTable.id, quote.sourceIntentQuoteId))
          .limit(1);
        if (srcQuote) {
          sourceIntentQuoteNumber = formatQuoteNumber(srcQuote.id, srcQuote.createdAt);
        }
      }

      const serializedItems = ensured.items.map(serializeQuoteItem);
      const snapshot: QuoteConfirmedSnapshot = {
        version: currentVersion,
        confirmedAt: confirmedAtIso,
        confirmationMethod: method,
        agreedTerms: true,
        signatureDataUrl: rawSig || null,
        quoteId: quote.id,
        quoteNumber,
        sourceIntentQuoteId: quote.sourceIntentQuoteId ?? null,
        sourceIntentQuoteNumber,
        customerName: quote.customerName,
        customerPhone: quote.customerPhone,
        contactPerson: quote.contactPerson,
        address: quote.address,
        salesRepName: ensured.salesRepName,
        title: quote.title,
        description: quote.description,
        notes: quote.notes,
        taxType: quote.taxType ?? "未稅",
        amount: parseFloat(String(quote.amount ?? 0)),
        discountAmount: parseFloat(String(quote.discountAmount ?? 0)),
        finalAmount: parseFloat(String(quote.finalAmount ?? 0)),
        items: serializedItems.map((it) => ({
          id: it.id,
          category: it.category,
          itemName: it.itemName,
          brand: it.brand,
          model: it.model,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          installFee: it.installFee,
          subtotal: it.subtotal,
          notes: it.notes,
          workContent: it.workContent,
        })),
      };

      const htmlSnapshot = buildQuotationHtml(
        {
          ...quote,
          salesRepName: ensured.salesRepName,
          items: serializedItems,
          confirmedVersion: currentVersion,
          customerConfirmedAt: confirmedAtIso,
          confirmationMethod: method,
          signatureDataUrl: rawSig || null,
          workflowStage: "已確認",
          status: QUOTE_STATUS_WON,
          confirmedSnapshot: snapshot,
        },
        opts.baseOrigin,
      );

      await tx
        .update(quotesTable)
        .set({
          customerConfirmedAt: now,
          confirmationMethod: method,
          agreedTerms: true,
          signatureDataUrl: rawSig || null,
          confirmedVersion: currentVersion,
          confirmedSnapshot: snapshot,
          confirmedHtmlSnapshot: htmlSnapshot,
          workflowStage: "待安排派工",
          updatedAt: now,
        })
        .where(eq(quotesTable.id, quote.id));

      return {
        ok: true as const,
        alreadyConfirmed: false,
        createdWorkOrder: ensured.created,
        quoteId: quote.id,
        quoteNumber,
        confirmedAt: confirmedAtIso,
        confirmedVersion: currentVersion,
        workOrderId: ensured.workOrderId,
        workOrderNumber: ensured.workOrderNumber,
      };
    });

    if (txResult.ok && !txResult.alreadyConfirmed && "createdWorkOrder" in txResult && txResult.createdWorkOrder) {
      const [created] = await db
        .select()
        .from(workOrdersTable)
        .where(eq(workOrdersTable.id, txResult.workOrderId))
        .limit(1);
      if (created) {
        void emitWorkOrderCreatedNotifications(created).catch((err) => {
          logger.error({ err, workOrderId: created.id }, "work order create notification failed");
        });
      }
    }

    return txResult;
  } catch (err) {
    logger.error({ err, quoteId: opts.quoteId }, "confirmPublicFormalQuoteAndDispatch failed");
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "確認報價單失敗，請稍後再試",
    };
  }
}

export async function cancelQuoteWin(
  quoteId: number,
  actor?: QuoteActor | null,
): Promise<
  | {
      ok: true;
      quoteStatus: string;
      workOrderId: number | null;
      workOrderNumber: string | null;
    }
  | WinAndDispatchFailure
> {
  try {
    const result = await db.transaction(async (tx) => {
      const quote = await lockQuoteRow(tx, quoteId);
      if (!quote) {
        return { ok: false as const, status: 404, error: "找不到報價單" };
      }
      if (!isQuoteWon(quote.status)) {
        return { ok: false as const, status: 400, error: "此報價單不是已成交狀態" };
      }

      const existing = await findExistingWorkOrder(tx, quoteId);
      await tx
        .update(quotesTable)
        .set({
          status: QUOTE_STATUS_PENDING,
          dispatchStatus: deriveDispatchStatus(
            QUOTE_STATUS_PENDING,
            existing?.status,
            existing?.scheduledDate,
            existing?.assignedTo,
          ),
          workflowStage: "待客戶確認",
          ...actorFields("winCanceled", actor),
        })
        .where(eq(quotesTable.id, quoteId));

      return {
        ok: true as const,
        quoteStatus: QUOTE_STATUS_PENDING,
        workOrderId: existing?.id ?? null,
        workOrderNumber: existing?.workOrderNumber ?? null,
      };
    });

    if (result.ok) {
      await maybeAudit({
        action: "quote.cancel_win",
        quoteId,
        actor,
        metadata: {
          workOrderId: result.workOrderId,
          workOrderNumber: result.workOrderNumber,
        },
      });
    }

    return result;
  } catch (err) {
    logger.error({ err, quoteId }, "cancelQuoteWin failed");
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "取消成交失敗",
    };
  }
}

export async function markQuoteLost(
  quoteId: number,
  reason?: string | null,
  detail?: string | null,
): Promise<{ ok: true } | WinAndDispatchFailure> {
  try {
    return await db.transaction(async (tx) => {
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
          workflowStage: "已取消",
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
