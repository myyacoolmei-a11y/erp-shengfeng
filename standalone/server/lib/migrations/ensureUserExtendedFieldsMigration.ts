import { pool } from "@workspace/db";
import { logger } from "../logger";
import { resolveFeaturePermissions, resolveDataPermission } from "../../../shared/userPermissions.ts";

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

/** Backfill feature_permissions from legacy roles when empty */
export async function migrateUserFeaturePermissions(): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: number;
      role: string;
      roles: string[] | null;
      feature_permissions: string[] | null;
      data_permission: string | null;
    }>(`SELECT id, role, roles, feature_permissions, data_permission FROM users`);

    let count = 0;
    for (const row of rows) {
      if (row.feature_permissions?.length) continue;

      const userLike = {
        role: row.role,
        roles: row.roles ?? [],
        featurePermissions: [],
        dataPermission: row.data_permission,
      };
      const features = resolveFeaturePermissions(userLike);
      const dataPerm = resolveDataPermission(userLike);

      await pool.query(
        `UPDATE users SET feature_permissions = $1, data_permission = $2 WHERE id = $3`,
        [features, dataPerm, row.id],
      );
      count++;
    }

    if (count > 0) {
      logger.info(`角色權限遷移：已為 ${count} 位使用者填入功能權限`);
    }
  } catch (err) {
    logger.error({ err }, "功能權限遷移失敗");
  }
}
