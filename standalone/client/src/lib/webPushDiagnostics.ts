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

export function isIosDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
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

function bufferEquals(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const av = new Uint8Array(a);
  if (av.length !== b.length) return false;
  for (let i = 0; i < av.length; i++) {
    if (av[i] !== b[i]) return false;
  }
  return true;
}

export interface WebPushDiagnosticState {
  pwaStandalone: boolean;
  isHttps: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  serviceWorkerRegistered: boolean;
  serviceWorkerActivated: boolean;
  serviceWorkerState: string;
  serviceWorkerController: boolean;
  serviceWorkerScope: string | null;
  serviceWorkerScriptUrl: string | null;
  pushSwHasPushListener: boolean;
  browserSubscriptionExists: boolean;
  browserSubscriptionComplete: boolean;
  browserSubscriptionEndpoint: string | null;
  dbSubscriptionForCurrentDevice: boolean;
  dbEnabledCount: number;
  vapidPublicKeyPresent: boolean;
  vapidKeyMismatch: boolean;
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
    requiresResubscribe?: boolean;
  }>;
  overallSuccess: boolean;
  message: string;
}

async function checkPushSwReachable(): Promise<boolean> {
  try {
    const res = await fetch("/push-sw.js", { cache: "no-store" });
    const text = await res.text();
    return res.ok && text.includes("addEventListener(\"push\"") && text.includes("showNotification");
  } catch {
    return false;
  }
}

function resolveServiceWorkerState(reg: ServiceWorkerRegistration): {
  activated: boolean;
  state: string;
  scriptUrl: string | null;
} {
  if (reg.active?.state === "activated") {
    return { activated: true, state: "activated", scriptUrl: reg.active.scriptURL };
  }
  if (reg.installing) {
    return { activated: false, state: reg.installing.state, scriptUrl: reg.installing.scriptURL };
  }
  if (reg.waiting) {
    return { activated: false, state: reg.waiting.state, scriptUrl: reg.waiting.scriptURL };
  }
  if (reg.active) {
    return { activated: reg.active.state === "activated", state: reg.active.state, scriptUrl: reg.active.scriptURL };
  }
  return { activated: false, state: "none", scriptUrl: null };
}

async function detectVapidKeyMismatch(
  reg: ServiceWorkerRegistration,
  publicKey: string,
): Promise<boolean> {
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;
  const expectedKey = urlBase64ToUint8Array(publicKey);
  const existingKey = sub.options?.applicationServerKey ?? null;
  return !bufferEquals(existingKey, expectedKey);
}

