import {
  SIGN_OUT_PENDING_KEY, markSignOutPending, clearSignOutPending, isSignOutPending, finishPendingSignOut, signOutReached,
} from "./pendingSignOut";

// Codex full review, 2026-11-18: a sign-out without network never lets the
// session come back on its own.
beforeEach(() => window.localStorage.clear());

test("a pending sign-out is kept until the server answers it", async () => {
  markSignOutPending();
  expect(isSignOutPending()).toBe(true);
  expect(await finishPendingSignOut(async () => 0)).toBe(false);
  expect(await finishPendingSignOut(async () => 503)).toBe(false);
  expect(await finishPendingSignOut(async () => { throw new Error("offline"); })).toBe(false);
  expect(isSignOutPending()).toBe(true);
  expect(await finishPendingSignOut(async () => 401)).toBe(true);
  expect(window.localStorage.getItem(SIGN_OUT_PENDING_KEY)).toBeNull();
});

test("nothing pending: nothing is sent", async () => {
  const send = jest.fn(async () => 200);
  expect(await finishPendingSignOut(send)).toBe(true);
  expect(send).not.toHaveBeenCalled();
});

test("a new sign-in clears it; only an answer from the server counts", () => {
  markSignOutPending();
  clearSignOutPending();
  expect(isSignOutPending()).toBe(false);
  expect([0, 200, 204, 401, 403, 500, 502].map(signOutReached)).toEqual([false, true, true, true, true, false, false]);
});
