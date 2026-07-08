import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { APP_BRAND } from "./lib/appBrand";

document.title = APP_BRAND.nameZh;

createRoot(document.getElementById("root")!).render(<App />);
