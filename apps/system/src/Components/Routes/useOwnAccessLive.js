import { useEffect, useSyncExternalStore } from "react";
import { liveEvents } from "../../WebServer/services/live/liveStream";
import { getMe } from "../../WebServer/services/auth/fuctionsAuth";
import { getStoredUserId, rememberSessionUser, subscribePermissions, getPermissionsVersion } from "../../utils/session";

// A number that changes whenever the stored permissions or roles change; the
// layout keys the menu and the page with it so they redraw.
export const usePermissionsVersion = () => useSyncExternalStore(subscribePermissions, getPermissionsVersion);

// When an admin changes this user's permissions or role, the server tells
// every staff screen "user <id> changed". This user's own screen then reloads
// its access from /auth/me; rememberSessionUser announces a real change and
// the layout redraws (owner, 2026-11-02). A reconnected channel may have
// missed the event, so it reloads too. A failed reload keeps what is stored.
export default function useOwnAccessLive() {
  useEffect(() => {
    const reload = async () => {
      const me = await getMe();
      if (me) rememberSessionUser(me);
    };
    const offChange = liveEvents.on("change", (payload) => {
      const mine = getStoredUserId();
      if (payload?.entity === "user" && mine && String(payload.id) === mine) reload();
    });
    const offOpen = liveEvents.on("open", reload);
    return () => { offChange(); offOpen(); };
  }, []);
}
