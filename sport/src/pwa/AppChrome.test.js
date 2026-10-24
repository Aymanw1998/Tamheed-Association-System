import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AppChrome from "./AppChrome";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OFFLINE = "لا يوجد اتصال – البيانات من آخر تحديث";

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
