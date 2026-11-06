import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AppChrome, { canApplySystemUpdate } from "./AppChrome";
import { setUnsavedChanges } from "../utils/unsavedChanges";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OFFLINE = "لا يوجد اتصال – البيانات من آخر تحديث";

test("unreported edit pages and public forms wait even for photo-only work", () => {
  const path = window.location.pathname;
  const form = document.createElement("input"); document.body.appendChild(form);
  setUnsavedChanges(null);
  for (const route of ["/students/new", "/students/one/edit", "/register-student/token", "/parent-consent"]) {
    window.history.replaceState({}, "", route); expect(canApplySystemUpdate()).toBe(false);
  }
  window.history.replaceState({}, "", "/dashboard"); setUnsavedChanges(true);
  expect(canApplySystemUpdate()).toBe(false);
  setUnsavedChanges(false); expect(canApplySystemUpdate()).toBe(true);
  setUnsavedChanges(null); form.remove(); window.history.replaceState({}, "", path);
});

test("offline bar follows the offline and online events", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<AppChrome />); });
  expect(host.textContent).not.toContain(OFFLINE);
  act(() => { window.dispatchEvent(new Event("offline")); });
  expect(host.textContent).toContain(OFFLINE);
  act(() => { window.dispatchEvent(new Event("online")); });
  expect(host.textContent).not.toContain(OFFLINE);
  act(() => { root.unmount(); });
  host.remove();
});

// Owner, 2026-11-03: with a bar showing («كيف؟»), «إغلاق» in the install
// guide did nothing: the guide sat inside the bars' wrapper, which lets
// clicks through (pointer-events: none), so the guide got no clicks at all.
test("the install guide is not inside the click-through bar wrapper", () => {
  const { openInstallGuide } = require("./installState");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<AppChrome />); });
  act(() => { window.dispatchEvent(new Event("offline")); });
  act(() => { openInstallGuide(); });
  const guide = host.querySelector('[data-testid="install-guide"]');
  expect(guide).not.toBeNull();
  for (let el = guide; el && el !== host; el = el.parentElement) expect(el.style.pointerEvents).not.toBe("none");
  act(() => { host.querySelector('[data-testid="install-guide-close"]').click(); });
  expect(host.querySelector('[data-testid="install-guide"]')).toBeNull();
  act(() => { window.dispatchEvent(new Event("online")); });
  act(() => { root.unmount(); });
  host.remove();
});
