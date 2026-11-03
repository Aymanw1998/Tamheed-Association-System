import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("../WebServer/services/api", () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
  API_BASE_URL: "/api",
  getAuthToken: () => "tok",
}));

jest.mock("../journey/demoMode", () => ({ __esModule: true, isDemo: jest.fn(() => false) }));

import api from "../WebServer/services/api";
import { isDemo } from "../journey/demoMode";
import { liveEvents } from "../WebServer/services/live/liveStream";
import useItemLock from "./useItemLock";
import { getClientId } from "./clientId";
import { handleSaveError, withBaseVersion } from "./staleSave";

global.IS_REACT_ACT_ENVIRONMENT = true;

let container, root, latest;
function Probe({ lockKey }) {
  latest = useItemLock(lockKey);
  return null;
}
const mountHook = async (key = "student:1") => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe lockKey={key} />));
};
const advance = (ms) => act(async () => { jest.advanceTimersByTime(ms); });
const err = (status, data) => Object.assign(new Error("x"), { response: { status, data } });
const calls = (path) => api.post.mock.calls.filter((c) => c[0] === path);

beforeEach(() => {
  jest.useFakeTimers();
  api.post.mockReset();
  isDemo.mockReturnValue(false);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  container?.remove();
  document.body.innerHTML = "";
  jest.useRealTimers();
});

test("acquire ok gives held", async () => {
  api.post.mockResolvedValue({ data: { ok: true } });
  await mountHook();
  expect(latest.status).toBe("held");
  expect(calls("/locks/acquire")[0][1]).toEqual({ key: "student:1" });
});

test("acquire 423 gives blocked with the holder, and a lock event re-acquires", async () => {
  const holder = { name: "Ali", tz: "t1" };
  api.post.mockRejectedValueOnce(err(423, { code: "LOCKED", holder }));
  await mountHook();
  expect(latest.status).toBe("blocked");
  expect(latest.holder).toEqual(holder);
  api.post.mockResolvedValue({ data: { ok: true } });
  await act(async () => liveEvents.emit("lock", { key: "student:2" }));
  expect(latest.status).toBe("blocked");
  await act(async () => liveEvents.emit("lock", { key: "student:1" }));
  expect(latest.status).toBe("held");
});

test("blocked re-tries every 15 s", async () => {
  api.post.mockRejectedValueOnce(err(423, { holder: { name: "Ali", tz: "t1" } }));
  await mountHook();
  api.post.mockResolvedValue({ data: { ok: true } });
  await advance(15000);
  expect(latest.status).toBe("held");
});

test("heartbeat 410 gives readonly", async () => {
  api.post.mockResolvedValueOnce({ data: { ok: true } });
  await mountHook();
  api.post.mockRejectedValue(err(410, { code: "LOST" }));
  await advance(20000);
  expect(calls("/locks/heartbeat")).toHaveLength(1);
  expect(latest.status).toBe("readonly");
});

test("10 minutes idle shows the dialog; 60 s more releases and goes readonly", async () => {
  api.post.mockResolvedValue({ data: { ok: true } });
  await mountHook();
  await advance(10 * 60 * 1000);
  expect(document.body.textContent).toContain("هل ما زلت هنا؟");
  expect(document.body.textContent).toContain("نعم، ما زلت هنا");
  await advance(60 * 1000);
  expect(latest.status).toBe("readonly");
  expect(calls("/locks/release")).toHaveLength(1);
  expect(document.body.textContent).not.toContain("هل ما زلت هنا؟");
});

test("answering the dialog keeps the lock", async () => {
  api.post.mockResolvedValue({ data: { ok: true } });
  await mountHook();
  await advance(10 * 60 * 1000);
  await act(async () => document.querySelector("button.c-btn-primary").click());
  await advance(60 * 1000);
  expect(latest.status).toBe("held");
  expect(calls("/locks/release")).toHaveLength(0);
});

test("unmount calls release", async () => {
  api.post.mockResolvedValue({ data: { ok: true } });
  await mountHook();
  await act(async () => root.unmount());
  root = null;
  expect(calls("/locks/release")[0][1]).toEqual({ key: "student:1" });
});

test("pagehide sends a beacon with the client id in the body", async () => {
  api.post.mockResolvedValue({ data: { ok: true } });
  navigator.sendBeacon = jest.fn(() => true);
  await mountHook();
  window.dispatchEvent(new Event("pagehide"));
  expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
  expect(navigator.sendBeacon.mock.calls[0][0]).toBe("/api/locks/release");
  delete navigator.sendBeacon;
});

