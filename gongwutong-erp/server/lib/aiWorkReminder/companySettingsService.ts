import { eq } from "drizzle-orm";
import { db, companyAiWorkReminderSettingsTable } from "@workspace/db";
import {
  type CompanyAiWorkReminderSettings,
  defaultCompanyAiWorkReminderSettings,
  parseCompanyAiWorkReminderSettings,
} from "../../../shared/aiWorkReminder.ts";

export async function getCompanyAiWorkReminderSettings(): Promise<CompanyAiWorkReminderSettings> {
  const rows = await db
    .select()
    .from(companyAiWorkReminderSettingsTable)
    .limit(1);

  if (rows.length === 0) {
    return defaultCompanyAiWorkReminderSettings();
  }

  try {
    const parsed = JSON.parse(rows[0].scenariosJson);
    return parseCompanyAiWorkReminderSettings(parsed);
  } catch {
    return defaultCompanyAiWorkReminderSettings();
  }
}

export async function updateCompanyAiWorkReminderSettings(
  input: CompanyAiWorkReminderSettings,
): Promise<CompanyAiWorkReminderSettings> {
  const normalized = parseCompanyAiWorkReminderSettings(input);
  const json = JSON.stringify(normalized);

  const existing = await db
    .select({ id: companyAiWorkReminderSettingsTable.id })
    .from(companyAiWorkReminderSettingsTable)
    .limit(1);

  if (existing.length === 0) {
    await db.insert(companyAiWorkReminderSettingsTable).values({
      scenariosJson: json,
    });
  } else {
    await db
      .update(companyAiWorkReminderSettingsTable)
      .set({ scenariosJson: json })
      .where(eq(companyAiWorkReminderSettingsTable.id, existing[0].id));
  }

  return normalized;
}
