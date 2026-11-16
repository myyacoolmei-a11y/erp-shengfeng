import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env["JWT_SECRET"] || "dev-jwt-secret-change-before-deploying";

export interface QuoteSharePayload {
  typ: "quote_share";
  quoteId: number;
}

export function signQuoteShareToken(quoteId: number): string {
  return jwt.sign({ typ: "quote_share", quoteId } satisfies QuoteSharePayload, JWT_SECRET, {
    expiresIn: "30d",
  });
}

export function verifyQuoteShareToken(token: string): { quoteId: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Partial<QuoteSharePayload>;
    if (payload.typ !== "quote_share" || payload.quoteId == null) return null;
    const quoteId = Number(payload.quoteId);
    if (!Number.isFinite(quoteId) || quoteId <= 0) return null;
    return { quoteId };
  } catch {
    return null;
  }
}
