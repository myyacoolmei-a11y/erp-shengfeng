import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  workOrderEquipmentItemsTable,
  workOrderDeliveryItemsTable,
  wholesaleOrdersTable,
  wholesaleOrderItemsTable,
  wholesaleCustomersTable,
  inventoryItemsTable,
  inventoryTransactionsTable,
} from "@workspace/db";
import type { JwtPayload } from "../auth.ts";
import {
  buildTechniciansPayload,
  deriveProjectTypeFromJobTypes,
} from "../../../shared/workOrderDispatch.ts";
import { syncOrderReceivableFromPayments } from "./wholesalePaymentService.ts";

export class WholesaleDeliveryError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function shippedQtyByWholesaleItem(wholesaleOrderId: number) {
  const rows = await db
    .select({
      wholesaleOrderItemId: workOrderDeliveryItemsTable.wholesaleOrderItemId,
      shipQty: sql<number>`coalesce(sum(${workOrderDeliveryItemsTable.shipQty}), 0)::int`,
    })
    .from(workOrderDeliveryItemsTable)
    .innerJoin(workOrdersTable, eq(workOrderDeliveryItemsTable.workOrderId, workOrdersTable.id))
    .where(eq(workOrderDeliveryItemsTable.wholesaleOrderId, wholesaleOrderId))
    .groupBy(workOrderDeliveryItemsTable.wholesaleOrderItemId);

  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.wholesaleOrderItemId != null) map.set(r.wholesaleOrderItemId, Number(r.shipQty) || 0);
  }
  return map;
}

export async function listDeliveryWorkOrders(wholesaleOrderId: number) {
  const orders = await db
    .select({
      id: workOrdersTable.id,
      workOrderNumber: workOrdersTable.workOrderNumber,
      status: workOrdersTable.status,
      title: workOrdersTable.title,
      customerName: workOrdersTable.customerName,
      scheduledDate: workOrdersTable.scheduledDate,
      assignedTo: workOrdersTable.assignedTo,
      primaryTechnician: workOrdersTable.primaryTechnician,
      technicians: workOrdersTable.technicians,
      extraTechnician: workOrdersTable.extraTechnician,
      notes: workOrdersTable.notes,
      deliveryConfirmedAt: workOrdersTable.deliveryConfirmedAt,
      parentWorkOrderId: workOrdersTable.parentWorkOrderId,
    })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.wholesaleOrderId, wholesaleOrderId));

  const woIds = orders.map((o) => o.id);
  const items = woIds.length
    ? await db
        .select()
        .from(workOrderDeliveryItemsTable)
        .where(inArray(workOrderDeliveryItemsTable.workOrderId, woIds))
    : [];
  const byWo = new Map<number, typeof items>();
  for (const it of items) {
    const arr = byWo.get(it.workOrderId) ?? [];
    arr.push(it);
    byWo.set(it.workOrderId, arr);
  }
  return orders.map((o) => ({
    ...o,
    items: byWo.get(o.id) ?? [],
  }));
}

