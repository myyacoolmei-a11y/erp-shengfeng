import { Redirect } from "wouter";

/** @deprecated 請使用 /ai-assistant?tab=work-reminders */
export default function AiWorkRemindersPage() {
  return <Redirect to="/ai-assistant?tab=work-reminders" />;
}
