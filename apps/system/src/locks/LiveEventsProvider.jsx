import { useEffect } from "react";
import { openLiveStream, liveEvents } from "../WebServer/services/live/liveStream";
import { clearTraffic } from "../WebServer/services/traffic";

// The one app-wide live connection while the user is signed in. It feeds the
// liveEvents bus (change, lock, open) that screens and useItemLock listen to.
// Training mode never connects (openLiveStream handles it).
export default function LiveEventsProvider({ children = null }) {
  useEffect(
    () =>
      openLiveStream({
        // Something changed (or the stream reconnected after missing events):
        // the reads kept in memory are dropped before the screens reload.
        onChange: (payload) => { clearTraffic(); liveEvents.emit("change", payload); },
        onLock: (payload) => liveEvents.emit("lock", payload),
        onOpen: () => { clearTraffic(); liveEvents.emit("open", {}); },
      }),
    []
  );
  return children;
}
