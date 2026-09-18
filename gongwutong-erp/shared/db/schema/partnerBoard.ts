import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const PARTNER_BOARD_KEYS = ["daily_quote", "announcement", "applause"] as const;
export type PartnerBoardKey = (typeof PARTNER_BOARD_KEYS)[number];

/** Singleton content blocks for 晟風夥伴 engineer home. */
export const partnerBoardTable = pgTable("partner_board", {
  key: text("key").primaryKey(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedByUserId: integer("updated_by_user_id"),
});

export type PartnerBoardItem = typeof partnerBoardTable.$inferSelect;
