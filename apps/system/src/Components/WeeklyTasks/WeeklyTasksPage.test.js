import React, { act } from "react";
import { createRoot } from "react-dom/client";

const mockNavigate = jest.fn();
let mockManage = false;
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
jest.mock("../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx", () => ({
  getMyTasks: jest.fn(), setMyTaskDone: jest.fn(), getTaskBoard: jest.fn(), approveTask: jest.fn(),
}));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { warn: jest.fn(), success: jest.fn() } }));
jest.mock("../../utils/session", () => ({ canStored: () => mockManage }));

import { approveTask, getMyTasks, getTaskBoard, setMyTaskDone } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import WeeklyTasksPage from "./WeeklyTasksPage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WEEK = "2026-11-08";
const task = (over) => ({ taskId: "t1", groupId: "g1", groupName: "Guide One", title: "نظافة الغرفة", details: "", done: false, approved: false, ...over });
const BOARD = {
  ok: true,
  tasks: [{ id: "t1", title: "نظافة الغرفة", details: "" }],
  groups: [{ id: "g1", name: "Guide One" }, { id: "g2", name: "Empty Group" }],
  assignments: [{ taskId: "t1", groupId: "g1" }],
  statuses: [],
  lastWeek: [{ groupId: "g1", total: 3, done: 2 }],
};

let host, root;
const mount = async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<WeeklyTasksPage />));
};
const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);

beforeEach(() => {
  mockManage = false;
  mockNavigate.mockReset();
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [task()] });
  getTaskBoard.mockResolvedValue(BOARD);
  setMyTaskDone.mockResolvedValue({ ok: true, week: WEEK, tasks: [task({ done: true })] });
  approveTask.mockResolvedValue({ ok: true });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

test("a guide sees his task, marks it done, and it moves down to the done part", async () => {
  await mount();
  expect(getTaskBoard).not.toHaveBeenCalled();
  expect(button("تعديل المهمات والمجموعات")).toBeUndefined();
  expect(host.textContent).not.toContain("تم إنجازها");
  await act(async () => host.querySelector('input[type="checkbox"]:not(:checked)').click());
  expect(setMyTaskDone).toHaveBeenCalledWith("t1", "g1", true, WEEK);
  expect(host.textContent).toContain("تم إنجازها");
  expect(host.querySelector('input[type="checkbox"]').checked).toBe(true);
});

test("a task the management confirmed cannot be undone by the guide", async () => {
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [task({ done: true, approved: true })] });
  await mount();
  expect(host.textContent).toContain("أكّدتها الإدارة");
  expect(host.querySelector('input[type="checkbox"]').checked).toBe(true);
  expect(host.querySelector('input[type="checkbox"]').disabled).toBe(true);
});

test("the management sees the register and the way to editing; an empty group is not listed", async () => {
  mockManage = true;
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [] });
  await mount();
  await act(async () => button("عرض مهمات الجمعية").click());
  expect(host.textContent).toContain("Guide One");
  expect(host.textContent).not.toContain("Empty Group");

  expect(host.textContent).not.toContain("مهمات مجموعتي");
  await act(async () => button("تعديل المهمات والمجموعات").click());
  expect(mockNavigate).toHaveBeenCalledWith("/weekly-tasks/manage");
});

test("a manager responsible for a group also sees his own tasks", async () => {
  mockManage = true;
  await mount();
  expect(host.textContent).toContain("مهمات مجموعتي");
  expect(host.textContent).not.toContain("سجل المهمات");
  expect(getTaskBoard).not.toHaveBeenCalled();
  await act(async () => button("عرض مهمات الجمعية").click());
  expect(host.textContent).toContain("سجل المهمات");
  await act(async () => button("عرض مهماتي").click());
  expect(host.textContent).toContain("مهمات مجموعتي");
});

test("the management's check confirms a task, and pressing it again takes it back", async () => {
  mockManage = true;
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [] });
  await mount();
  await act(async () => button("عرض مهمات الجمعية").click());
  const check = () => host.querySelector('input[type="checkbox"]');
  expect(check().checked).toBe(false);
  await act(async () => check().click());
  expect(approveTask).toHaveBeenCalledWith("t1", "g1", true, WEEK);
  getTaskBoard.mockResolvedValue({ ...BOARD, statuses: [{ taskId: "t1", groupId: "g1", done: true, approved: true }] });
  await act(async () => check().click());
  await act(async () => check().click());
  expect(approveTask).toHaveBeenLastCalledWith("t1", "g1", false, WEEK);
});

test("the same duty in two lessons has independent controls, and a completed duty moves below the open one", async () => {
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [task(), task({ groupId: "second", groupName: "Second lesson" })] });
  setMyTaskDone.mockResolvedValue({ ok: true, week: WEEK, tasks: [task({ done: true }), task({ groupId: "second", groupName: "Second lesson" })] });
  await mount();
  await act(async () => host.querySelector('input[type="checkbox"]:not(:checked)').click());
  expect(setMyTaskDone).toHaveBeenCalledWith("t1", "g1", true, WEEK);
  const items = [...host.querySelectorAll("li")];
  expect(items[0].textContent).toContain("Second lesson");
  expect(items[1].textContent).toContain("Guide One");
  await act(async () => host.querySelector('input[type="checkbox"]:not(:checked)').click());
  expect(setMyTaskDone).toHaveBeenLastCalledWith("t1", "second", true, WEEK);
});

test("management sees a check for duties already completed by the responsible person", async () => {
  mockManage = true;
  getTaskBoard.mockResolvedValue({ ...BOARD, statuses: [{ taskId: "t1", groupId: "g1", done: true, approved: false }] });
  await mount(); await act(async () => button("عرض مهمات الجمعية").click());
  const check = host.querySelector('input[type="checkbox"]');
  expect(check.checked).toBe(true); expect(host.textContent).toContain("أنجزها المسؤول");
  await act(async () => check.click());
  expect(approveTask).toHaveBeenCalledWith("t1", "g1", false, WEEK);
});

test("a failed completion leaves the checkbox clear and the duty in the open section", async () => {
  setMyTaskDone.mockResolvedValue({ ok: false, message: "Failed" });
  await mount(); await act(async () => host.querySelector('input[type="checkbox"]').click());
  expect(host.querySelector('input[type="checkbox"]').checked).toBe(false);
  expect(host.textContent).not.toContain("تم إنجازها");
});
