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

test("not offered while the system's phone notifications are off (no server key)", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, key: null }) });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<PushButton />); });
  expect(host.querySelector("button")).toBeNull();
  act(() => { root.unmount(); });
  host.remove();
});

test("switched on by the staff while the site was in the background: offered on return", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, key: null }) });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<PushButton />); });
  expect(host.querySelector("button")).toBeNull();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, key: "AQAB" }) });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(host.querySelector("button")).not.toBeNull();
  act(() => { root.unmount(); });
  host.remove();
});

test("a check that was on its way before subscribing cannot bring the button back", async () => {
  subscribe.mockResolvedValue({ toJSON: () => ({ endpoint: "e" }) });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<PushButton />); });
  let lateKey;
  global.fetch = jest.fn()
    .mockReturnValueOnce(new Promise((r) => { lateKey = r; }))
    .mockResolvedValue({ ok: true, json: async () => ({ ok: true, key: "AQAB" }) });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  await act(async () => { host.querySelector("button").click(); });
  expect(host.querySelector("button")).toBeNull();
  await act(async () => { lateKey({ ok: true, json: async () => ({ ok: true, key: "AQAB" }) }); });
  expect(host.querySelector("button")).toBeNull();
  act(() => { root.unmount(); });
  host.remove();
});

test("subscribed in the browser but unknown to the server: registered again, the button stays while that fails", async () => {
  const existing = { toJSON: () => ({ endpoint: "e" }), options: {} };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: jest.fn().mockResolvedValue({ pushManager: { getSubscription: jest.fn().mockResolvedValue(existing), subscribe } }) },
  });
  const posts = [];
  global.fetch = jest.fn(async (url, opts) => {
    if (opts?.method === "POST") { posts.push(url); return { ok: false }; }
    return { ok: true, json: async () => ({ ok: true, key: "AQAB" }) };
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<PushButton />); });
  expect(posts).toEqual(["/api/sport-portal/push/subscribe"]);
  expect(host.querySelector("button")).not.toBeNull();

  global.fetch = jest.fn(async (url, opts) => (opts?.method === "POST" ? { ok: true } : { ok: true, json: async () => ({ ok: true, key: "AQAB" }) }));
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(host.querySelector("button")).toBeNull();
  act(() => { root.unmount(); });
  host.remove();
});

test("after the subscription was dropped elsewhere, a new one whose POST failed keeps the retry button", async () => {
  subscribe.mockResolvedValue({ toJSON: () => ({ endpoint: "e2" }) });
  let current = { toJSON: () => ({ endpoint: "e1" }), options: {} };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: jest.fn().mockResolvedValue({ pushManager: { getSubscription: jest.fn(async () => current), subscribe } }) },
  });
  let postOk = true;
  global.fetch = jest.fn(async (url, opts) => (opts?.method === "POST" ? { ok: postOk } : { ok: true, json: async () => ({ ok: true, key: "AQAB" }) }));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<PushButton />); });
  expect(host.querySelector("button")).toBeNull(); // synced

  current = null; // another tab signed out
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(host.querySelector("button")).not.toBeNull();

  postOk = false;
  await act(async () => { host.querySelector("button").click(); }); // browser subscribes, POST fails
  current = { toJSON: () => ({ endpoint: "e2" }), options: {} };
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(host.querySelector("button")).not.toBeNull();
  act(() => { root.unmount(); });
  host.remove();
});
