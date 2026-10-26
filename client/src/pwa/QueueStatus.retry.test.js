import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("../Components/Provides/confirmBus", () => ({ ask: jest.fn() }));
jest.mock("../WebServer/services/api", () => ({ __esModule: true, default: { post: jest.fn(), put: jest.fn() } }));

import api from "../WebServer/services/api";
import QueueStatus from "./QueueStatus";
import { liveEvents } from "../WebServer/services/live/liveStream";
import { createMemoryBackend, enqueue, pending, setBackend } from "./attendanceQueue";

global.IS_REACT_ACT_ENVIRONMENT = true;

const locked = () => Promise.reject(Object.assign(new Error("locked"), { response: { status: 423, data: { code: "LOCKED" } } }));
const flushAll = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
let container, root;

beforeEach(async () => {
  jest.useFakeTimers();
  setBackend(createMemoryBackend());
  localStorage.setItem("isLoggedIn", "1");
  localStorage.setItem("user_tz", "B");
  api.post.mockReset();
  await enqueue("B", { kind: "general", url: "/attendance/bulk-save", body: { lessonId: "L", year: 2026, month: 10, day: 25 }, label: "x", queuedAt: 1 });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  jest.useRealTimers();
});

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<QueueStatus />); });
  await flushAll();
};

test("after a 423 the queue is retried after 30 s, then backs off", async () => {
  api.post.mockImplementation(locked);
  await mount();
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(29000); });
  await flushAll();
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(1000); });
  await flushAll();
  expect(api.post).toHaveBeenCalledTimes(2);
  // Next wait is 60 s.
  await act(async () => { jest.advanceTimersByTime(30000); });
  await flushAll();
  expect(api.post).toHaveBeenCalledTimes(2);
  api.post.mockResolvedValue({ data: { ok: true } });
  await act(async () => { jest.advanceTimersByTime(30000); });
  await flushAll();
  expect(api.post).toHaveBeenCalledTimes(3);
  expect(await pending("B")).toHaveLength(0);
});

test("a lock event sends the waiting items at once", async () => {
  api.post.mockImplementationOnce(locked);
  await mount();
  api.post.mockResolvedValue({ data: { ok: true } });
  await act(async () => liveEvents.emit("lock", { key: "attendance:L:2026-10-25" }));
  await flushAll();
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(await pending("B")).toHaveLength(0);
});
