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

export function isPwaStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export interface WebPushDiagnosticState {
  pwaStandalone: boolean;
  serviceWorkerSupported: boolean;
  serviceWorkerReady: boolean;
  serviceWorkerController: boolean;
  serviceWorkerScriptUrl: string | null;
  pushSwScriptReachable: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  pushSubscriptionExists: boolean;
  pushSubscriptionEndpoint: string | null;
  vapidPublicKeyPresent: boolean;
  subscriptionSavedInDb: boolean;
  dbDeviceCount: number;
  dbEnabledCount: number;
  currentEndpointInDb: boolean;
  errors: string[];
}

export interface PushSubscribeFlowResult {
  ok: boolean;
  message: string;
  diagnostics: WebPushDiagnosticState;
}

export interface DbPushSubscription {
  id: number;
  endpoint: string;
  deviceName: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface WebPushTestResult {
  vapidConfigured: boolean;
  foundCount: number;
  sentCount: number;
  successCount: number;
  failCount: number;
  results: Array<{
    subscriptionId: number;
    deviceName: string | null;
    endpointPreview: string;
    success: boolean;
    statusCode?: number;
    errorMessage?: string;
    deleted: boolean;
  }>;
  overallSuccess: boolean;
  message: string;
}

async function checkPushSwReachable(): Promise<boolean> {
  try {
    const res = await fetch("/push-sw.js", { cache: "no-store" });
    return res.ok && (await res.text()).includes("addEventListener(\"push\"");
  } catch {
    return false;
  }
}

export async function collectWebPushDiagnostics(): Promise<WebPushDiagnosticState> {
  const errors: string[] = [];
  const pwaStandalone = isPwaStandalone();
  const serviceWorkerSupported = "serviceWorker" in navigator;

  let serviceWorkerReady = false;
  let serviceWorkerController = false;
  let serviceWorkerScriptUrl: string | null = null;

  if (serviceWorkerSupported) {
    serviceWorkerController = !!navigator.serviceWorker.controller;
    try {
      const reg = await navigator.serviceWorker.ready;
      serviceWorkerReady = !!reg;
      serviceWorkerScriptUrl = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? null;
      if (!serviceWorkerController && reg.active) {
        serviceWorkerController = true;
      }
    } catch (err) {
      errors.push(`serviceWorker.ready 失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    errors.push("此瀏覽器不支援 Service Worker");
  }

  const pushSwScriptReachable = await checkPushSwReachable();
  if (!pushSwScriptReachable) {
    errors.push("無法載入 /push-sw.js（push 事件處理器可能未註冊）");
  }

  const notificationPermission: NotificationPermission | "unsupported" =
    "Notification" in window ? Notification.permission : "unsupported";

  let pushSubscriptionExists = false;
  let pushSubscriptionEndpoint: string | null = null;

  if (serviceWorkerSupported && serviceWorkerReady) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      pushSubscriptionExists = !!sub;
      pushSubscriptionEndpoint = sub?.endpoint ?? null;
    } catch (err) {
      errors.push(`getSubscription 失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let vapidPublicKeyPresent = false;
  try {
    const res = await authFetch("/api/notifications/vapid-public-key");
    if (res.ok) {
      const data = (await res.json()) as { publicKey: string | null; configured: boolean };
      vapidPublicKeyPresent = !!(data.configured && data.publicKey);
      if (!vapidPublicKeyPresent) errors.push("伺服器 VAPID 公鑰未設定");
    }
  } catch (err) {
    errors.push(`讀取 VAPID 公鑰失敗：${err instanceof Error ? err.message : String(err)}`);
  }

  let dbDeviceCount = 0;
  let dbEnabledCount = 0;
  let currentEndpointInDb = false;
  let subscriptionSavedInDb = false;

  try {
    const res = await authFetch("/api/notifications/push/subscriptions");
    if (res.ok) {
      const data = (await res.json()) as { subscriptions: DbPushSubscription[] };
      dbDeviceCount = data.subscriptions.length;
      dbEnabledCount = data.subscriptions.filter(s => s.enabled).length;
      if (pushSubscriptionEndpoint) {
        currentEndpointInDb = data.subscriptions.some(s => s.endpoint === pushSubscriptionEndpoint && s.enabled);
      }
      subscriptionSavedInDb = dbEnabledCount > 0 && (!pushSubscriptionEndpoint || currentEndpointInDb);
    }
  } catch (err) {
    errors.push(`讀取資料庫 subscription 失敗：${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    pwaStandalone,
    serviceWorkerSupported,
    serviceWorkerReady,
    serviceWorkerController,
    serviceWorkerScriptUrl,
    pushSwScriptReachable,
    notificationPermission,
    pushSubscriptionExists,
    pushSubscriptionEndpoint,
    vapidPublicKeyPresent,
    subscriptionSavedInDb,
    dbDeviceCount,
    dbEnabledCount,
    currentEndpointInDb,
    errors,
  };
}

/** Unregister all SW and reload to pick up latest push-sw.js */
export async function reregisterServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(r => r.unregister()));
  window.location.reload();
}

/** Full subscribe flow: permission → subscribe → save → verify DB */
export async function runPushSubscribeFlow(deviceName?: string): Promise<PushSubscribeFlowResult> {
  const errors: string[] = [];

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: "此瀏覽器不支援 Web Push", diagnostics };
  }

  if (Notification.permission === "denied") {
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: "通知權限已被拒絕", diagnostics };
  }

  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      const diagnostics = await collectWebPushDiagnostics();
      return { ok: false, message: "未授予通知權限", diagnostics };
    }
  }

  const keyRes = await authFetch("/api/notifications/vapid-public-key");
  if (!keyRes.ok) {
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: "無法取得 VAPID 公鑰", diagnostics };
  }
  const { publicKey } = (await keyRes.json()) as { publicKey: string | null };
  if (!publicKey) {
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: "伺服器尚未設定 VAPID 金鑰", diagnostics };
  }

  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.ready;
  } catch (err) {
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: `Service Worker 未就緒：${err instanceof Error ? err.message : String(err)}`, diagnostics };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch (err) {
      const diagnostics = await collectWebPushDiagnostics();
      return { ok: false, message: `subscribe 失敗：${err instanceof Error ? err.message : String(err)}`, diagnostics };
    }
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: "subscription 缺少 endpoint 或 keys", diagnostics };
  }

  const saveRes = await authFetch("/api/notifications/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      deviceName: deviceName ?? (isPwaStandalone() ? "iPhone PWA" : undefined),
    }),
  });

  if (!saveRes.ok) {
    const text = await saveRes.text();
    errors.push(`儲存 subscription 失敗：${text}`);
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: text || "訂閱儲存失敗", diagnostics };
  }

  const saveData = (await saveRes.json()) as { verified: boolean; dbCount: number };
  if (!saveData.verified) {
    errors.push("儲存後驗證失敗：資料庫找不到此 endpoint");
  }

  const diagnostics = await collectWebPushDiagnostics();
  if (diagnostics.dbEnabledCount === 0) {
    return { ok: false, message: "此手機尚未完成推播訂閱（資料庫無有效記錄）", diagnostics };
  }

  return {
    ok: true,
    message: `推播訂閱成功，資料庫共 ${diagnostics.dbEnabledCount} 筆裝置`,
    diagnostics,
  };
}

export async function sendServerTestPush(): Promise<WebPushTestResult> {
  const res = await authFetch("/api/notifications/push/test", { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "測試推播請求失敗");
  }
  return res.json() as Promise<WebPushTestResult>;
}

export async function fetchPushSubscriptions(): Promise<DbPushSubscription[]> {
  const res = await authFetch("/api/notifications/push/subscriptions");
  if (!res.ok) throw new Error("無法讀取 subscription 列表");
  const data = (await res.json()) as { subscriptions: DbPushSubscription[] };
  return data.subscriptions;
}
