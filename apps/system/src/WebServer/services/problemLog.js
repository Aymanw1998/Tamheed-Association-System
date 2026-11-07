// The last thing that went wrong in this tab, for «الإبلاغ عن مشكلة» (owner,
// 2026-11-04): a server error (5xx), a server that did not answer, or a crashed
// screen. A refused request (400, 403, 404...) is an answer, not a fault. After
// two minutes it no longer counts.
export const WINDOW_MS = 2 * 60 * 1000;

const SECTIONS = {
  dashboard: "الرئيسي",
  calendar: "الحضور والغياب",
  attendance: "الحضور والغياب",
  students: "الطلاب",
  users: "المستخدمون",
  lessons: "البرامج",
  reports: "التقارير",
  vehicles: "المركبات والمقطورات",
  files: "الملفات",
  notices: "الإعلانات",
  sports: "الرياضة",
  profile: "الملف الشخصي",
};

let last = null;
const listeners = new Set();
const tell = () => listeners.forEach((listener) => listener());

export const sectionOf = (pathname = "") => SECTIONS[String(pathname).split("/")[1]] || "";

const pathOf = (url = "") => {
  const clean = String(url).split("?")[0];
  return clean.startsWith("/api") ? clean : `/api${clean.startsWith("/") ? "" : "/"}${clean}`;
};

const place = () => ({ page: window.location.pathname, section: sectionOf(window.location.pathname) });

export function noteFailure(error, now = Date.now()) {
  if (!error || error.code === "ERR_CANCELED" || error.name === "CanceledError") return;
  const url = error.config?.url || "";
  if (String(url).includes("/bug-reports")) return;
  const status = error.response?.status;
  const action = `${String(error.config?.method || "get").toUpperCase()} ${pathOf(url)}`;
  if (status >= 500) {
    last = {
      kind: "server",
      at: now,
      requestId: error.response.headers?.["x-request-id"] || "",
      action,
      message: error.response.data?.message || error.response.data?.error || "",
      ...place(),
    };
  } else if (!status && String(url).includes("/live/ticket")) {
    // The live channel's background request: it retries by itself and the person
    // never saw it, so a press must not send it instead of what they did see.
    return;
  } else if (!status && window.navigator.onLine !== false) {
    last = { kind: "network", at: now, requestId: "", action, message: error.message || "", ...place() };
  } else {
    return;
  }
  tell();
}

export function noteCrash(error, now = Date.now()) {
  last = { kind: "crash", at: now, requestId: "", action: "", message: error?.message || "", ...place() };
  tell();
}

export function recentProblem(now = Date.now()) {
  if (!last || now - last.at > WINDOW_MS) return null;
  return { ...last, ageMs: now - last.at };
}

export function clearProblem() {
  last = null;
  tell();
}

export function subscribeProblem(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
