import { Redirect } from "wouter";

/** @deprecated 請使用 /ai-assistant */
export default function ReminderSettingsPage() {
  return <Redirect to="/ai-assistant" />;
}
