import React, { act } from "react";
import { createRoot } from "react-dom/client";
import WeeklyPraise from "./WeeklyPraise";
import { getMyTasks, markPraiseSeen } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
jest.mock("../../utils/session", () => ({ getStoredUserId: () => "owner" }));
jest.mock("../../journey/demoMode", () => ({ isDemo: () => false }));
jest.mock("../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx", () => ({ getMyTasks: jest.fn(), markPraiseSeen: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => { jest.clearAllMocks(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const mount = () => act(async () => root.render(<WeeklyPraise />));
const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);

test("unfinished current-week tasks remind again on the next login, without marking praise seen", async () => {
  getMyTasks.mockResolvedValue({ ok: true, tasks: [{ done: false }, { done: true }], praise: false });
  await mount();
  expect(host.textContent).toContain("بقيت لمجموعتك 1");
  await act(async () => button("إغلاق").click());
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(markPraiseSeen).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  root = createRoot(host);
  await mount();
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => button("عرض المهمات").click());
  expect(mockNavigate).toHaveBeenCalledWith("/weekly-tasks");
});

test("completed or unassigned owners get no unfinished-task reminder", async () => {
  getMyTasks.mockResolvedValue({ ok: true, tasks: [{ done: true }], praise: false });
  await mount();
  expect(host.textContent).toBe("");
});

test("old earned praise is acknowledged for its precise week", async () => {
  getMyTasks.mockResolvedValue({ ok: true, tasks: [], praise: true, praiseWeek: "2026-11-08", greeting: "بارك الله فيكم على مجهودكم" });
  await mount();
  expect(host.textContent).toContain("2026-11-08");
  await act(async () => button("إغلاق").click());
  expect(markPraiseSeen).toHaveBeenCalledWith("2026-11-08");
});
