import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";
import { APP_BRAND } from "./lib/appBrand";

document.title = APP_BRAND.pwaName;

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      registration.update().catch(() => {
        /* offline or transient — ignore */
      });
    }
  },
});

createRoot(document.getElementById("root")!).render(<App />);
