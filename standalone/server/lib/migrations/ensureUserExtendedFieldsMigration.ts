import { pool } from "@workspace/db";
import { logger } from "../logger";
import {
  resolveFeaturePermissions,
  resolveDataPermission,
  normalizeFeaturePermissions,
} from "../../../shared/userPermissions.ts";

/** Idempotent: extended user profile + permission columns */
export async function ensureUserExtendedFieldsMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_type text NOT NULL DEFAULT 'employee';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS title text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notes text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS feature_permissions text[] NOT NULL DEFAULT '{}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS data_permission text NOT NULL DEFAULT 'all';
    `);

    logger.info("DB migration: users extended fields ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: users extended fields");
    return false;
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * 1) Backfill empty feature_permissions from roles
 * 2) Remap legacy keys (home/quotes/work_orders/…) → new keys
 */
export async function migrateUserFeaturePermissions(): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: number;
      role: string;
      roles: string[] | null;
      feature_permissions: string[] | null;
      data_permission: string | null;
    }>(`SELECT id, role, roles, feature_permissions, data_permission FROM users`);

    let filled = 0;
    let remapped = 0;
    for (const row of rows) {
      const userLike = {
        role: row.role,
        roles: row.roles ?? [],
        featurePermissions: row.feature_permissions ?? [],
        dataPermission: row.data_permission,
      };

      let features = row.feature_permissions?.length
        ? normalizeFeaturePermissions(row.feature_permissions)
        : resolveFeaturePermissions({ ...userLike, featurePermissions: [] });

      // Admin role without products/wholesale/ai (template alignment) when still on old all-features dump
      const roles = row.roles?.length ? row.roles : [row.role];
      if (
        roles.includes("admin") &&
        !roles.includes("super_admin") &&
        !roles.includes("owner") &&
        row.feature_permissions?.includes("system_settings")
      ) {
        // Was catch-all admin; prefer admin template set if they had old full list
        const adminTpl = resolveFeaturePermissions({
          role: "admin",
          roles: ["admin"],
          featurePermissions: [],
        });
        features = adminTpl;
      }

      const dataPerm = resolveDataPermission(userLike);
      const prev = row.feature_permissions ?? [];
      if (!prev.length) filled++;
      else if (!arraysEqual(prev, features)) remapped++;

      if (!arraysEqual(prev, features) || row.data_permission !== dataPerm) {
        await pool.query(
          `UPDATE users SET feature_permissions = $1, data_permission = $2 WHERE id = $3`,
          [features, dataPerm, row.id],
        );
      }
    }

    if (filled > 0 || remapped > 0) {
      logger.info(
        `功能權限遷移：填入 ${filled} 位、重新對應 ${remapped} 位使用者`,
      );
    }
  } catch (err) {
    logger.error({ err }, "功能權限遷移失敗");
  }
}
