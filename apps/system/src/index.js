import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./generated/tokens.css";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import AppErrorBoundary from "./Components/Global/AppErrorBoundary";
import { ConfirmProvider } from "./Components/Provides/ConfirmContext";
import AppChrome, { canApplySystemUpdate } from "./pwa/AppChrome";
import { startFreshApp } from "./pwa/entryUpdate";
import ReportProblem from "./Components/Global/ReportProblem/ReportProblem";
import QueueStatus from "./pwa/QueueStatus";
import { startClientIdGuard } from "./locks/clientId";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";
import { ToastProvider, SystemStatusWatcher, StatusBadge, useToast, toast } from "./ALERT/SystemToasts";
import { startTheme } from "./utils/theme";

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
// A duplicated tab must not share this tab's lock owner id.
startClientIdGuard();

window.onerror = (m, s, l, c, e) => console.error("[window.onerror]", m, e);
window.onunhandledrejection = (e) => console.error("[unhandledrejection]", e.reason || e);

function DevToastPing() {
  const { push } = useToast();
  useEffect(() => {
    window.toast = toast;
  }, [push]);
  return null;
}

startTheme();
const root = ReactDOM.createRoot(document.getElementById("root"));
startFreshApp(() => root.render(
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


      <StatusBadge />

      <DevToastPing />

      <ReportProblem />
      <AppChrome />
      <QueueStatus />
    </ToastProvider>
  </ConfirmProvider>
), { canApply: canApplySystemUpdate });

reportWebVitals();

// Only registers in production builds.
serviceWorkerRegistration.register();
