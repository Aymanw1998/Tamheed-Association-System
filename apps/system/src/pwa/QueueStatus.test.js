import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("../Components/Provides/confirmBus", () => ({ ask: jest.fn() }));
jest.mock("../WebServer/services/api", () => ({ __esModule: true, default: {} }));

import QueueStatus from "./QueueStatus";
import { ask } from "../Components/Provides/confirmBus";
import { createMemoryBackend, enqueue, othersPending, setBackend } from "./attendanceQueue";

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(async () => {
  setBackend(createMemoryBackend());
  localStorage.setItem("isLoggedIn", "1");
  localStorage.setItem("user_tz", "B");
  await enqueue("A", { kind: "general", url: "/x", body: {}, label: "x", queuedAt: 1 });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<QueueStatus />); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
});

test("shows the other-user notice and deletes only after confirming", async () => {
  expect(container.textContent).toContain("يوجد حضور معلّق لمستخدم آخر على هذا الجهاز");
  expect(container.textContent).not.toContain("بانتظار الإرسال");
  const btn = container.querySelector("button");

  ask.mockResolvedValueOnce(false);
  await act(async () => { btn.click(); });
  expect(await othersPending("B")).toBe(1);

  ask.mockResolvedValueOnce(true);
  await act(async () => { btn.click(); });
  expect(await othersPending("B")).toBe(0);
});
