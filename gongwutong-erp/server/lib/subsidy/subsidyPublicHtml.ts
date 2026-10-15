import type { Request } from "express";

export function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function requestOrigin(req: Pick<Request, "protocol" | "get">): string {
  const env = process.env["PUBLIC_APP_URL"] || process.env["APP_URL"];
  if (env) return env.replace(/\/$/, "");
  const xfProto = req.get("x-forwarded-proto");
  const proto = (xfProto?.split(",")[0]?.trim() || req.protocol || "https").replace(/:$/, "");
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  return `${proto}://${host}`;
}

/** Customer-facing SPA path (token verified by public API). */
export function subsidyPublicUploadPath(token: string): string {
  return `/subsidy-upload/${encodeURIComponent(token)}`;
}

/** Backend public API base for status / upload (same token). */
export function subsidyPublicUploadApiPath(token: string): string {
  return `/api/public/subsidy-upload/${encodeURIComponent(token)}`;
}
