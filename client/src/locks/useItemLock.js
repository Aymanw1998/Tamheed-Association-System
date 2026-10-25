import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import api, { API_BASE_URL, getAuthToken } from "../WebServer/services/api";
import { liveEvents } from "../WebServer/services/live/liveStream";
import { getClientId } from "./clientId";
import StillHereDialog from "./StillHereDialog";

export const HEARTBEAT_MS = 20 * 1000;
export const RETRY_MS = 15 * 1000;
export const IDLE_MS = 10 * 60 * 1000;
export const ANSWER_MS = 60 * 1000;
const INPUT_EVENTS = ["keydown", "click", "touchstart"];

// Mounts «هل ما زلت هنا؟» outside the React tree of the screen; returns a closer.
function showStillHere(onStay) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(React.createElement(StillHereDialog, { onStay }));
  return () => {
    root.unmount();
    host.remove();
  };
}

// Holds the lock of one item for this tab while the screen is open.
//   status: "loading" | "held" | "blocked" (someone else holds it, see holder)
//           | "readonly" (lock lost, released after idling, or not acquirable)
// A null key or enabled:false needs no lock (a new item): status is "held".
export default function useItemLock(key, { enabled = true } = {}) {
  const active = Boolean(key) && enabled;
  const [state, setState] = useState({ status: active ? "loading" : "held", holder: null });
  const stateRef = useRef(state);
  const apply = useCallback((next) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const controls = useRef({});

  useEffect(() => {
    if (!active) {
      apply({ status: "held", holder: null });
      return undefined;
    }
    let alive = true;
    let heartbeatTimer = null;
    let retryTimer = null;
    let idleTimer = null;
    let answerTimer = null;
    let closeDialog = null;
    let acquiring = false;

    const status = () => stateRef.current.status;
    const clearTimers = () => {
      clearInterval(heartbeatTimer);
      clearInterval(retryTimer);
      clearTimeout(idleTimer);
      clearTimeout(answerTimer);
      heartbeatTimer = retryTimer = idleTimer = answerTimer = null;
    };
    const hideDialog = () => {
      clearTimeout(answerTimer);
      answerTimer = null;
      if (closeDialog) {
        closeDialog();
        closeDialog = null;
      }
    };
    const sendRelease = () => api.post("/locks/release", { key }).catch(() => {});

    const goReadonly = () => {
      clearTimers();
      hideDialog();
      apply({ status: "readonly", holder: null });
    };

    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!alive || status() !== "held") return;
        closeDialog = showStillHere(() => {
          hideDialog();
          armIdle();
        });
        answerTimer = setTimeout(() => {
          if (!alive) return;
          goReadonly();
          sendRelease();
        }, ANSWER_MS);
      }, IDLE_MS);
    };
    const onInput = () => {
      if (status() === "held" && !closeDialog) armIdle();
    };

    const startHeld = () => {
      clearInterval(retryTimer);
      retryTimer = null;
      apply({ status: "held", holder: null });
      armIdle();
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(async () => {
        try {
          await api.post("/locks/heartbeat", { key });
        } catch (error) {
          if (alive && error?.response?.status === 410) goReadonly();
        }
      }, HEARTBEAT_MS);
    };

    const startBlocked = (holder) => {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      apply({ status: "blocked", holder: holder || null });
      if (!retryTimer) retryTimer = setInterval(() => acquire(), RETRY_MS);
    };

    async function acquire() {
      if (!alive || acquiring) return;
      acquiring = true;
      try {
        await api.post("/locks/acquire", { key });
        if (!alive) {
          sendRelease();
          return;
        }
        startHeld();
      } catch (error) {
        if (!alive) return;
        if (error?.response?.status === 423) startBlocked(error.response.data?.holder);
        else if (status() === "blocked") return; // keep trying on the timer
        else goReadonly();
      } finally {
        acquiring = false;
      }
    }

    controls.current = {
      release: async () => {
        if (status() === "held") {
          clearTimers();
          hideDialog();
          await sendRelease();
        }
        apply({ status: "readonly", holder: null });
      },
      retry: () => {
        if (status() === "held") return;
        apply({ status: "loading", holder: null });
        acquire();
      },
    };

    const offLock = liveEvents.on("lock", (payload) => {
      if (payload?.key === key && status() === "blocked") acquire();
    });
    const onPageHide = () => {
      if (status() !== "held" || typeof navigator.sendBeacon !== "function") return;
      // A beacon cannot send headers: the client id and token go in the body.
      const body = JSON.stringify({ key, clientId: getClientId(), token: getAuthToken() });
      navigator.sendBeacon(`${API_BASE_URL}/locks/release`, new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onPageHide);
    INPUT_EVENTS.forEach((name) => window.addEventListener(name, onInput, true));

    apply({ status: "loading", holder: null });
    acquire();

    return () => {
      const wasHeld = status() === "held";
      alive = false;
      offLock();
      window.removeEventListener("pagehide", onPageHide);
      INPUT_EVENTS.forEach((name) => window.removeEventListener(name, onInput, true));
      clearTimers();
      hideDialog();
      if (wasHeld) sendRelease();
      controls.current = {};
    };
  }, [key, active, apply]);

  const release = useCallback(() => controls.current.release?.(), []);
  const retry = useCallback(() => controls.current.retry?.(), []);
  return { status: state.status, holder: state.holder, release, retry };
}
