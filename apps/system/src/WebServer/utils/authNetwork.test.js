import { isConnectionFailure, mayStayOffline } from "./authNetwork";

// Codex full review, 2026-11-18: no connection is not a sign-out.
beforeEach(() => window.localStorage.clear());

test("only a server answer that the session is gone counts as a sign-out", () => {
  expect(isConnectionFailure(new Error("Network Error"))).toBe(true);
  expect(isConnectionFailure({ code: "ECONNABORTED" })).toBe(true);
  expect(isConnectionFailure({ response: { status: 503 } })).toBe(true);
  expect(isConnectionFailure({ response: { status: 429 } })).toBe(true);
  expect(isConnectionFailure({ response: { status: 401 } })).toBe(false);
  expect(isConnectionFailure({ response: { status: 403 } })).toBe(false);
  expect(isConnectionFailure({ code: "SIGN_OUT_PENDING" })).toBe(false);
  expect(isConnectionFailure(null)).toBe(false);
});

test("the app stays open offline only for someone signed in here, with no sign-out waiting and before the auto sign-out", () => {
  expect(mayStayOffline()).toBe(false);
  window.localStorage.setItem("user_tz", "123456782");
  expect(mayStayOffline()).toBe(true);
  window.localStorage.setItem("tamheed.system.pendingSignOut", "1");
  expect(mayStayOffline()).toBe(false);
  window.localStorage.removeItem("tamheed.system.pendingSignOut");
  window.localStorage.setItem("LOGOUT_DEADLINE_MS", String(Date.now() - 1000));
  expect(mayStayOffline()).toBe(false);
});
