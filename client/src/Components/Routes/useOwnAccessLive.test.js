import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("../../WebServer/services/auth/fuctionsAuth", () => ({ getMe: jest.fn() }));
jest.mock("../../WebServer/services/live/liveStream", () => {
  const listeners = new Map();
  return {
    liveEvents: {
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      emit(type, payload) { for (const fn of [...(listeners.get(type) || [])]) fn(payload); },
    },
  };
});

import { getMe } from "../../WebServer/services/auth/fuctionsAuth";
import { liveEvents } from "../../WebServer/services/live/liveStream";
import { canStored, rememberSessionUser } from "../../utils/session";
import useOwnAccessLive from "./useOwnAccessLive";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Owner, 2026-11-02: when an admin changes someone's permissions, that
// person's open screen follows at once. The server already tells every staff
// screen "user <id> changed"; the person's own screen reloads its access.
function Probe() { useOwnAccessLive(); return null; }
let host, root;
beforeEach(async () => {
  localStorage.clear();
  rememberSessionUser({ _id: "me", roles: ["مرشد"], permissions: ["students.view"] });
  getMe.mockReset();
  getMe.mockResolvedValue({ _id: "me", roles: ["مرشد"], permissions: [] });
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => { await act(async () => root.unmount()); });

test("a change to my own account reloads my permissions", async () => {
  await act(async () => liveEvents.emit("change", { entity: "user", id: "me" }));
  expect(getMe).toHaveBeenCalledTimes(1);
  expect(canStored("students.view")).toBe(false);
});

test("a change to someone else or to another kind of record is ignored", async () => {
  await act(async () => liveEvents.emit("change", { entity: "user", id: "other" }));
  await act(async () => liveEvents.emit("change", { entity: "student", id: "me" }));
  expect(getMe).not.toHaveBeenCalled();
  expect(canStored("students.view")).toBe(true);
});

test("a reconnected live channel reloads my permissions (changes may have been missed)", async () => {
  await act(async () => liveEvents.emit("open", {}));
  expect(getMe).toHaveBeenCalledTimes(1);
});

test("a failed reload keeps what was stored", async () => {
  getMe.mockResolvedValue(null);
  await act(async () => liveEvents.emit("change", { entity: "user", id: "me" }));
  expect(canStored("students.view")).toBe(true);
});

test("a screen using the access version redraws when the stored access changes", async () => {
  const { usePermissionsVersion } = require("./useOwnAccessLive");
  const draws = [];
  function Screen() { usePermissionsVersion(); draws.push(canStored("students.view")); return null; }
  const h = document.createElement("div");
  const r = createRoot(h);
  await act(async () => r.render(<Screen />));
  await act(async () => rememberSessionUser({ _id: "me", roles: ["مرشد"], permissions: [] }));
  expect(draws).toEqual([true, false]);
  await act(async () => r.unmount());
});
