import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";
import {
  resolveFeaturePermissions,
  resolveDataPermission,
  type FeatureKey,
  type PermissionUserLike,
} from "../../shared/userPermissions.ts";

export interface JwtPayload {
  id: number;
  username: string;
  displayName: string;
  role: string;
  roles: string[];
  mustChangePassword: boolean;
  linkedEmployeeId?: number | null;
  featurePermissions?: string[];
  dataPermission?: string;
  isActive?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const JWT_SECRET = (() => {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    if (process.env["NODE_ENV"] !== "development") {
      logger.error("JWT_SECRET environment variable is required in non-development environments. Exiting.");
      process.exit(1);
    }
    logger.warn("JWT_SECRET is not set. Using an insecure development-only fallback. Do NOT deploy without setting JWT_SECRET.");
    return "dev-jwt-secret-change-before-deploying";
  }
  return secret;
})();

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Reload permission fields from DB so edits take effect without re-login. */
async function hydrateUserFromDb(payload: JwtPayload): Promise<JwtPayload | null> {
  const [row] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      role: usersTable.role,
      roles: usersTable.roles,
      mustChangePassword: usersTable.mustChangePassword,
      linkedEmployeeId: usersTable.linkedEmployeeId,
      featurePermissions: usersTable.featurePermissions,
      dataPermission: usersTable.dataPermission,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.id, payload.id))
    .limit(1);

  if (!row || !row.isActive) return null;

  const roles = row.roles?.length ? row.roles : [row.role];
  const userLike: PermissionUserLike = {
    role: row.role,
    roles,
    featurePermissions: row.featurePermissions ?? [],
    dataPermission: row.dataPermission,
  };

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    roles,
    mustChangePassword: row.mustChangePassword,
    linkedEmployeeId: row.linkedEmployeeId ?? null,
    featurePermissions: resolveFeaturePermissions(userLike),
    dataPermission: resolveDataPermission(userLike),
    isActive: row.isActive,
  };
}

function logAuthContext(req: Request, user: JwtPayload): void {
  // Temporary diagnostic for permission / data_scope issues (行政帳號)
  if (process.env["DEBUG_AUTH_CONTEXT"] === "0") return;
  const path = req.path || req.url || "";
  if (
    path.includes("/auth/me") ||
    path.includes("/dashboard") ||
    path.includes("/work-orders") ||
    path.includes("/receivables") ||
    path.includes("/inventory")
  ) {
    logger.info(
      {
        event: "auth_context",
        method: req.method,
        path,
        authUserId: user.id,
        username: user.username,
        role: user.role,
        roles: user.roles,
        linkedEmployeeId: user.linkedEmployeeId ?? null,
        // 本系統為單租戶，無 company_id / organization_id
        companyId: null,
        featurePermissions: user.featurePermissions ?? [],
        dataPermission: user.dataPermission ?? null,
        isActive: user.isActive ?? true,
      },
      "auth context",
    );
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "請先登入" });
    return;
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "登入已過期，請重新登入" });
    return;
  }

  void hydrateUserFromDb(payload)
    .then((fresh) => {
      if (!fresh) {
        res.status(401).json({ error: "帳號已停用或找不到使用者，請重新登入" });
        return;
      }
      req.user = fresh;
      logAuthContext(req, fresh);
      next();
    })
    .catch((err) => {
      logger.error({ err, userId: payload.id }, "hydrateUserFromDb failed");
      // Fallback to JWT payload so transient DB errors don't lock everyone out
      req.user = payload;
      next();
    });
}

/** Effective roles: use the roles array when populated; fall back to primary role for old tokens */
export function effectiveRoles(user: JwtPayload): string[] {
  return user.roles?.length ? user.roles : [user.role];
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "請先登入" });
      return;
    }
    const userRoles = effectiveRoles(req.user);
    if (!allowedRoles.some((r) => userRoles.includes(r))) {
      logger.warn(
        {
          event: "auth_denied_role",
          path: req.path,
          userId: req.user.id,
          role: req.user.role,
          roles: userRoles,
          allowedRoles,
          dataPermission: req.user.dataPermission,
          featurePermissions: req.user.featurePermissions,
        },
        "403 role gate",
      );
      res.status(403).json({ error: "您沒有此功能權限" });
      return;
    }
    next();
  };
}

/** Feature permission gate — falls back to legacy role mapping when list empty */
export function requireFeature(...allowedFeatures: FeatureKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "請先登入" });
      return;
    }
    const perms = resolveFeaturePermissions(req.user as PermissionUserLike);
    if (!allowedFeatures.some((f) => perms.includes(f))) {
      // Temporary diagnostics for engineer homepage 403 investigations
      console.log("403 DEBUG", {
        gate: "requireFeature",
        path: req.originalUrl,
        method: req.method,
        userId: req.user?.id,
        role: req.user?.role,
        roles: effectiveRoles(req.user),
        permissions: perms,
        requiredFeatures: allowedFeatures,
        companyId: null,
        linkedEmployeeId: req.user?.linkedEmployeeId ?? null,
      });
      logger.warn(
        {
          event: "auth_denied_feature",
          path: req.path,
          userId: req.user.id,
          role: req.user.role,
          roles: effectiveRoles(req.user),
          dataPermission: req.user.dataPermission,
          featurePermissions: perms,
          requiredFeatures: allowedFeatures,
        },
        "403 feature gate",
      );
      res.status(403).json({ error: "您沒有此功能權限" });
      return;
    }
    next();
  };
}

/** Pass if user has allowed role OR allowed feature (backward compatible) */
export function requireRoleOrFeature(roles: string[], features: FeatureKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "請先登入" });
      return;
    }
    const userRoles = effectiveRoles(req.user);
    if (roles.some((r) => userRoles.includes(r))) {
      next();
      return;
    }
    const perms = resolveFeaturePermissions(req.user as PermissionUserLike);
    if (features.some((f) => perms.includes(f))) {
      next();
      return;
    }
    res.status(403).json({ error: "您沒有此功能權限" });
  };
}