test("training mode makes no lock calls and reports held", async () => {
  isDemo.mockReturnValue(true);
  navigator.sendBeacon = jest.fn(() => true);
  await mountHook();
  expect(latest.status).toBe("held");
  window.dispatchEvent(new Event("pagehide"));
  await advance(60000);
  await act(async () => root.unmount());
  root = null;
  expect(api.post).not.toHaveBeenCalled();
  expect(navigator.sendBeacon).not.toHaveBeenCalled();
  delete navigator.sendBeacon;
});

test("a changed key releases the old lock, shows loading, then holds the new one", async () => {
  api.post.mockResolvedValue({ data: { ok: true } });
  await mountHook("student:1");
  expect(latest.status).toBe("held");
  let finish;
  api.post.mockImplementation((path) => (path === "/locks/acquire" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ data: {} })));
  const seen = [];
  const Spy = ({ lockKey }) => { const r = useItemLock(lockKey); seen.push(r.status); return null; };
  await act(async () => root.render(<Spy lockKey="student:2" />));
  expect(seen[0]).toBe("loading");
  expect(seen.every((x) => x === "loading")).toBe(true);
  expect(calls("/locks/release").map((c) => c[1].key)).toEqual(["student:1"]);
  await act(async () => finish({ data: { ok: true } }));
  expect(seen[seen.length - 1]).toBe("held");
  expect(calls("/locks/acquire").map((c) => c[1].key)).toEqual(["student:1", "student:2"]);
});

test("a network or server error on acquire retries every 15 s instead of going readonly", async () => {
  api.post.mockRejectedValueOnce(err(500, {}));
  await mountHook();
  expect(latest.status).toBe("loading");
  api.post.mockResolvedValue({ data: { ok: true } });
  await advance(15000);
  expect(latest.status).toBe("held");
});

test("two different sessionStorage values give different client ids", () => {
  sessionStorage.setItem("tamheed-client-id", "tab-a");
  const a = getClientId();
  sessionStorage.setItem("tamheed-client-id", "tab-b");
  expect(getClientId()).not.toBe(a);
  sessionStorage.removeItem("tamheed-client-id");
  expect(getClientId()).toBeTruthy();
  expect(getClientId()).toBe(sessionStorage.getItem("tamheed-client-id"));
});

describe("stale save", () => {
  test("409 keeps the draft, shows the message, returns true", async () => {
    let notice;
    const handled = handleSaveError(err(409, { code: "STALE", current: { updatedByName: "Sara" } }), {
      draft: "my text",
      setNotice: (n) => { notice = n; },
    });
    expect(handled).toBe(true);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const r = createRoot(host);
    await act(async () => r.render(notice));
    expect(host.textContent).toContain("تم تعديل هذا العنصر من قِبل Sara أثناء غيابك");
    expect(host.querySelector("textarea").value).toBe("my text");
    expect(host.querySelector("textarea").readOnly).toBe(true);
    expect(host.textContent).toContain("نسخ");
    await act(async () => r.unmount());
  });

  test("423 shows the holder; other errors return false; withBaseVersion", () => {
    let notice;
    expect(handleSaveError(err(423, { holder: { name: "Ali", tz: "t1" } }), { setNotice: (n) => { notice = n; } })).toBe(true);
    expect(notice).toContain("Ali");
    expect(handleSaveError(err(500, {}), { setNotice: () => {} })).toBe(false);
    expect(withBaseVersion({ a: 1 }, { updatedAt: "T" })).toEqual({ a: 1, baseVersion: "T" });
  });
});

describe("flat service results", () => {
  test("handleSaveError reads a flat 409 and a flat 423", () => {
    let notice;
    expect(handleSaveError({ ok: false, status: 409, data: { code: "STALE", current: { updatedByName: "Sara" } } }, { draft: "x", setNotice: (n) => { notice = n; } })).toBe(true);
    expect(notice).toBeTruthy();
    expect(handleSaveError({ ok: false, status: 423, data: { holder: { name: "Ali", tz: "t1" } } }, { setNotice: (n) => { notice = n; } })).toBe(true);
    expect(notice).toContain("Ali");
    expect(handleSaveError({ ok: false, status: 500, data: {} }, { setNotice: () => {} })).toBe(false);
  });
});

