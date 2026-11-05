import { pool } from "@workspace/db";
import { logger } from "../logger";

export async function ensureUnifiedNotificationsMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE user_push_subscriptions
        ADD COLUMN IF NOT EXISTS device_name text,
        ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

      CREATE TABLE IF NOT EXISTS user_notification_prefs (
        user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        notify_in_app boolean NOT NULL DEFAULT true,
        notify_web_push boolean NOT NULL DEFAULT true,
        notify_line boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      INSERT INTO user_notification_prefs (user_id, notify_in_app, notify_web_push, notify_line)
      SELECT id, COALESCE(receive_dispatch_notifications, true), true, true
      FROM users
      ON CONFLICT (user_id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS line_user_bindings (
        id serial PRIMARY KEY,
        user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        line_user_id text NOT NULL UNIQUE,
        display_name text,
        enabled boolean NOT NULL DEFAULT true,
        bound_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      INSERT INTO line_user_bindings (user_id, line_user_id, display_name, enabled, bound_at, updated_at)
      SELECT id, line_user_id, display_name, true, now(), now()
      FROM users
      WHERE line_user_id IS NOT NULL AND trim(line_user_id) <> ''
      ON CONFLICT (user_id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS notification_delivery_logs (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) ON DELETE SET NULL,
        channel text NOT NULL,
        notification_type text NOT NULL,
        title text NOT NULL,
        success boolean NOT NULL,
        error_message text,
        work_order_id integer,
        subscription_id integer,
        line_user_id text,
        dedupe_key text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_user
        ON notification_delivery_logs (user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS work_order_reopen_events (
        id serial PRIMARY KEY,
        work_order_id integer NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        reopened_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        return_reason text NOT NULL,
        return_note text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_work_order_reopen_events_work_order
        ON work_order_reopen_events (work_order_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS notification_dedup (
        dedupe_key text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    logger.info("DB migration: unified notifications ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: unified notifications");
    return false;
  }
}
