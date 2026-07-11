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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function subscribeWebPush(): Promise<boolean> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  if (Notification.permission === "denied") return false;

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") return false;

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return false;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const res = await authFetch("/api/notifications/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
  return res.ok;
}
