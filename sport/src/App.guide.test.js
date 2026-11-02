import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Owner, 2026-11-02: the sport site's guide is off for now, like the main
// system's: it does not open on a first visit and the header has no "؟".
jest.mock("./api.js", () => ({ getMe: jest.fn(), getNotices: jest.fn().mockResolvedValue({ ok: true, status: 200, data: { notices: [] } }), logout: jest.fn() }));
jest.mock("./LoginPage.jsx", () => () => <div>login</div>);
jest.mock("./HomePage.jsx", () => () => <div>home</div>);
jest.mock("./NoticesPage.jsx", () => () => <div>notices</div>);
jest.mock("./BottomTabs.jsx", () => () => <div>tabs</div>);
jest.mock("./guide/FirstVisitGuide.jsx", () => () => <div data-testid="guide">guide</div>);
jest.mock("./pwa/AppChrome.jsx", () => () => null);
jest.mock("./pwa/clearApiCache", () => ({ clearApiCache: jest.fn().mockResolvedValue() }));
jest.mock("./pwa/pushOptIn", () => ({ unsubscribeSport: jest.fn().mockResolvedValue() }));
jest.mock("./guide/guideSteps.js", () => ({ hasSeenGuide: () => false, markGuideSeen: jest.fn() }));

const { getMe } = require("./api.js");
const App = require("./App.jsx").default;

let host;
let root;
beforeEach(() => {
  global.EventSource = class { addEventListener() {} close() {} };
  getMe.mockResolvedValue({ ok: true, status: 200, data: { student: { firstname: "a", gender: "ذكر" }, card: { sport: { name: "s" } } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete global.EventSource; });

test("a first visit opens no guide", async () => {
  await act(async () => { root.render(<App />); });
  expect(host.textContent).toContain("home");
  expect(host.querySelector('[data-testid="guide"]')).toBeNull();
});

test("the header has no help button", async () => {
  await act(async () => { root.render(<App />); });
  expect(host.querySelector(".help-btn")).toBeNull();
});
