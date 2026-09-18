import { pool } from "@workspace/db";
import { logger } from "../logger";

export async function ensureDispatchNotificationsMigration(): Promise<boolean> {
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_dispatch_notifications boolean NOT NULL DEFAULT true;

      CREATE TABLE IF NOT EXISTS field_progress_events (
        id serial PRIMARY KEY,
        work_order_id integer NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
        customer_name text,
        engineer_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        engineer_name text NOT NULL,
        action text NOT NULL,
        action_label text NOT NULL,
        acted_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_field_progress_events_work_order
        ON field_progress_events (work_order_id);
      CREATE INDEX IF NOT EXISTS idx_field_progress_events_acted_at
        ON field_progress_events (acted_at DESC);

      CREATE TABLE IF NOT EXISTS in_app_notifications (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind text NOT NULL DEFAULT 'field_progress',
        title text NOT NULL,
        body text NOT NULL,
        payload jsonb,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread
        ON in_app_notifications (user_id, read_at, created_at DESC);

      CREATE TABLE IF NOT EXISTS user_push_subscriptions (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint text NOT NULL UNIQUE,
        p256dh text NOT NULL,
        auth text NOT NULL,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user
        ON user_push_subscriptions (user_id);
    `);

    logger.info("DB migration: dispatch notifications + in-app + push subscriptions ready");
    return true;
  } catch (err) {
    logger.error({ err }, "DB migration failed: dispatch notifications");
    return false;
  }
}
