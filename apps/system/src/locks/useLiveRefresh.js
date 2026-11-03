import { useEffect, useRef } from "react";
import { liveEvents } from "../WebServer/services/live/liveStream";

export const REFRESH_DEBOUNCE_MS = 300;

// Reloads a list screen when someone changes one of `entities` (events carry
// only { entity, id }: the screen re-reads through its own API call), debounced
// so a burst of changes reloads once. Also reloads once whenever the live
// stream reopens, since events sent while it was closed are not replayed.
export default function useLiveRefresh(entities, reload) {
  const reloadRef = useRef(reload);
  const entitiesRef = useRef(entities);
  reloadRef.current = reload;
  entitiesRef.current = entities;

  useEffect(() => {
    let timer = null;
    const run = () => {
      try {
        const result = reloadRef.current?.();
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch (error) {
        console.error("live refresh error", error);
      }
    };
    const offChange = liveEvents.on("change", (payload) => {
      if (!payload || !(entitiesRef.current || []).includes(payload.entity)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        run();
      }, REFRESH_DEBOUNCE_MS);
    });
    const offOpen = liveEvents.on("open", run);
    return () => {
      clearTimeout(timer);
      offChange();
      offOpen();
    };
  }, []);
}