export async function createDeliveryWorkOrder(opts: {
  wholesaleOrderId: number;
  items: Array<{ wholesaleOrderItemId: number; shipQty: number }>;
  technicians?: string[];
  primaryTechnician?: string;
  extraTechnician?: string;
  scheduledDate?: string;
  notes?: string;
  user?: JwtPayload | null;
}) {
  const [order] = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.id, opts.wholesaleOrderId));
  if (!order) throw new WholesaleDeliveryError("找不到批發訂單", 404);
  if (order.status === "已出貨") throw new WholesaleDeliveryError("此訂單已出貨，不可重複建立出貨單");

  const orderItems = await db
    .select()
    .from(wholesaleOrderItemsTable)
    .where(eq(wholesaleOrderItemsTable.orderId, opts.wholesaleOrderId));
  const itemById = new Map(orderItems.map((it) => [it.id, it]));

  const shippedMap = await shippedQtyByWholesaleItem(opts.wholesaleOrderId);
  const shipLines = opts.items.filter((it) => it.shipQty > 0);
  if (shipLines.length === 0) throw new WholesaleDeliveryError("請至少填寫一筆本次出貨數量");

  for (const line of shipLines) {
    const src = itemById.get(line.wholesaleOrderItemId);
    if (!src) throw new WholesaleDeliveryError("出貨品項不屬於此批發訂單");
    const already = shippedMap.get(src.id) ?? 0;
    const pending = Math.max(0, src.qty - already);
    if (line.shipQty > pending) {
      throw new WholesaleDeliveryError(
        `${src.productName} 待出貨僅剩 ${pending}，無法出貨 ${line.shipQty}`,
      );
    }
  }

  const [cust] = order.customerId
    ? await db.select().from(wholesaleCustomersTable).where(eq(wholesaleCustomersTable.id, order.customerId))
    : [null];

  const customerName = order.customerName || cust?.companyName || "批發客戶";
  const mobile = cust?.mobile || cust?.telephone || "0000000000";
  const address = cust?.address || "";
  const contact = cust?.contactPerson || "";
  const techPayload = buildTechniciansPayload(opts.technicians ?? [], opts.extraTechnician);
  const primary = (opts.primaryTechnician || "").trim() || techPayload.assignedTo || null;
  const extra = (opts.extraTechnician || "").trim() || null;
  const title = `出貨｜${order.orderNumber || `批發#${order.id}`}`;
  const descParts = shipLines.map((line) => {
    const src = itemById.get(line.wholesaleOrderItemId)!;
    return `${src.productName}${src.model ? ` ${src.model}` : ""} × ${line.shipQty}${src.unit || ""}`;
  });
  const noteParts = [
    `批發訂單：${order.orderNumber || `#${order.id}`}`,
    order.notes || "",
    opts.notes || "",
  ].filter(Boolean);

  const [wo] = await db
    .insert(workOrdersTable)
    .values({
      customerId: null,
      customerName,
      title,
      status: "待施工",
      contactPerson: contact || null,
      mobilePhone: mobile,
      telephone: cust?.telephone || null,
      installAddress: address || null,
      scheduledDate: opts.scheduledDate || order.expectedDelivery || order.orderDate,
      assignedTo: techPayload.assignedTo || null,
      assistantTo: techPayload.assistantTo || null,
      technicians: techPayload.technicians || null,
      projectType: deriveProjectTypeFromJobTypes(["送貨／出貨"]) || "送貨／出貨",
      jobTypes: ["送貨／出貨"],
      primaryTechnician: primary,
      extraTechnician: extra,
      description: descParts.join("\n") || "批發出貨",
      notes: noteParts.join("\n"),
      wholesaleOrderId: order.id,
    } as any)
    .returning();

  const now = new Date();
  const workOrderNumber = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(wo.id).padStart(4, "0")}`;
  await db.update(workOrdersTable).set({ workOrderNumber }).where(eq(workOrdersTable.id, wo.id));

  const eqRows = shipLines.map((line, idx) => {
    const src = itemById.get(line.wholesaleOrderItemId)!;
    return {
      workOrderId: wo.id,
      productId: src.productId ?? null,
      category: "批發出貨",
      itemName: src.productName,
      brand: src.brand ?? null,
      model: src.model ?? null,
      quantity: line.shipQty,
      unit: src.unit || "台",
      notes: `批發訂單 ${order.orderNumber || `#${order.id}`}`,
      sortOrder: idx,
    };
  });
  if (eqRows.length) await db.insert(workOrderEquipmentItemsTable).values(eqRows);

  const deliveryRows = shipLines.map((line, idx) => {
    const src = itemById.get(line.wholesaleOrderItemId)!;
    return {
      workOrderId: wo.id,
      wholesaleOrderId: order.id,
      wholesaleOrderItemId: src.id,
      productId: src.productId ?? null,
      productName: src.productName,
      brand: src.brand ?? null,
      model: src.model ?? null,
      unit: src.unit || "台",
      orderedQty: src.qty,
      shipQty: line.shipQty,
      sortOrder: idx,
    };
  });
  if (deliveryRows.length) await db.insert(workOrderDeliveryItemsTable).values(deliveryRows);

  return { workOrderId: wo.id, workOrderNumber };
}

/** 修改尚未確認的批發出貨派工單，連動出貨數量及派工設備清單。 */
export async function updateDeliveryWorkOrder(opts: {
  wholesaleOrderId: number;
  workOrderId: number;
  items: Array<{ wholesaleOrderItemId: number; shipQty: number }>;
  technicians?: string[];
  primaryTechnician?: string;
  extraTechnician?: string;
  scheduledDate?: string;
  notes?: string;
}) {
  return await db.transaction(async (tx) => {
    const [wo] = await tx.select().from(workOrdersTable).where(and(
      eq(workOrdersTable.id, opts.workOrderId),
      eq(workOrdersTable.wholesaleOrderId, opts.wholesaleOrderId),
    )).for("update");
    if (!wo) throw new WholesaleDeliveryError("找不到這筆批發出貨單", 404);
    if (wo.deliveryConfirmedAt) throw new WholesaleDeliveryError("已確認出貨，無法直接修改，請依退貨／更正流程處理", 409);

    const existing = await tx.select().from(workOrderDeliveryItemsTable)
      .where(eq(workOrderDeliveryItemsTable.workOrderId, wo.id));
    if (existing.some((line) => line.inventoryDeductedAt)) {
      throw new WholesaleDeliveryError("此單已扣庫存，請先依庫存更正流程處理", 409);
    }
    const orderLines = await tx.select().from(wholesaleOrderItemsTable)
      .where(eq(wholesaleOrderItemsTable.orderId, opts.wholesaleOrderId));
    const sourceById = new Map(orderLines.map((line) => [line.id, line]));
    const nextQty = new Map<number, number>();
    for (const line of opts.items) {
      if (!Number.isInteger(line.wholesaleOrderItemId) || !Number.isInteger(line.shipQty) || line.shipQty < 0) {
        throw new WholesaleDeliveryError("出貨數量必須為非負整數");
      }
      if (!sourceById.has(line.wholesaleOrderItemId) || nextQty.has(line.wholesaleOrderItemId)) {
        throw new WholesaleDeliveryError("出貨品項不存在或重複");
      }
      nextQty.set(line.wholesaleOrderItemId, line.shipQty);
    }
    if (![...nextQty.values()].some((n) => n > 0)) {
      throw new WholesaleDeliveryError("請至少保留一筆出貨數量");
    }
    const allDeliveryLines = await tx.select({
      workOrderId: workOrderDeliveryItemsTable.workOrderId,
      wholesaleOrderItemId: workOrderDeliveryItemsTable.wholesaleOrderItemId,
      shipQty: workOrderDeliveryItemsTable.shipQty,
    }).from(workOrderDeliveryItemsTable)
      .where(eq(workOrderDeliveryItemsTable.wholesaleOrderId, opts.wholesaleOrderId));
    for (const [itemId, qty] of nextQty) {
      const alreadyElsewhere = allDeliveryLines.filter((line) =>
        line.workOrderId !== wo.id && line.wholesaleOrderItemId === itemId,
      ).reduce((sum, line) => sum + line.shipQty, 0);
      const ordered = sourceById.get(itemId)!.qty;
      if (qty + alreadyElsewhere > ordered) {
        throw new WholesaleDeliveryError(`${sourceById.get(itemId)!.productName} 超過剩餘可出貨數量（最多 ${ordered - alreadyElsewhere}）`);
      }
    }
    const extra = (opts.extraTechnician ?? "").trim();
    const names = [...new Set((opts.technicians ?? []).map((n) => n.trim()).filter(Boolean))];
    const techPayload = buildTechniciansPayload(names, extra);
    const primaryCandidate = (opts.primaryTechnician ?? "").trim();
    const primary = primaryCandidate && [ ...names, extra ].includes(primaryCandidate)
      ? primaryCandidate : techPayload.assignedTo || null;
    const validLines = [...nextQty].filter(([, qty]) => qty > 0);
    const description = validLines.map(([itemId, qty]) => {
      const src = sourceById.get(itemId)!;
      return `${src.productName}${src.model ? ` ${src.model}` : ""} × ${qty}${src.unit || ""}`;
    }).join("\n");

    await tx.update(workOrdersTable).set({
      technicians: techPayload.technicians ?? null,
      assignedTo: primary,
      assistantTo: [...names, ...(extra ? [extra] : [])].find((n) => n !== primary) ?? null,
      primaryTechnician: primary,
      extraTechnician: extra || null,
      scheduledDate: opts.scheduledDate || wo.scheduledDate,
      description,
      notes: opts.notes ?? wo.notes,
    }).where(eq(workOrdersTable.id, wo.id));

    // 出貨數量及派工單顯示商品必須同步，且不觸碰批發原始訂單品項。
    await tx.delete(workOrderDeliveryItemsTable).where(eq(workOrderDeliveryItemsTable.workOrderId, wo.id));
    await tx.delete(workOrderEquipmentItemsTable).where(and(
      eq(workOrderEquipmentItemsTable.workOrderId, wo.id),
      eq(workOrderEquipmentItemsTable.category, "批發出貨"),
    ));
    const shipmentRows = validLines.map(([itemId, qty], idx) => {
      const src = sourceById.get(itemId)!;
      return {
        workOrderId: wo.id,
        wholesaleOrderId: opts.wholesaleOrderId,
        wholesaleOrderItemId: itemId,
        productId: src.productId ?? null,
        productName: src.productName,
        brand: src.brand ?? null,
        model: src.model ?? null,
        unit: src.unit || "台",
        orderedQty: src.qty,
        shipQty: qty,
        sortOrder: idx,
      };
    });
    await tx.insert(workOrderDeliveryItemsTable).values(shipmentRows);
    await tx.insert(workOrderEquipmentItemsTable).values(validLines.map(([itemId, qty], idx) => {
      const src = sourceById.get(itemId)!;
      return {
        workOrderId: wo.id,
        productId: src.productId ?? null,
        category: "批發出貨",
        itemName: src.productName,
        brand: src.brand ?? null,
        model: src.model ?? null,
        quantity: qty,
        unit: src.unit || "台",
        sortOrder: idx,
      };
    }));
    return { workOrderId: wo.id, workOrderNumber: wo.workOrderNumber };
  });
}

export async function createRelatedInstallWorkOrder(parentWorkOrderId: number) {
  const [parent] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, parentWorkOrderId));
  if (!parent) throw new WholesaleDeliveryError("找不到出貨派工單", 404);

  const [created] = await db
    .insert(workOrdersTable)
    .values({
      customerId: parent.customerId,
      customerName: parent.customerName,
      title: parent.title?.includes("安裝") ? parent.title : `安裝｜${parent.customerName || parent.title}`,
      status: "待施工",
      contactPerson: parent.contactPerson,
      mobilePhone: parent.mobilePhone,
      telephone: parent.telephone,
      installAddress: parent.installAddress,
      scheduledDate: parent.scheduledDate,
      assignedTo: parent.assignedTo,
      assistantTo: parent.assistantTo,
      technicians: parent.technicians,
      primaryTechnician: parent.primaryTechnician,
      extraTechnician: parent.extraTechnician,
      projectType: "新裝",
      jobTypes: ["安裝"],
      description: parent.description,
      notes: parent.notes,
      wholesaleOrderId: parent.wholesaleOrderId,
      parentWorkOrderId: parent.id,
    } as any)
    .returning();

  const now = new Date();
  const workOrderNumber = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(created.id).padStart(4, "0")}`;
  await db.update(workOrdersTable).set({ workOrderNumber }).where(eq(workOrdersTable.id, created.id));

  const equipment = await db
    .select()
    .from(workOrderEquipmentItemsTable)
    .where(eq(workOrderEquipmentItemsTable.workOrderId, parent.id));
  if (equipment.length) {
    await db.insert(workOrderEquipmentItemsTable).values(
      equipment.map((it, idx) => ({
        workOrderId: created.id,
        productId: it.productId,
        quoteItemId: it.quoteItemId,
        category: it.category === "批發出貨" ? "安裝" : it.category,
        itemName: it.itemName,
        brand: it.brand,
        model: it.model,
        quantity: it.quantity,
        unit: it.unit,
        notes: it.notes,
        indoorUnits: it.indoorUnits,
        outdoorUnits: it.outdoorUnits,
        floor: it.floor,
        sortOrder: it.sortOrder ?? idx,
        unitPrice: null,
      })),
    );
  }

  return { workOrderId: created.id, workOrderNumber };
}

