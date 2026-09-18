import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const partnerSuggestionsTable = pgTable("partner_suggestions", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  authorUserId: integer("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  authorDisplayName: text("author_display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PartnerSuggestion = typeof partnerSuggestionsTable.$inferSelect;
