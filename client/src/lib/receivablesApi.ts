import { customFetch } from "../../../shared/api-client/custom-fetch.ts";
import type { Receivable } from "@workspace/api-client-react";

export async function reverseReceivablePayment(
  id: number,
  data: { reason: string; paymentId?: number },
): Promise<Receivable> {
  return customFetch(`/api/receivables/${id}/reverse-payment`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
