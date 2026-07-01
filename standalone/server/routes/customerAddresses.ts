import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, customerAddressesTable } from "@workspace/db";
import { CreateCustomerAddressBody, UpdateCustomerAddressBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const READ_ROLES = ["super_admin", "owner", "admin", "sales", "accountant", "engineer", "technician"];
const WRITE_ROLES = ["super_admin", "owner", "admin", "sales"];
const DELETE_ROLES = ["super_admin", "owner", "admin"];

router.get("/customers/:customerId/addresses", requireRole(...READ_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.customerId) ? req.params.customerId[0] : req.params.customerId;
  const customerId = parseInt(raw, 10);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customerId" }); return; }

  const addresses = await db
    .select()
    .from(customerAddressesTable)
    .where(eq(customerAddressesTable.customerId, customerId))
    .orderBy(desc(customerAddressesTable.isDefault), desc(customerAddressesTable.createdAt));

  res.json(addresses);
});

router.post("/customers/:customerId/addresses", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.customerId) ? req.params.customerId[0] : req.params.customerId;
  const customerId = parseInt(raw, 10);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customerId" }); return; }

  const parsed = CreateCustomerAddressBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // If this is set as default, clear other defaults first
  if (parsed.data.isDefault) {
    await db
      .update(customerAddressesTable)
      .set({ isDefault: false })
      .where(eq(customerAddressesTable.customerId, customerId));
  }

  const [addr] = await db
    .insert(customerAddressesTable)
    .values({ ...parsed.data, customerId })
    .returning();

  res.status(201).json(addr);
});

router.patch("/customers/:customerId/addresses/:addressId", requireRole(...WRITE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.customerId) ? req.params.customerId[0] : req.params.customerId;
  const rawAddr = Array.isArray(req.params.addressId) ? req.params.addressId[0] : req.params.addressId;
  const customerId = parseInt(raw, 10);
  const addressId = parseInt(rawAddr, 10);
  if (isNaN(customerId) || isNaN(addressId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateCustomerAddressBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // If setting as default, clear others first
  if (parsed.data.isDefault) {
    await db
      .update(customerAddressesTable)
      .set({ isDefault: false })
      .where(eq(customerAddressesTable.customerId, customerId));
  }

  const [addr] = await db
    .update(customerAddressesTable)
    .set(parsed.data)
    .where(and(eq(customerAddressesTable.id, addressId), eq(customerAddressesTable.customerId, customerId)))
    .returning();

  if (!addr) { res.status(404).json({ error: "找不到地址" }); return; }
  res.json(addr);
});

router.delete("/customers/:customerId/addresses/:addressId", requireRole(...DELETE_ROLES), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.customerId) ? req.params.customerId[0] : req.params.customerId;
  const rawAddr = Array.isArray(req.params.addressId) ? req.params.addressId[0] : req.params.addressId;
  const customerId = parseInt(raw, 10);
  const addressId = parseInt(rawAddr, 10);
  if (isNaN(customerId) || isNaN(addressId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [addr] = await db
    .delete(customerAddressesTable)
    .where(and(eq(customerAddressesTable.id, addressId), eq(customerAddressesTable.customerId, customerId)))
    .returning();

  if (!addr) { res.status(404).json({ error: "找不到地址" }); return; }
  res.sendStatus(204);
});

export default router;
