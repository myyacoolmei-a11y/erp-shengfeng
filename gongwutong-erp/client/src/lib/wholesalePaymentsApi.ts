const TOKEN_KEY = "erp_auth_token";

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json() as { error?: string };
    if (data?.error) return data.error;
  } catch {
    /* ignore */
  }
  return fallback;
}

export type WholesalePaymentRecordDto = {
  id: number;
  wholesaleCustomerId: number | null;
  wholesaleOrderId: number | null;
  amount: number;
  paymentDate: string;
  paymentMethod: string | null;
  note: string | null;
  createdBy: number | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listWholesalePaymentsByOrder(orderId: number): Promise<WholesalePaymentRecordDto[]> {
  const res = await authFetch(`/api/wholesale/settlements/payments?orderId=${orderId}`);
  if (!res.ok) throw new Error(await readError(res, "無法載入收款紀錄"));
  return res.json() as Promise<WholesalePaymentRecordDto[]>;
}

export async function createWholesalePayment(body: {
  customerId: number;
  orderId?: number;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  note?: string;
  from?: string;
  to?: string;
}): Promise<WholesalePaymentRecordDto[]> {
  const res = await authFetch("/api/wholesale/settlements/payments", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "登記收款失敗"));
  return res.json() as Promise<WholesalePaymentRecordDto[]>;
}

export async function updateWholesalePaymentRecord(
  id: number,
  body: {
    amount?: number;
    paymentDate?: string;
    paymentMethod?: string;
    note?: string | null;
  },
): Promise<WholesalePaymentRecordDto> {
  const res = await authFetch(`/api/wholesale/settlements/payments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "修改收款紀錄失敗"));
  return res.json() as Promise<WholesalePaymentRecordDto>;
}

export async function deleteWholesalePaymentRecord(id: number): Promise<void> {
  const res = await authFetch(`/api/wholesale/settlements/payments/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res, "刪除收款紀錄失敗"));
}
