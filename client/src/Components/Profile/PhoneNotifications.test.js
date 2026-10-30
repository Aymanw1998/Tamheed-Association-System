import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import PhoneNotifications from "./PhoneNotifications";
import * as optIn from "../../pwa/pushOptIn";
import { canStored } from "../../utils/session";

jest.mock("../../pwa/pushOptIn", () => ({
  getPushSettings: jest.fn(),
  setPushSettings: jest.fn(),
  isSubscribed: jest.fn(),
  needsHomeScreen: jest.fn(),
  pushOnServer: jest.fn(),
  pushSupported: jest.fn(),
  resyncStaff: jest.fn(),
  subscribeStaff: jest.fn(),
  unsubscribeStaff: jest.fn(),
}));
jest.mock("../../utils/session", () => ({ canStored: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), warn: jest.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
const q = (id) => container.querySelector(`[data-testid="${id}"]`);

async function render({ manager = false, serverOn = false, supported = true, homeScreen = false, settings } = {}) {
  canStored.mockImplementation((key) => manager && key === "permissions.manage");
  optIn.pushOnServer.mockResolvedValue(serverOn);
  optIn.getPushSettings.mockResolvedValue(settings || { ok: true, enabled: serverOn, keysFrom: serverOn ? "server" : "none" });
  optIn.isSubscribed.mockResolvedValue(false);
  optIn.pushSupported.mockReturnValue(supported);
  optIn.needsHomeScreen.mockReturnValue(homeScreen);
  await act(async () => root.render(<PhoneNotifications />));
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test("system off, not a manager: nothing is shown", async () => {
  await render();
  expect(q("phone-notifications")).toBeNull();
  expect(optIn.getPushSettings).not.toHaveBeenCalled();
});

test("system on: the device checkbox shows, the system switch only for a manager", async () => {
  await render({ serverOn: true });
  expect(q("push-mine")).not.toBeNull();
  expect(q("push-system")).toBeNull();
});

test("a manager switches the system on: the device checkbox appears", async () => {
  await render({ manager: true });
  expect(q("push-system").checked).toBe(false);
  expect(q("push-mine")).toBeNull();
  optIn.setPushSettings.mockResolvedValue({ ok: true, enabled: true, keysFrom: "server" });
  await act(async () => q("push-system").click());
  expect(optIn.setPushSettings).toHaveBeenCalledWith(true);
  expect(q("push-system").checked).toBe(true);
  expect(q("push-mine")).not.toBeNull();
});

test("iPhone in the browser: a hint to add the site to the home screen instead of the checkbox", async () => {
  await render({ serverOn: true, supported: false, homeScreen: true });
  expect(q("push-mine")).toBeNull();
  expect(q("push-home-hint")).not.toBeNull();
});

test("a late 'off' answer does not hide the device checkbox after the manager switched it on", async () => {
  let late;
  await render({ manager: true });
  optIn.pushOnServer.mockReturnValue(new Promise((r) => { late = r; }));
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  optIn.setPushSettings.mockResolvedValue({ ok: true, enabled: true, keysFrom: "server" });
  optIn.getPushSettings.mockResolvedValue({ ok: true, enabled: true, keysFrom: "server" });
  await act(async () => q("push-system").click());
  await act(async () => late(false));
  expect(q("push-mine")).not.toBeNull();
});

test("coming back to the page reads the switch again", async () => {
  await render({ serverOn: false });
  expect(q("phone-notifications")).toBeNull();
  optIn.pushOnServer.mockResolvedValue(true);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(q("push-mine")).not.toBeNull();
});

test("a read of the switch that was on its way before the manager switched it on is dropped", async () => {
  let lateSettings;
  await render({ manager: true });
  optIn.getPushSettings.mockReturnValue(new Promise((r) => { lateSettings = r; }));
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  optIn.setPushSettings.mockResolvedValue({ ok: true, enabled: true, keysFrom: "server" });
  await act(async () => q("push-system").click());
  await act(async () => lateSettings({ ok: true, enabled: false, keysFrom: "server" }));
  expect(q("push-system").checked).toBe(true);
  expect(q("push-mine")).not.toBeNull();
});