export async function confirmDeliveryWorkOrder(workOrderId: number, user?: JwtPayload | null, selections?: Array<{lineId:number; inventoryItemId:number}>) {
  const result = await db.transaction(async tx => {
    const [wo] = await tx.select().from(workOrdersTable).where(eq(workOrdersTable.id,workOrderId)).for("update");
    if (!wo || !wo.wholesaleOrderId || wo.parentWorkOrderId) throw new WholesaleDeliveryError("找不到批發出貨單",404);
    if (wo.deliveryConfirmedAt) return {alreadyConfirmed:true, deliveryConfirmedAt:wo.deliveryConfirmedAt, wholesaleOrderId:wo.wholesaleOrderId};
    const [order] = await tx.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id,wo.wholesaleOrderId)).for("update");
    if (!order || order.status === "已出貨") throw new WholesaleDeliveryError("訂單已出貨或不存在，請核對歷史資料");
    const lines = await tx.select().from(workOrderDeliveryItemsTable).where(eq(workOrderDeliveryItemsTable.workOrderId,workOrderId)).for("update");
    const orderLines = await tx.select().from(wholesaleOrderItemsTable).where(eq(wholesaleOrderItemsTable.orderId,wo.wholesaleOrderId));
    const prior = await tx.select({lineId:workOrderDeliveryItemsTable.wholesaleOrderItemId,qty:sql<number>`coalesce(sum(${workOrderDeliveryItemsTable.shipQty}),0)::int`}).from(workOrderDeliveryItemsTable).innerJoin(workOrdersTable,eq(workOrderDeliveryItemsTable.workOrderId,workOrdersTable.id)).where(and(eq(workOrderDeliveryItemsTable.wholesaleOrderId,wo.wholesaleOrderId),isNotNull(workOrdersTable.deliveryConfirmedAt))).groupBy(workOrderDeliveryItemsTable.wholesaleOrderItemId);
    const used = new Map(prior.map(x=>[x.lineId,Number(x.qty)]));
    for (const line of lines) {const source=orderLines.find(x=>x.id===line.wholesaleOrderItemId); const next=(used.get(line.wholesaleOrderItemId)||0)+line.shipQty; if(!source||next>source.qty) throw new WholesaleDeliveryError("出貨數量超過訂單或原始品項已變更，請核對"); used.set(line.wholesaleOrderItemId,next);}

    if (!lines.length) throw new WholesaleDeliveryError("無出貨品項");
    const picks = new Map((selections || []).map(x=>[x.lineId,x.inventoryItemId]));
    if (picks.size !== (selections || []).length || picks.size !== lines.filter(x=>!x.inventoryDeductedAt).length) throw new WholesaleDeliveryError("請選擇每一筆出貨的庫存品項");
    const totals = new Map<number,number>();
    for (const line of lines) {
      if (line.inventoryDeductedAt) continue;
      const id = picks.get(line.id);
      if (!id || !Number.isInteger(line.shipQty) || line.shipQty <= 0) throw new WholesaleDeliveryError("出貨品項或數量錯誤");
      totals.set(id,(totals.get(id)||0)+line.shipQty);
    }
    for (const [id,n] of [...totals].sort((a,b)=>a[0]-b[0])) {
      const [item] = await tx.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id,id)).for("update");
      if (!item || !["庫存中","待出貨"].includes(item.status)) throw new WholesaleDeliveryError("庫存品項不可出貨");
      const [{qty}] = await tx.select({qty:sql<number>`coalesce(sum(${inventoryTransactionsTable.quantityChange}),0)::int`}).from(inventoryTransactionsTable).where(eq(inventoryTransactionsTable.inventoryItemId,id));
      if (Number(qty)<n) throw new WholesaleDeliveryError(`${item.itemName} ${item.model||""} 庫存不足（剩 ${qty}，需 ${n}）`);
      await tx.insert(inventoryTransactionsTable).values({inventoryItemId:id,reason:"批發出貨",quantityChange:-n,notes:`批發出貨單 ${wo.workOrderNumber||wo.id}｜${wo.customerName||""}`,shipmentKey:`work-order:${wo.id}`,occurredAt:new Date(),createdBy:user?.id??null});
    }
    const confirmedAt = new Date();
    for (const line of lines) if (!line.inventoryDeductedAt) await tx.update(workOrderDeliveryItemsTable).set({inventoryItemId:picks.get(line.id)!,inventoryDeductedAt:confirmedAt}).where(eq(workOrderDeliveryItemsTable.id,line.id));
    await tx.update(workOrdersTable).set({deliveryConfirmedAt:confirmedAt,deliveryConfirmedBy:user?.id??null,status:wo.status === "待施工" || wo.status === "待派工" ? "已完成":wo.status,completedDate:wo.completedDate||confirmedAt.toISOString().slice(0,10),updatedAt:confirmedAt}).where(eq(workOrdersTable.id,wo.id));
    return {alreadyConfirmed:false,deliveryConfirmedAt:confirmedAt,wholesaleOrderId:wo.wholesaleOrderId};
  });
  await maybeMarkWholesaleShipped(result.wholesaleOrderId);
  return result;
}

