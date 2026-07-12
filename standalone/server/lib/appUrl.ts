const INVALID_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function readPublicAppBaseUrlRaw(): string {
  return (
    process.env.APP_URL?.trim()
    ?? process.env.PUBLIC_APP_URL?.trim()
    ?? process.env.APP_BASE_URL?.trim()
    ?? ""
  );
}

function assertValidPublicHost(hostname: string): void {
  if (INVALID_HOSTS.has(hostname.toLowerCase())) {
    throw new Error(`無效的 ERP 網址：${hostname}（不可使用 localhost / 127.0.0.1）`);
  }
}

function parseAndValidateUrl(raw: string, label = "ERP 網址"): URL {
  if (!raw?.trim()) {
    throw new Error(`${label} 不可為空字串或 undefined`);
  }

  let candidate = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`無效的 ${label}：${raw}`);
  }

  assertValidPublicHost(parsed.hostname);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`無效的 ${label}協議：${parsed.protocol}`);
  }

  return parsed;
}

/** Railway 正式網址，優先 APP_URL → PUBLIC_APP_URL → APP_BASE_URL */
export function getPublicAppBaseUrl(): string {
  const raw = readPublicAppBaseUrlRaw();
  if (!raw) {
    throw new Error("APP_URL / PUBLIC_APP_URL / APP_BASE_URL 未設定，無法產生 LINE 連結");
  }
  const parsed = parseAndValidateUrl(raw);
  return parsed.origin;
}

/** 相對路徑自動補成完整 https://...；拒絕 localhost / 127.0.0.1 / 空字串 */
export function toAbsoluteAppUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl?.trim() ?? "";
  if (!trimmed) {
    throw new Error("URL 不可為空字串或 undefined");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = parseAndValidateUrl(trimmed, "URL");
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  const base = getPublicAppBaseUrl();
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

export function absoluteWorkOrderViewUrl(workOrderId: number): string {
  return toAbsoluteAppUrl(`/work-orders?open=${workOrderId}`);
}
