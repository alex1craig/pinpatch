import { createRoot } from "react-dom/client";
import { OverlayApp } from "./components/overlay-app";
import "./styles.css";

const mountOverlay = (): void => {
  const globalWindow = window as typeof window & { __PINPATCH_OVERLAY_MOUNTED__?: boolean };
  if (globalWindow.__PINPATCH_OVERLAY_MOUNTED__) {
    return;
  }

  globalWindow.__PINPATCH_OVERLAY_MOUNTED__ = true;

  const container = document.createElement("div");
  container.id = "pinpatch-overlay-root";
  container.classList.add("pinpatch-ui-theme");
  container.setAttribute("data-theme", "light");
  container.style.colorScheme = "light";
  container.style.background = "transparent";
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<OverlayApp />);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountOverlay(), { once: true });
} else {
  mountOverlay();
}
