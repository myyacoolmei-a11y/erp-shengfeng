import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

/** 公司 AI 工作提醒預設（單筆設定） */
export const companyAiWorkReminderSettingsTable = pgTable("company_ai_work_reminder_settings", {
  id: serial("id").primaryKey(),
  scenariosJson: text("scenarios_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CompanyAiWorkReminderSettingsRow = typeof companyAiWorkReminderSettingsTable.$inferSelect;
