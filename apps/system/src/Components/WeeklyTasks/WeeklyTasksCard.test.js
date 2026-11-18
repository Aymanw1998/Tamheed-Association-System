import React, { act } from "react";
import { createRoot } from "react-dom/client";

let mockCanView = true;
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx", () => ({ getMyTasks: jest.fn() }));
jest.mock("../../utils/session", () => ({ canStored: (key) => key === "tasks.view" && mockCanView }));

import { getMyTasks } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import WeeklyTasksCard from "./WeeklyTasksCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root; let host;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); mockCanView = true; });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const task = (n, done = false) => ({ taskId: `t${n}`, groupId: "g1", groupName: "Group", title: `مهمة ${n}`, done });
const show = async () => { await act(async () => root.render(<WeeklyTasksCard />)); };

test("lists my open tasks by name first on the dashboard (owner), at most five", async () => {
  getMyTasks.mockResolvedValue({ ok: true, tasks: [task(1), task(2, true), task(3), task(4), task(5), task(6), task(7)] });
  await show();
  expect(host.textContent).toContain("مهماتي هذا الأسبوع (6)");
  expect(host.querySelectorAll("li")).toHaveLength(5);
  expect(host.textContent).not.toContain("مهمة 2");
  expect(host.textContent).toContain("و1 أخرى");
});

test("nothing when every task is done, or without tasks.view", async () => {
  getMyTasks.mockResolvedValue({ ok: true, tasks: [task(1, true)] });
  await show();
  expect(host.textContent).toBe("");
  mockCanView = false;
  getMyTasks.mockClear();
  act(() => root.unmount());
  root = createRoot(host);
  await show();
  expect(getMyTasks).not.toHaveBeenCalled();
});
