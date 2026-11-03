import api from "../WebServer/services/api";

// Admin button «تحرير القفل» on the lock screen (permissions.manage).
export default function forceRelease(key) {
  return () => api.post("/locks/force-release", { key }).catch(() => {});
}
