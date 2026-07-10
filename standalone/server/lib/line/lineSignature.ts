import crypto from "node:crypto";
import { getLineChannelSecret } from "./lineConfig.ts";

export function verifyLineSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = getLineChannelSecret();
  if (!secret || !signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
