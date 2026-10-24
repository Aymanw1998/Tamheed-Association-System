import React, { act } from "react";
import { createRoot } from "react-dom/client";
import PushButton from "./PushButton";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const subscribe = jest.fn().mockResolvedValue({ toJSON: () => ({ endpoint: "e" }) });

beforeEach(() => {
  window.PushManager = function PushManager() {};
  window.Notification = { permission: "granted", requestPermission: jest.fn().mockResolvedValue("granted") };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: jest.fn().mockResolvedValue({ pushManager: { getSubscription: jest.fn().mockResolvedValue(null), subscribe } }) },
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, key: "AQAB" }) });
});
afterEach(() => { delete navigator.serviceWorker; delete window.PushManager; delete window.Notification; });

test("offers the button when permission is already granted but there is no subscription, and subscribes on click", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<PushButton />); });
  const btn = host.querySelector("button");
  expect(btn).not.toBeNull();
  await act(async () => { btn.click(); });
  expect(window.Notification.requestPermission).not.toHaveBeenCalled();
  expect(subscribe).toHaveBeenCalled();
  act(() => { root.unmount(); });
  host.remove();
});
