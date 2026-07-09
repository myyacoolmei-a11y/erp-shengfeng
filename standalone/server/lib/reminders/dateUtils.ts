const TAIPEI_TZ = "Asia/Taipei";

export function taipeiToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TAIPEI_TZ });
}

export function taipeiNowHm(): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: TAIPEI_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function parseReminderTime(value: string): { hour: number; minute: number } | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}
