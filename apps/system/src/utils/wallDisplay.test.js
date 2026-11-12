import { isWallDisplay, logoutBroadcastTarget } from "./wallDisplay";

// The wall TV (owner, 2026-11-12, Codex review): a logout in another tab of
// the same site must not move the TV away from its program and its link.

test("only /display is the wall page", () => {
  expect(isWallDisplay("/display")).toBe(true);
  expect(isWallDisplay("/display/")).toBe(true);
  expect(isWallDisplay("/lessons/displays")).toBe(false);
  expect(isWallDisplay("/")).toBe(false);
});

test("a logout broadcast sends a signed-in page home but leaves the TV alone", () => {
  const logout = { key: "LOGOUT_BROADCAST", newValue: "123" };
  expect(logoutBroadcastTarget(logout, "/dashboard")).toBe("/");
  expect(logoutBroadcastTarget(logout, "/display")).toBeNull();
  expect(logoutBroadcastTarget({ key: "LOGOUT_BROADCAST", newValue: null }, "/dashboard")).toBeNull();
  expect(logoutBroadcastTarget({ key: "other", newValue: "1" }, "/dashboard")).toBeNull();
});
