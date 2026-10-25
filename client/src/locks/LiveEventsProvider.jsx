import { useEffect } from "react";
import { openLiveStream, liveEvents } from "../WebServer/services/live/liveStream";

// The one app-wide live connection while the user is signed in. It feeds the
// liveEvents bus (change, lock, open) that screens and useItemLock listen to.
// Training mode never connects (openLiveStream handles it).
export default function LiveEventsProvider({ children = null }) {
  useEffect(
    () =>
      openLiveStream({
        onChange: (payload) => liveEvents.emit("change", payload),
        onLock: (payload) => liveEvents.emit("lock", payload),
        onOpen: () => liveEvents.emit("open", {}),
      }),
    []
  );
  return children;
}
