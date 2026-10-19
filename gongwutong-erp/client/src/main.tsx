import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";
import { APP_BRAND } from "./lib/appBrand";

document.title = APP_BRAND.pwaName;

/**
 * PWA updates must NOT call location.reload().
 * autoUpdate + activated(isUpdate) → reload was causing production URL-bar reload loops
 * on Railway when the new SW claimed clients.
 *
 * Providing onNeedRefresh disables the default window.location.reload() path in
 * virtual:pwa-register; the next cold navigation picks up the new worker instead.
 */
registerSW({
  immediate: true,
  onNeedRefresh() {
    /* intentionally no-op: avoid forced reload loops */
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // Periodic update check only — never reload the page here.
    const HOUR = 60 * 60 * 1000;
    window.setInterval(() => {
      registration.update().catch(() => {
        /* offline or transient — ignore */
      });
    }, HOUR);
  },
});

createRoot(document.getElementById("root")!).render(<App />);