export async function collectWebPushDiagnostics(): Promise<WebPushDiagnosticState> {
  const errors: string[] = [];
  const pwaStandalone = isPwaStandalone();
  const isHttps = window.location.protocol === "https:" || window.location.hostname === "localhost";

  if (!isHttps) {
    errors.push("網站必須使用 HTTPS 才能使用 Web Push");
  }
  if (!pwaStandalone && /iPhone|iPad/i.test(navigator.userAgent)) {
    errors.push("iPhone 必須從主畫面圖示開啟（PWA standalone 模式）");
  }

  const serviceWorkerSupported = "serviceWorker" in navigator;
  let serviceWorkerRegistered = false;
  let serviceWorkerActivated = false;
  let serviceWorkerState = "unsupported";
  let serviceWorkerController = false;
  let serviceWorkerScope: string | null = null;
  let serviceWorkerScriptUrl: string | null = null;

  if (serviceWorkerSupported) {
    serviceWorkerController = !!navigator.serviceWorker.controller;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      serviceWorkerRegistered = registrations.length > 0;
      const reg = registrations[0] ?? (await navigator.serviceWorker.ready);
      if (reg) {
        serviceWorkerRegistered = true;
        serviceWorkerScope = reg.scope;
        const swInfo = resolveServiceWorkerState(reg);
        serviceWorkerActivated = swInfo.activated;
        serviceWorkerState = swInfo.state;
        serviceWorkerScriptUrl = swInfo.scriptUrl;
        if (!serviceWorkerController && reg.active) {
          serviceWorkerController = true;
        }
        if (serviceWorkerScope && !serviceWorkerScope.startsWith(window.location.origin)) {
          errors.push(`Service Worker scope 未涵蓋此網站：${serviceWorkerScope}`);
        }
      }
    } catch (err) {
      errors.push(`Service Worker 診斷失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    errors.push("此瀏覽器不支援 Service Worker");
  }

  const pushSwHasPushListener = await checkPushSwReachable();
  if (!pushSwHasPushListener) {
    errors.push("push-sw.js 未載入或未包含 push/showNotification 處理器");
  }

  const notificationPermission: NotificationPermission | "unsupported" =
    "Notification" in window ? Notification.permission : "unsupported";

  let browserSubscriptionExists = false;
  let browserSubscriptionComplete = false;
  let browserSubscriptionEndpoint: string | null = null;

  if (serviceWorkerSupported && serviceWorkerRegistered) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      browserSubscriptionExists = !!sub;
      if (sub) {
        const json = sub.toJSON();
        browserSubscriptionEndpoint = json.endpoint ?? sub.endpoint ?? null;
        browserSubscriptionComplete = !!(
          browserSubscriptionEndpoint
          && json.keys?.p256dh
          && json.keys?.auth
        );
        if (!browserSubscriptionComplete) {
          errors.push("瀏覽器 subscription 缺少 endpoint、p256dh 或 auth");
        }
      }
    } catch (err) {
      errors.push(`getSubscription 失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let vapidPublicKeyPresent = false;
  let vapidKeyMismatch = false;
  let serverPublicKey: string | null = null;

  try {
    const res = await authFetch("/api/push/vapid-public-key");
    if (res.ok) {
      const data = (await res.json()) as { publicKey: string | null; configured: boolean };
      vapidPublicKeyPresent = !!(data.configured && data.publicKey);
      serverPublicKey = data.publicKey;
      if (!vapidPublicKeyPresent) errors.push("伺服器 VAPID 公鑰未設定");
    }
  } catch (err) {
    errors.push(`讀取 VAPID 公鑰失敗：${err instanceof Error ? err.message : String(err)}`);
  }

  if (serverPublicKey && serviceWorkerSupported && browserSubscriptionExists) {
    try {
      const reg = await navigator.serviceWorker.ready;
      vapidKeyMismatch = await detectVapidKeyMismatch(reg, serverPublicKey);
      if (vapidKeyMismatch) {
        errors.push("VAPID 公鑰不一致，需清除舊 subscription 並重新訂閱");
      }
    } catch {
      /* ignore */
    }
  }

  let dbEnabledCount = 0;
  let dbSubscriptionForCurrentDevice = false;

  try {
    const res = await authFetch("/api/notifications/push/subscriptions");
    if (res.ok) {
      const data = (await res.json()) as { subscriptions: DbPushSubscription[] };
      dbEnabledCount = data.subscriptions.filter(s => s.enabled).length;
      if (browserSubscriptionEndpoint) {
        dbSubscriptionForCurrentDevice = data.subscriptions.some(
          s => s.endpoint === browserSubscriptionEndpoint && s.enabled,
        );
      }
      if (dbEnabledCount === 0) {
        errors.push("此手機尚未完成推播訂閱");
      } else if (browserSubscriptionEndpoint && !dbSubscriptionForCurrentDevice) {
        errors.push("瀏覽器 subscription 尚未綁定至目前登入帳號的資料庫");
      }
    }
  } catch (err) {
    errors.push(`讀取資料庫 subscription 失敗：${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    pwaStandalone,
    isHttps,
    notificationPermission,
    serviceWorkerRegistered,
    serviceWorkerActivated,
    serviceWorkerState,
    serviceWorkerController,
    serviceWorkerScope,
    serviceWorkerScriptUrl,
    pushSwHasPushListener,
    browserSubscriptionExists,
    browserSubscriptionComplete,
    browserSubscriptionEndpoint,
    dbSubscriptionForCurrentDevice,
    dbEnabledCount,
    vapidPublicKeyPresent,
    vapidKeyMismatch,
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

async function deleteDbSubscription(endpoint: string): Promise<void> {
  await authFetch("/api/push/unsubscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

/** Full subscribe flow: permission → subscribe → save → verify DB */
export async function runPushSubscribeFlow(deviceName?: string): Promise<PushSubscribeFlowResult> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: "此瀏覽器不支援 Web Push", diagnostics };
  }

  if (isIosDevice() && !isPwaStandalone()) {
    const diagnostics = await collectWebPushDiagnostics();
    return {
      ok: false,
      message: "iPhone 必須從主畫面 PWA 開啟後才能訂閱推播",
      diagnostics,
    };
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

  const keyRes = await authFetch("/api/push/vapid-public-key");
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

  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();

  if (sub) {
    const mismatch = await detectVapidKeyMismatch(reg, publicKey);
    if (mismatch) {
      const oldEndpoint = sub.endpoint;
      await sub.unsubscribe();
      await deleteDbSubscription(oldEndpoint).catch(() => undefined);
      sub = null;
    }
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (err) {
      const diagnostics = await collectWebPushDiagnostics();
      return { ok: false, message: `subscribe 失敗：${err instanceof Error ? err.message : String(err)}`, diagnostics };
    }
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: "subscription 缺少 endpoint、p256dh 或 auth", diagnostics };
  }

  const saveRes = await authFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      deviceName: deviceName ?? (isPwaStandalone() ? "iPhone PWA" : undefined),
    }),
  });

  if (!saveRes.ok) {
    const text = await saveRes.text();
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: text || "訂閱儲存失敗", diagnostics };
  }

  const saveData = (await saveRes.json()) as { verified: boolean; dbCount: number };
  if (!saveData.verified) {
    const diagnostics = await collectWebPushDiagnostics();
    return { ok: false, message: "儲存後驗證失敗：資料庫找不到此 endpoint", diagnostics };
  }

  const diagnostics = await collectWebPushDiagnostics();
  if (diagnostics.dbEnabledCount === 0 || !diagnostics.dbSubscriptionForCurrentDevice) {
    return { ok: false, message: "此手機尚未完成推播訂閱（資料庫無有效記錄）", diagnostics };
  }

  return {
    ok: true,
    message: `推播訂閱成功，資料庫共 ${diagnostics.dbEnabledCount} 筆有效裝置`,
    diagnostics,
  };
}

export async function sendServerTestPush(): Promise<WebPushTestResult> {
  const res = await authFetch("/api/push/test", { method: "POST" });
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

export function formatDiagnosticLabel(state: WebPushDiagnosticState): string {
  return [
    `PWA 主畫面模式：${state.pwaStandalone ? "是" : "否"}`,
    `HTTPS：${state.isHttps ? "是" : "否"}`,
    `通知權限：${state.notificationPermission}`,
    `Service Worker 註冊：${state.serviceWorkerRegistered ? "是" : "否"}`,
    `Service Worker 狀態：${state.serviceWorkerState}`,
    `Service Worker Controller：${state.serviceWorkerController ? "存在" : "不存在"}`,
  ].join("\n");
}
