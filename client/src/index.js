import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import AppErrorBoundary from "./Components/Global/AppErrorBoundary";
import { ConfirmProvider } from "./Components/Provides/ConfirmContext";
import { ToastProvider, SystemStatusWatcher, SystemEventSubscriber, StatusBadge, useToast, toast } from "./ALERT/SystemToasts";
import { initApiBase } from "./WebServer/services/api";

const installSafeStorageDefaults = () => {
  if (typeof window === "undefined" || !window.Storage) return;

  const fallbackByKey = {
    roles: "",
    role: "",
    user_id: "",
    accessToken: "",
  };

  const nativeGetItem = Storage.prototype.getItem;
  if (nativeGetItem.__codexSafeWrapped) return;

  const safeGetItem = function safeGetItem(key) {
    const value = nativeGetItem.call(this, key);
    if (value == null && Object.prototype.hasOwnProperty.call(fallbackByKey, key)) {
      return fallbackByKey[key];
    }
    return value;
  };

  safeGetItem.__codexSafeWrapped = true;
  Storage.prototype.getItem = safeGetItem;
};

installSafeStorageDefaults();

window.onerror = (m, s, l, c, e) => console.error("[window.onerror]", m, e);
window.onunhandledrejection = (e) => console.error("[unhandledrejection]", e.reason || e);

function DevToastPing() {
  const { push } = useToast();
  useEffect(() => {
    window.toast = toast;
  }, [push]);
  return null;
}

// Every page's first mount fires data-fetching requests (Header's getMe(),
// each route's own load effect, etc.) immediately on render. Rendering
// before initApiBase() resolves let those requests go out with no baseURL
// set yet, resolving against the page's own origin instead of the API
// server and failing outright (visible as a burst of 404s against
// localhost:3000 followed by the real, working requests against the actual
// API host) - components then had no way to know their very first fetch was
// against the wrong server. Wait for it here instead of racing it.
initApiBase()
  .catch((err) => console.error("Error initializing API base URL:", err))
  .finally(() => {
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(
      <ConfirmProvider>
        <ToastProvider rtl baseZIndex={999999}>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>

          {/* <SystemStatusWatcher
            options={{
              healthUrl: `/health`,
              intervalMs: 5000,
              getToken: () => localStorage.getItem("accessToken"),
              warnBeforeExpirySec: 300,
            }}
          /> */}

          {/* <SystemEventSubscriber/> */}

          <StatusBadge />

          <DevToastPing />
        </ToastProvider>
      </ConfirmProvider>
    );

    reportWebVitals();
  });
