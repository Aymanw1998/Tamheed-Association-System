jest.mock("../../utils/session", () => ({ ...jest.requireActual("../../utils/session"), canStored: jest.fn(() => true) }));
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ManageWeeklyTasks from "./ManageWeeklyTasks";
import { assignTask, getTaskBoard, unassignTask } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { warn: jest.fn() } }));
jest.mock("../Provides/confirmBus.js", () => ({ ask: async () => true }));
jest.mock("../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx", () => ({
  getTaskBoard: jest.fn(), assignTask: jest.fn(), unassignTask: jest.fn(), addTask: jest.fn(), editTask: jest.fn(), removeTask: jest.fn(),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => {
  require("../../utils/session").canStored.mockReturnValue(true);
  jest.clearAllMocks();
  getTaskBoard.mockResolvedValue({ ok: true, guides: [{ id: "owner", name: "Same owner" }],
    groups: [{ id: "first", name: "First lesson", ownerNames: ["Same owner"] }, { id: "second", name: "Second lesson", ownerNames: ["Same owner"] }],
    tasks: [{ id: "task", title: "Duty" }], assignments: [{ taskId: "task", groupId: "first" }],
  });
  assignTask.mockResolvedValue({ ok: true });
  unassignTask.mockResolvedValue({ ok: true });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("management distributes and releases a task by lesson, even when two lessons share one owner", async () => {
  await act(async () => root.render(<ManageWeeklyTasks />));
  await act(async () => host.querySelector("button[aria-pressed]").click());
  const second = [...host.querySelectorAll("button")].find((button) => button.textContent.includes("Second lesson"));
  await act(async () => second.click());
  expect(assignTask).toHaveBeenCalledWith("task", "second");
  const release = host.querySelector('button[aria-label="إزالة Duty من First lesson"]');
  await act(async () => release.click());
  expect(unassignTask).toHaveBeenCalledWith("task", "first");
});
