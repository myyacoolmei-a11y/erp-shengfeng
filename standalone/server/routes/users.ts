import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, and, ne, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { requireRoleOrFeature, effectiveRoles } from "../lib/auth";
import { toUserPublicDto } from "../lib/userPublicDto";
import {
  FEATURE_KEYS,
  IDENTITY_TYPES,
  DATA_PERMISSIONS,
  PERMISSION_TEMPLATES,
  inferRolesFromFeatures,
  type FeatureKey,
  type PermissionTemplateKey,
} from "../../shared/userPermissions.ts";

const router: IRouter = Router();

const ALL_ROLES = [
  "super_admin",
  "owner",
  "admin",
  "sales",
  "engineer",
  "technician",
  "accountant",
  "distributor",
] as const;

const USER_MANAGE_ACCESS = requireRoleOrFeature(
  ["super_admin", "owner"],
  ["system_settings"],
);

const CreateUserBody = z.object({
  username: z.string().min(1, "帳號不可為空"),
  password: z.string().min(6, "密碼至少 6 位"),
  displayName: z.string().min(1, "姓名不可為空"),
  phone: z.string().optional(),
  email: z.string().email("Email 格式不正確").optional().or(z.literal("")),
  identityType: z.enum(IDENTITY_TYPES).optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  linkedEmployeeId: z.number().int().positive().nullable().optional(),
  receiveDispatchNotifications: z.boolean().optional(),
  roles: z.array(z.enum(ALL_ROLES)).min(1, "至少選擇一個角色").optional(),
  featurePermissions: z.array(z.enum(FEATURE_KEYS)).min(1, "至少選擇一項功能權限"),
  dataPermission: z.enum(DATA_PERMISSIONS),
  permissionTemplate: z.string().optional(),
});

const UpdateUserBody = z.object({
  displayName: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  identityType: z.enum(IDENTITY_TYPES).optional(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  linkedEmployeeId: z.number().int().positive().nullable().optional(),
  receiveDispatchNotifications: z.boolean().optional(),
  roles: z.array(z.enum(ALL_ROLES)).min(1).optional(),
  featurePermissions: z.array(z.enum(FEATURE_KEYS)).min(1).optional(),
  dataPermission: z.enum(DATA_PERMISSIONS).optional(),
  isActive: z.boolean().optional(),
});

const ResetPasswordBody = z.object({
  newPassword: z.string().min(6, "密碼至少 6 位"),
});

function parseId(raw: unknown): number | null {
  const id = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return isNaN(id) ? null : id;
}

function resolveRolesFromBody(
  body: { roles?: string[]; permissionTemplate?: string; featurePermissions: FeatureKey[] },
): string[] {
  if (body.roles?.length) return body.roles;
  const tpl = body.permissionTemplate as PermissionTemplateKey | undefined;
  if (tpl && PERMISSION_TEMPLATES[tpl]) return [...PERMISSION_TEMPLATES[tpl].roles];
  return inferRolesFromFeatures(body.featurePermissions);
}

router.get("/users", USER_MANAGE_ACCESS, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(toUserPublicDto));
});

router.post("/users", USER_MANAGE_ACCESS, async (req, res): Promise<void> => {
  const callerRoles = effectiveRoles(req.user!);
  const callerIsSuperAdmin = callerRoles.includes("super_admin");

  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const roles = resolveRolesFromBody(parsed.data);

  if (!callerIsSuperAdmin && roles.includes("super_admin")) {
    res.status(403).json({ error: "您沒有權限建立系統管理員帳號" });
    return;
  }

  const { password, featurePermissions, dataPermission, permissionTemplate: _tpl, roles: _r, ...rest } = parsed.data;
  const primaryRole = roles[0];
  const email = rest.email === "" ? null : rest.email ?? null;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, rest.username));
  if (existing) {
    res.status(409).json({ error: "帳號已被使用" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({
      username: rest.username,
      displayName: rest.displayName,
      phone: rest.phone ?? null,
      email,
      identityType: rest.identityType ?? "employee",
      title: rest.title ?? null,
      notes: rest.notes ?? null,
      linkedEmployeeId: rest.linkedEmployeeId ?? null,
      receiveDispatchNotifications: rest.receiveDispatchNotifications ?? true,
      passwordHash,
      role: primaryRole,
      roles,
      featurePermissions,
      dataPermission,
      mustChangePassword: true,
    })
    .returning();
  res.status(201).json(toUserPublicDto(user!));
});

router.patch("/users/:id", USER_MANAGE_ACCESS, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const callerId = req.user!.id;
  const callerRoles = effectiveRoles(req.user!);
  const callerIsSuperAdmin = callerRoles.includes("super_admin");

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "找不到使用者" }); return; }

  const targetIsSuperAdmin =
    (target.roles?.length ? target.roles : [target.role]).includes("super_admin");

  if (targetIsSuperAdmin && callerId !== id) {
    res.status(403).json({ error: "系統管理員帳號只能由本人修改" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (data.email === "") data.email = null;

  if (targetIsSuperAdmin) {
    delete data.roles;
    delete data.isActive;
    delete data.featurePermissions;
    delete data.dataPermission;
  }

  if (!callerIsSuperAdmin && (data.roles as string[] | undefined)?.includes("super_admin")) {
    res.status(403).json({ error: "您沒有權限設定系統管理員角色" });
    return;
  }

  if ((data.roles as string[] | undefined)?.length) {
    data.role = (data.roles as string[])[0];
  } else if (parsed.data.featurePermissions?.length) {
    const inferred = inferRolesFromFeatures(parsed.data.featurePermissions);
    data.roles = inferred;
    data.role = inferred[0];
  }

  if (data.username) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.username, data.username as string), ne(usersTable.id, id)));
    if (existing) {
      res.status(409).json({ error: "帳號已被使用" });
      return;
    }
  }

  const [user] = await db
    .update(usersTable)
    .set(data)
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) { res.status(404).json({ error: "找不到使用者" }); return; }
  res.json(toUserPublicDto(user));
});

router.post("/users/:id/reset-password", USER_MANAGE_ACCESS, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id, role: usersTable.role, roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!existing) { res.status(404).json({ error: "找不到使用者" }); return; }

  const targetIsSuperAdmin =
    (existing.roles?.length ? existing.roles : [existing.role]).includes("super_admin");
  if (targetIsSuperAdmin) {
    res.status(403).json({ error: "系統管理員密碼只能由本人透過「修改密碼」功能自行變更" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(usersTable.id, id));

  res.json({ ok: true });
});

router.delete("/users/:id", USER_MANAGE_ACCESS, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const callerId = req.user!.id;
  if (id === callerId) {
    res.status(400).json({ error: "不能刪除自己的帳號" });
    return;
  }

  const [target] = await db
    .select({ id: usersTable.id, role: usersTable.role, roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "找不到使用者" }); return; }

  const targetRoles = target.roles?.length ? target.roles : [target.role];

  if (targetRoles.includes("super_admin")) {
    res.status(403).json({ error: "系統管理員帳號不可被刪除" });
    return;
  }

  if (targetRoles.includes("owner")) {
    const [otherOwner] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          sql`('owner' = ANY(${usersTable.roles}) OR ${usersTable.role} = 'owner')`,
          eq(usersTable.isActive, true),
          ne(usersTable.id, id),
        )
      );
    if (!otherOwner) {
      res.status(400).json({ error: "無法刪除最後一位啟用的老闆帳號" });
      return;
    }
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

export default router;
