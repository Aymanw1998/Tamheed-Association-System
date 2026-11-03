import { useEffect, useRef } from "react";

// A screen that was blocked shows data read before the other tab saved.
// When the lock is finally won, read the item again.
export default function useReloadOnUnblock(status, reload) {
  const wasBlocked = useRef(false);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (status === "blocked") wasBlocked.current = true;
    else if (status === "held" && wasBlocked.current) {
      wasBlocked.current = false;
      reloadRef.current?.();
    }
  }, [status]);
}
