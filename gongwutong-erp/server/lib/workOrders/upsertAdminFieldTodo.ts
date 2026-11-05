import { and, eq } from "drizzle-orm";
import { db, adminTodosTable } from "@workspace/db";

/** Create or refresh admin todo for field completion — never duplicate by (work_order_id, type). */
export async function upsertAdminFieldCompleteTodo(params: {
  workOrderId: number;
  workOrderNumber: string | null;
  customerName: string | null;
  createdBy: number;
}): Promise<void> {
  const title = `工程師已完工待行政處理：${params.workOrderNumber ?? `#${params.workOrderId}`}${
    params.customerName ? `（${params.customerName}）` : ""
  }`;
  const payload = {
    workOrderId: params.workOrderId,
    workOrderNumber: params.workOrderNumber,
    customerName: params.customerName,
  };

  const [existing] = await db
    .select({ id: adminTodosTable.id })
    .from(adminTodosTable)
    .where(
      and(
        eq(adminTodosTable.workOrderId, params.workOrderId),
        eq(adminTodosTable.todoType, "field_complete"),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(adminTodosTable)
      .set({
        title,
        status: "pending",
        payload,
        updatedAt: new Date(),
      })
      .where(eq(adminTodosTable.id, existing.id));
    return;
  }

  await db.insert(adminTodosTable).values({
    workOrderId: params.workOrderId,
    todoType: "field_complete",
    title,
    status: "pending",
    payload,
    createdBy: params.createdBy,
  });
}
