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

export interface InAppNotificationDto {
  id: number;
  kind: string;
  title: string;
  body: string;
  payload: { workOrderId?: number; url?: string } | null;
  readAt: string | null;
  createdAt: string;
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await authFetch("/api/notifications/unread-count");
  if (!res.ok) return 0;
  const data = (await res.json()) as { count: number };
  return data.count;
}

export async function fetchInAppNotifications(): Promise<InAppNotificationDto[]> {
  const res = await authFetch("/api/notifications/in-app");
  if (!res.ok) throw new Error("無法載入通知");
  return res.json() as Promise<InAppNotificationDto[]>;
}

export async function markNotificationRead(id: number): Promise<void> {
  const res = await authFetch(`/api/notifications/in-app/${id}/read`, { method: "PATCH" });
  if (!res.ok) throw new Error("標記已讀失敗");
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await authFetch("/api/notifications/in-app/read-all", { method: "PATCH" });
  if (!res.ok) throw new Error("標記已讀失敗");
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  const res = await authFetch("/api/notifications/vapid-public-key");
  if (!res.ok) return null;
  const data = (await res.json()) as { publicKey: string | null };
  return data.publicKey;
}

export interface NotificationPrefsDto {
  notifyInApp: boolean;
  notifyWebPush: boolean;
  notifyLine: boolean;
  webPushConfigured: boolean;
  lineBound: boolean;
  lineDisplayName: string | null;
  pushDevices: Array<{
    id: number;
    deviceName: string | null;
    enabled: boolean;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
}

export async function fetchNotificationPrefs(): Promise<NotificationPrefsDto> {
  const res = await authFetch("/api/notifications/prefs");
  if (!res.ok) throw new Error("無法載入通知設定");
  return res.json() as Promise<NotificationPrefsDto>;
}

export async function updateNotificationPrefs(data: Partial<Pick<NotificationPrefsDto, "notifyInApp" | "notifyWebPush" | "notifyLine">>): Promise<void> {
  const res = await authFetch("/api/notifications/prefs", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("更新通知設定失敗");
}

export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "vapid_missing" | "failed"; message?: string };

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function subscribeWebPush(opts?: { deviceName?: string }): Promise<PushSubscribeResult> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported", message: "此瀏覽器不支援推播通知" };
  }
  if (Notification.permission === "denied") {
    return { ok: false, reason: "denied", message: "通知權限已被拒絕，請至手機設定中重新開啟" };
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "denied", message: "未授予通知權限" };
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    return { ok: false, reason: "vapid_missing", message: "伺服器尚未設定 VAPID 金鑰" };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "failed", message: "無法建立推播訂閱" };
  }

  const res = await authFetch("/api/notifications/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      deviceName: opts?.deviceName,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, reason: "failed", message: err || "訂閱儲存失敗" };
  }
  return { ok: true };
}

export interface WorkOrderReopenInfo {
  returnReason: string;
  returnNote: string | null;
  createdAt: string;
  reopenedByName: string | null;
}

export async function fetchWorkOrderReopenInfo(workOrderId: number): Promise<WorkOrderReopenInfo | null> {
  const res = await authFetch(`/api/notifications/work-orders/${workOrderId}/reopen-info`);
  if (!res.ok) return null;
  const data = (await res.json()) as { latest: WorkOrderReopenInfo | null };
  return data.latest;
}