async function maybeMarkWholesaleShipped(wholesaleOrderId: number) {
  const items = await db
    .select()
    .from(wholesaleOrderItemsTable)
    .where(eq(wholesaleOrderItemsTable.orderId, wholesaleOrderId));
  const shippedMap = await shippedQtyByWholesaleItem(wholesaleOrderId);

  const confirmedRows = await db
    .select({
      wholesaleOrderItemId: workOrderDeliveryItemsTable.wholesaleOrderItemId,
      shipQty: sql<number>`coalesce(sum(${workOrderDeliveryItemsTable.shipQty}), 0)::int`,
    })
    .from(workOrderDeliveryItemsTable)
    .innerJoin(workOrdersTable, eq(workOrderDeliveryItemsTable.workOrderId, workOrdersTable.id))
    .where(
      and(
        eq(workOrderDeliveryItemsTable.wholesaleOrderId, wholesaleOrderId),
        isNotNull(workOrdersTable.deliveryConfirmedAt),
      ),
    )
    .groupBy(workOrderDeliveryItemsTable.wholesaleOrderItemId);

  const confirmedMap = new Map<number, number>();
  for (const r of confirmedRows) {
    if (r.wholesaleOrderItemId != null) confirmedMap.set(r.wholesaleOrderItemId, Number(r.shipQty) || 0);
  }

  const allConfirmed = items.every((it) => (confirmedMap.get(it.id) ?? 0) >= it.qty);
  if (allConfirmed) {
    await db
      .update(wholesaleOrdersTable)
      .set({ status: "已出貨", updatedAt: new Date() })
      .where(eq(wholesaleOrdersTable.id, wholesaleOrderId));
    await syncOrderReceivableFromPayments(wholesaleOrderId);
  }

  void shippedMap;
}
