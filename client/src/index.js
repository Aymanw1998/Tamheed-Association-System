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

initApiBase().then(() => {}).catch((err) => {console.error("Error initializing API base URL:", err);});
function DevToastPing() {
  const { push } = useToast();
  useEffect(() => {
    window.toast = toast;
  }, [push]);
  return null;
}

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
