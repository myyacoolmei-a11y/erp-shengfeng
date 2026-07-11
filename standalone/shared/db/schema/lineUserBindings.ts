import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const lineUserBindingsTable = pgTable("line_user_bindings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  lineUserId: text("line_user_id").notNull().unique(),
  displayName: text("display_name"),
  enabled: boolean("enabled").notNull().default(true),
  boundAt: timestamp("bound_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LineUserBinding = typeof lineUserBindingsTable.$inferSelect;
