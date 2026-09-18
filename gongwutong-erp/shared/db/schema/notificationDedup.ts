import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Prevent duplicate notification sends for the same event. */
export const notificationDedupTable = pgTable("notification_dedup", {
  dedupeKey: text("dedupe_key").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
