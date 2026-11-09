import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, API_BASE_URL: "/api" }));
jest.mock("../../WebServer/services/lesson/functionsLesson.jsx", () => ({
  addUsers: jest.fn(), removeUsers: jest.fn(), getAddableUsers: jest.fn(),
}));

import { addUsers, removeUsers, getAddableUsers } from "../../WebServer/services/lesson/functionsLesson.jsx";
import LessonParticipants from "./LessonParticipants";

global.IS_REACT_ACT_ENVIRONMENT = true;

// Users (staff) taking part in a lesson (owner, 2026-11-09). Synthetic names.
const PARTICIPANTS = [{ _id: "u1", name: "موظف أول" }];
const ADDABLE = [
  { _id: "g1", name: "مرشد البرنامج", reason: "STAFF" },
  { _id: "u1", name: "موظف أول", reason: "ON_LESSON" },
  { _id: "u2", name: "موظفة ثانية" },
];

let host, root;
beforeEach(() => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  addUsers.mockResolvedValue({ ok: true });
  removeUsers.mockResolvedValue({ ok: true });
  getAddableUsers.mockResolvedValue({ ok: true, users: ADDABLE });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

// LessonView's writer: runs the call and resolves whether it succeeded.
const apply = () => jest.fn(async (call) => (await call()).ok);
const render = (props) => act(async () => root.render(
  <LessonParticipants lessonId="L1" participants={PARTICIPANTS} canEdit={false} apply={apply()} confirmRemove={async () => true} {...props} />,
));
const buttonNamed = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.includes(text));

test("lists the participants by name, read-only without the permission", async () => {
  await render();
  expect(host.textContent).toContain("موظف أول");
  expect(buttonNamed("إضافة موظف")).toBeUndefined();
  expect(buttonNamed("إزالة")).toBeUndefined();
});

test("an empty list says so and offers adding to a permitted manager", async () => {
  await render({ participants: [], canEdit: true });
  expect(host.textContent).toContain("لا يشارك موظفون في هذا البرنامج");
  expect(buttonNamed("إضافة موظف")).toBeDefined();
});

test("the picker disables the lesson's staff and current participants, and adds a free user", async () => {
  const writer = apply();
  await render({ canEdit: true, apply: writer });
  await act(async () => { buttonNamed("إضافة موظف").click(); });
  expect(getAddableUsers).toHaveBeenCalledWith("L1");
  const option = (name) => [...host.querySelectorAll("[data-user-option]")].find((b) => b.textContent.includes(name));
  expect(option("مرشد البرنامج").disabled).toBe(true);
  expect(option("مرشد البرنامج").textContent).toContain("مرشد أو مساعد هذا البرنامج");
  expect(option("موظف أول").disabled).toBe(true);
  expect(option("موظف أول").textContent).toContain("مشارك بالفعل");
  expect(option("موظفة ثانية").disabled).toBe(false);
  await act(async () => { option("موظفة ثانية").click(); });
  expect(writer).toHaveBeenCalledTimes(1);
  expect(addUsers).toHaveBeenCalledWith("L1", ["u2"]);
});

test("the picker filters by name", async () => {
  await render({ canEdit: true });
  await act(async () => { buttonNamed("إضافة موظف").click(); });
  const input = host.querySelector('input[type="search"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "ثانية");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const names = [...host.querySelectorAll("[data-user-option]")].map((b) => b.textContent);
  expect(names).toHaveLength(1);
  expect(names[0]).toContain("موظفة ثانية");
});

test("removing asks first and writes only after a yes", async () => {
  const no = jest.fn(async () => false);
  await render({ canEdit: true, confirmRemove: no });
  await act(async () => { buttonNamed("إزالة").click(); });
  expect(no).toHaveBeenCalledWith(PARTICIPANTS[0]);
  expect(removeUsers).not.toHaveBeenCalled();

  await render({ canEdit: true, confirmRemove: async () => true });
  await act(async () => { buttonNamed("إزالة").click(); });
  expect(removeUsers).toHaveBeenCalledWith("L1", ["u1"]);
});
