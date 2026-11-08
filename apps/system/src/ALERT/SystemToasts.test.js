import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider, useToast } from "./SystemToasts";

jest.mock("../WebServer/services/api", () => ({ get: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root, api;
function Grab() { api = useToast(); return null; }
beforeEach(async () => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root.render(<ToastProvider><Grab /></ToastProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("a toast with a fixed id replaces its earlier copy instead of stacking", async () => {
  await act(async () => { api.push({ id: "session-expired", variant: "destructive", sticky: true, description: "x" }); });
  await act(async () => { api.push({ id: "session-expired", variant: "destructive", sticky: true, description: "x" }); });
  await act(async () => { api.push({ variant: "info", description: "other" }); });
  expect(api.toasts.filter((t) => t.id === "session-expired")).toHaveLength(1);
  expect(api.toasts).toHaveLength(2);
});

test("a sticky toast is not closed by the timer, and an action button runs and closes", async () => {
  jest.useFakeTimers();
  const onClick = jest.fn();
  await act(async () => { api.push({ id: "s", sticky: true, description: "stays" }); });
  await act(async () => { api.push({ id: "u", description: "moved", action: { label: "تراجع", onClick } }); });
  await act(async () => { jest.advanceTimersByTime(9000); });
  expect(api.toasts.map((t) => t.id)).toEqual(["s"]);
  jest.useRealTimers();
  await act(async () => { api.push({ id: "u2", description: "moved", action: { label: "تراجع", onClick } }); });
  const undo = [...document.body.querySelectorAll("button")].find((b) => b.textContent.includes("تراجع"));
  await act(async () => { undo.click(); });
  expect(onClick).toHaveBeenCalledTimes(1);
});