describe("viewer without edit permission", () => {
  function ViewerProbe({ lockKey }) {
    latest = useItemLock(lockKey, { enabled: false });
    return null;
  }
  const mountViewer = async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<ViewerProbe lockKey="student:1" />));
  };

  test("a held key gives blocked, a release event gives held, and it never posts", async () => {
    const holder = { name: "Ali", tz: "t1" };
    api.get.mockReset();
    api.get.mockResolvedValueOnce({ data: { ok: true, holder } });
    await mountViewer();
    expect(api.get).toHaveBeenCalledWith("/locks/student%3A1");
    expect(latest.status).toBe("blocked");
    expect(latest.holder).toEqual(holder);
    api.get.mockResolvedValue({ data: { ok: true, holder: null } });
    await act(async () => liveEvents.emit("lock", { key: "student:1" }));
    expect(latest.status).toBe("held");
    await advance(20000);
    expect(api.post).not.toHaveBeenCalled();
  });

  test("it re-checks every 15 seconds", async () => {
    api.get.mockReset();
    api.get.mockResolvedValue({ data: { ok: true, holder: null } });
    await mountViewer();
    expect(latest.status).toBe("held");
    await advance(15000);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  test("training mode stays held without calls", async () => {
    isDemo.mockReturnValue(true);
    api.get.mockReset();
    await mountViewer();
    expect(latest.status).toBe("held");
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("lost-lock reasons", () => {
  test("a heartbeat 410 while beats were going through is a forced release", async () => {
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    await mountHook();
    api.post.mockRejectedValue(err(410, { code: "LOST" }));
    await advance(20000);
    expect(latest.status).toBe("readonly");
    expect(latest.reason).toBe("forced");
  });

  test("heartbeats failing for 120 s (no connection) give expired", async () => {
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    await mountHook();
    api.post.mockRejectedValue(Object.assign(new Error("Network Error"), { response: undefined }));
    await advance(100000);
    expect(latest.status).toBe("held");
    await advance(20000);
    expect(latest.status).toBe("readonly");
    expect(latest.reason).toBe("expired");
  });

  test("a 410 after a long gap without a beat is expired, not forced", async () => {
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    await mountHook();
    api.post.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { response: undefined }));
    api.post.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { response: undefined }));
    api.post.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { response: undefined }));
    api.post.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { response: undefined }));
    api.post.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { response: undefined }));
    api.post.mockRejectedValue(err(410, { code: "LOST" }));
    await advance(120000);
    expect(latest.status).toBe("readonly");
    expect(latest.reason).toBe("expired");
  });

  test("no answer to «هل ما زلت هنا؟» gives idle", async () => {
    api.post.mockResolvedValue({ data: { ok: true } });
    await mountHook();
    await advance(11 * 60 * 1000);
    expect(latest.status).toBe("readonly");
    expect(latest.reason).toBe("idle");
  });

  test("retry after a lost lock takes it again and clears the reason", async () => {
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    await mountHook();
    api.post.mockRejectedValue(err(410, { code: "LOST" }));
    await advance(20000);
    api.post.mockResolvedValue({ data: { ok: true } });
    await act(async () => latest.retry());
    expect(latest.status).toBe("held");
    expect(latest.reason).toBeNull();
  });

  test("an acquire refused with 403 goes readonly (denied) and does not retry", async () => {
    api.post.mockRejectedValue(err(403, { code: "FORBIDDEN" }));
    await mountHook();
    expect(latest.status).toBe("readonly");
    expect(latest.reason).toBe("denied");
    await advance(60000);
    expect(calls("/locks/acquire")).toHaveLength(1);
  });
});

test("a viewer whose first lock check fails falls back to held instead of loading forever", async () => {
  api.get.mockReset();
  api.get.mockRejectedValue(new Error("down"));
  function ViewerProbe() { latest = useItemLock("student:1", { enabled: false }); return null; }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ViewerProbe />));
  expect(latest.status).toBe("held");
});

test("after a 409 the notice offers «تحميل أحدث نسخة», which reloads and keeps the draft", async () => {
  let notice;
  const reload = jest.fn();
  handleSaveError(err(409, { code: "STALE", current: { updatedByName: "Sara" } }), { draft: "my text", setNotice: (n) => { notice = n; }, onReload: reload });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  await act(async () => r.render(notice));
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "تحميل أحدث نسخة");
  expect(button).toBeTruthy();
  await act(async () => button.click());
  expect(reload).toHaveBeenCalledTimes(1);
  expect(host.querySelector("textarea").value).toBe("my text");
  await act(async () => r.unmount());
});
