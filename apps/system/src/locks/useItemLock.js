import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import api, { API_BASE_URL, getAuthToken } from "../WebServer/services/api";
import { liveEvents } from "../WebServer/services/live/liveStream";
import { isDemo } from "../journey/demoMode";
import { getClientId } from "./clientId";
import StillHereDialog from "./StillHereDialog";

export const HEARTBEAT_MS = 20 * 1000;
export const RETRY_MS = 15 * 1000;
export const IDLE_MS = 10 * 60 * 1000;
export const ANSWER_MS = 60 * 1000;
// The server lets a lock lapse 120 s after its last heartbeat.
export const LOCK_TTL_MS = 120 * 1000;
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
//   reason (readonly only): "forced" (an admin released it), "expired" (no
//           heartbeat got through for 120 s), "idle" (no answer to «هل ما زلت
//           هنا؟»), "denied" (no permission to take it), or null.
// A null key or enabled:false needs no lock (a new item): status is "held".
// Training mode makes no lock calls at all (the demo adapter would refuse
// them): status is "held".
export default function useItemLock(key, { enabled = true } = {}) {
  const active = Boolean(key) && enabled;
  // A viewer who may not edit never takes the lock, but must not enter an item
  // someone else holds: he only watches it (GET /locks/:key).
  const watching = Boolean(key) && !enabled;
  const [state, setState] = useState({ key, status: active || watching ? "loading" : "held", holder: null, reason: null });
  const stateRef = useRef(state);
  const apply = useCallback((next) => {
    stateRef.current = next;
    setState(next);
  }, []);
  // The key of the state is tracked so a changed key never shows the old
  // item's status, not even for one render.
  const controls = useRef({});

  useEffect(() => {
    if (watching && !isDemo()) {
      let alive = true;
      const check = async () => {
        try {
          const { data } = await api.get(`/locks/${encodeURIComponent(key)}`);
          if (!alive) return;
          apply({ key, status: data?.holder ? "blocked" : "held", holder: data?.holder || null });
        } catch {
          // A failed check never leaves the viewer on «loading»: he may read.
          if (alive && (stateRef.current.key !== key || stateRef.current.status === "loading")) apply({ key, status: "held", holder: null });
        }
      };
      apply({ key, status: "loading", holder: null });
      check();
      const timer = setInterval(check, RETRY_MS);
      const offLock = liveEvents.on("lock", (payload) => {
        if (payload?.key === key) check();
      });
      return () => {
        alive = false;
        clearInterval(timer);
        offLock();
      };
    }
    if (!active || isDemo()) {
      apply({ key, status: "held", holder: null });
      return undefined;
    }
    let alive = true;
    let heartbeatTimer = null;
    let retryTimer = null;
    let idleTimer = null;
    let answerTimer = null;
    let closeDialog = null;
    let acquiring = false;
    let lastBeatOk = 0;

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
    const sendRelease = () => (isDemo() ? Promise.resolve() : api.post("/locks/release", { key }).catch(() => {}));
    const set = (next) => apply({ key, reason: null, ...next });

    const goReadonly = (reason = null) => {
      clearTimers();
      hideDialog();
      set({ status: "readonly", holder: null, reason });
    };
    const lapsed = () => Date.now() - lastBeatOk >= LOCK_TTL_MS;

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
          goReadonly("idle");
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
      set({ status: "held", holder: null });
      lastBeatOk = Date.now();
      armIdle();
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(async () => {
        if (isDemo()) return;
        try {
          await api.post("/locks/heartbeat", { key });
          lastBeatOk = Date.now();
        } catch (error) {
          if (!alive || status() !== "held") return;
          const code = error?.response?.status;
          // Lost while beats were getting through: someone released it.
          if (code === 410) goReadonly(lapsed() ? "expired" : "forced");
          // No beat got through for the whole lifetime: the server let it lapse.
          else if (lapsed()) goReadonly("expired");
        }
      }, HEARTBEAT_MS);
    };

    const startBlocked = (holder) => {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      set({ status: "blocked", holder: holder || null });
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
        else if (error?.response?.status === 403) goReadonly("denied"); // no permission: never retried
        else if (!retryTimer) retryTimer = setInterval(() => acquire(), RETRY_MS); // network or server error: try again
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
        set({ status: "readonly", holder: null });
      },
      retry: () => {
        if (status() === "held") return;
        set({ status: "loading", holder: null });
        acquire();
      },
    };

    const offLock = liveEvents.on("lock", (payload) => {
      if (payload?.key === key && status() === "blocked") acquire();
    });
    const onPageHide = () => {
      if (isDemo() || status() !== "held" || typeof navigator.sendBeacon !== "function") return;
      // A beacon cannot send headers: the client id and token go in the body.
      const body = JSON.stringify({ key, clientId: getClientId(), token: getAuthToken() });
      navigator.sendBeacon(`${API_BASE_URL}/locks/release`, new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onPageHide);
    INPUT_EVENTS.forEach((name) => window.addEventListener(name, onInput, true));

    set({ status: "loading", holder: null });
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
  }, [key, active, watching, apply]);

  const release = useCallback(() => controls.current.release?.(), []);
  const retry = useCallback(() => controls.current.retry?.(), []);
  if (!active && !watching) return { status: "held", holder: null, reason: null, release, retry };
  if (state.key !== key) return { status: "loading", holder: null, reason: null, release, retry };
  return { status: state.status, holder: state.holder, reason: state.reason ?? null, release, retry };
}
