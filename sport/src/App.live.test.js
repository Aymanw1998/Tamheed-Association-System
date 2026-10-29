import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./api.js", () => ({ getMe: jest.fn(), getNotices: jest.fn().mockResolvedValue({ ok: true, status: 200, data: { notices: [] } }), logout: jest.fn() }));
jest.mock("./LoginPage.jsx", () => () => <div>login</div>);
jest.mock("./HomePage.jsx", () => () => <div>home</div>);
jest.mock("./NoticesPage.jsx", () => () => <div>notices</div>);
jest.mock("./StadiumHeader.jsx", () => () => <div>header</div>);
jest.mock("./BottomTabs.jsx", () => () => <div>tabs</div>);
jest.mock("./guide/FirstVisitGuide.jsx", () => () => <div>guide</div>);
jest.mock("./pwa/AppChrome.jsx", () => () => null);
jest.mock("./pwa/clearApiCache", () => ({ clearApiCache: jest.fn().mockResolvedValue() }));
jest.mock("./pwa/pushOptIn", () => ({ unsubscribeSport: jest.fn().mockResolvedValue() }));
jest.mock("./guide/guideSteps.js", () => ({ hasSeenGuide: () => true, markGuideSeen: jest.fn() }));

const { getMe } = require("./api.js");
const App = require("./App.jsx").default;

const me = { student: { firstname: "a", gender: "m" }, card: { sport: { name: "s" } } };

class FakeES {
  static all = [];
  constructor(url) { this.url = url; this.closed = false; this.handlers = {}; FakeES.all.push(this); }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  close() { this.closed = true; }
}

let host;
let root;
beforeEach(() => {
  FakeES.all = [];
  global.EventSource = FakeES;
  getMe.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete global.EventSource; });

test("while signed in a `me` event reloads /me; a 401 closes the stream", async () => {
  getMe.mockResolvedValue({ ok: true, status: 200, data: me });
  await act(async () => { root.render(<App />); });
  expect(getMe).toHaveBeenCalledTimes(1);
  expect(FakeES.all).toHaveLength(1);
  expect(FakeES.all[0].url).toBe("/api/sport-portal/live");

  await act(async () => { FakeES.all[0].handlers.me({}); });
  expect(getMe).toHaveBeenCalledTimes(2);

  getMe.mockResolvedValue({ ok: false, status: 401, data: {} });
  await act(async () => { FakeES.all[0].handlers.me({}); });
  expect(getMe).toHaveBeenCalledTimes(3);
  expect(FakeES.all[0].closed).toBe(true);
});

test("signed out: no stream is opened", async () => {
  getMe.mockResolvedValue({ ok: false, status: 401, data: {} });
  await act(async () => { root.render(<App />); });
  expect(FakeES.all).toHaveLength(0);
});

test("notices read under another student's cookie are not shown: the card is read again, once", async () => {
  const { getNotices } = require("./api.js");
  getNotices.mockResolvedValue({ ok: true, status: 200, data: { key: "b", notices: [{ id: "x", createdAt: "2026-05-01T10:00:00Z" }] } });
  getMe.mockResolvedValue({ ok: true, status: 200, data: { ...me, student: { ...me.student, key: "a" } } });
  await act(async () => { root.render(<App />); });
  await act(async () => {});
  expect(getMe).toHaveBeenCalledTimes(2);
  getNotices.mockResolvedValue({ ok: true, status: 200, data: { notices: [] } });
});
