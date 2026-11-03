import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import PhoneNotifications from "./PhoneNotifications";
import * as optIn from "../../pwa/pushOptIn";

// No getPushSettings / setPushSettings: the system-wide switch is an IT
// setting, on the IT site (owner, 2026-11-03).
jest.mock("../../pwa/pushOptIn", () => ({
  isSubscribed: jest.fn(),
  needsHomeScreen: jest.fn(),
  pushOnServer: jest.fn(),
  pushSupported: jest.fn(),
  resyncStaff: jest.fn(),
  subscribeStaff: jest.fn(),
  unsubscribeStaff: jest.fn(),
}));
jest.mock("../../utils/session", () => ({ canStored: jest.fn(() => true) }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), warn: jest.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
const q = (id) => container.querySelector(`[data-testid="${id}"]`);

async function render({ serverOn = false, supported = true, homeScreen = false } = {}) {
  optIn.pushOnServer.mockResolvedValue(serverOn);
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

test("system off: nothing is shown", async () => {
  await render();
  expect(q("phone-notifications")).toBeNull();
});

test("system on: the device checkbox shows, and never a system switch (even with every permission)", async () => {
  await render({ serverOn: true });
  expect(q("push-mine")).not.toBeNull();
  expect(q("push-system")).toBeNull();
});

test("iPhone in the browser: a hint to add the site to the home screen instead of the checkbox", async () => {
  await render({ serverOn: true, supported: false, homeScreen: true });
  expect(q("push-mine")).toBeNull();
  expect(q("push-home-hint")).not.toBeNull();
});

test("coming back to the page reads the switch again", async () => {
  await render({ serverOn: false });
  expect(q("phone-notifications")).toBeNull();
  optIn.pushOnServer.mockResolvedValue(true);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(q("push-mine")).not.toBeNull();
});

test("the device checkbox subscribes this device", async () => {
  await render({ serverOn: true });
  optIn.subscribeStaff.mockResolvedValue({ ok: true });
  await act(async () => q("push-mine").click());
  expect(optIn.subscribeStaff).toHaveBeenCalledTimes(1);
  expect(q("push-mine").checked).toBe(true);
});
