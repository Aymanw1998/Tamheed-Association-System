import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, API_BASE_URL: "/api" }));
jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({ getUserById: jest.fn(), signOutEverywhere: jest.fn() }));
let mockConfirm = true;
jest.mock("../Provides/confirmBus", () => ({ ask: () => Promise.resolve(mockConfirm) }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success() {}, warn() {}, error() {} } }));
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getAll: jest.fn() }));
jest.mock("../../WebServer/services/lesson/functionsLesson.jsx", () => ({ getAllLesson: jest.fn() }));
let mockPerms = [];
let mockViewer = { id: "admin-1", tz: "900000001", role: "ادارة", isSystem: false };
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => mockPerms.includes(k),
  getStoredViewer: () => mockViewer,
}));

import { getUserById, signOutEverywhere } from "../../WebServer/services/user/functionsUser.jsx";
import { getAll as getStudents } from "../../WebServer/services/student/functionsStudent.jsx";
import { getAllLesson } from "../../WebServer/services/lesson/functionsLesson.jsx";
import UserView from "./UserView";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

const USER = { _id: "g1", tz: "900000002", firstname: "سامي", lastname: "علي", phone: "050-1111111", roles: ["مرشد"] };
const STUDENTS = [
  { _id: "s1", tz: "800000001", firstname: "أول", lastname: "طالب", main_teacher: "g1" },
  { _id: "s2", tz: "800000002", firstname: "ثاني", lastname: "طالب", main_teacher: "other" },
];
const LESSONS = [{ _id: "L1", name: "رياضيات", date: { day: 1, startMin: 960 }, teacher: "g1", list_students: [] }];

let container, root;
const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <I18nProvider><MemoryRouter initialEntries={["/users/900000002"]}><Routes>
      <Route path="/users/:id" element={<UserView />} />
    </Routes></MemoryRouter></I18nProvider>
  ));
};
const tabLabels = () => [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);

beforeEach(() => {
  mockPerms = ["users.view", "users.edit"];
  mockViewer = { id: "admin-1", tz: "900000001", role: "ادارة", isSystem: false };
  getUserById.mockResolvedValue({ ok: true, user: USER });
  getStudents.mockResolvedValue({ ok: true, students: STUDENTS });
  getAllLesson.mockResolvedValue({ ok: true, lessons: LESSONS });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("a guide with students and lessons has three tabs", async () => {
  await mount();
  expect(tabLabels()).toEqual(["التفاصيل الشخصية", "طلابه", "دروسه"]);
  expect(getUserById).toHaveBeenCalledWith("900000002");
});

test("their students link to the student's page; other students are not listed", async () => {
  await mount();
  await act(async () => [...container.querySelectorAll('[role="tab"]')][1].click());
  const hrefs = [...container.querySelectorAll('a[href^="/students/"]')].map((a) => a.getAttribute("href"));
  expect(hrefs).toEqual(["/students/800000001"]);
});

test("with lessons only, there is no students tab", async () => {
  getStudents.mockResolvedValue({ ok: true, students: [] });
  await mount();
  expect(tabLabels()).toEqual(["التفاصيل الشخصية", "دروسه"]);
});

test("with no students and no lessons there is no tab bar", async () => {
  getStudents.mockResolvedValue({ ok: true, students: [] });
  getAllLesson.mockResolvedValue({ ok: true, lessons: [] });
  await mount();
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  expect(container.textContent).toContain("050-1111111");
});

test("no edit button without users.edit", async () => {
  mockPerms = ["users.view"];
  await mount();
  expect([...container.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("تعديل");
});

const editShown = () => [...container.querySelectorAll("button")].some((b) => b.textContent === "تعديل");

test("an admin gets «تعديل» on an active guide", async () => {
  await mount();
  expect(editShown()).toBe(true);
});

test("no «تعديل» on a user waiting for approval or inactive (the form edits active users only)", async () => {
  for (const room of ["waiting", "noActive"]) {
    getUserById.mockResolvedValue({ ok: true, user: { ...USER, room } });
    await mount();
    expect([room, editShown()]).toEqual([room, false]);
    await act(async () => root.unmount());
    container.remove();
  }
  await mount();
});

test("no «تعديل» on a user of the viewer's own rank or higher", async () => {
  mockViewer = { id: "guide-2", tz: "900000009", role: "مرشد", isSystem: false };
  await mount();
  expect(editShown()).toBe(false);
});

// The owner's rule (2026-11-01): signed in until signing out, or until an
// admin signs the user out of every device.
const signOutButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "تسجيل الخروج من كل الأجهزة");

test("an admin who may edit the user can sign him out of every device, after confirming", async () => {
  mockConfirm = true;
  signOutEverywhere.mockResolvedValue({ ok: true });
  await mount();
  await act(async () => signOutButton().click());
  expect(signOutEverywhere).toHaveBeenCalledWith("900000002");
});

test("signing out of every device sits apart, in the danger zone", async () => {
  await mount();
  const zone = container.querySelector('[data-testid="danger-zone"]');
  expect(zone).not.toBeNull();
  expect(zone.contains(signOutButton())).toBe(true);
});

test("cancelling the confirmation signs nobody out", async () => {
  mockConfirm = false;
  signOutEverywhere.mockClear();
  await mount();
  await act(async () => signOutButton().click());
  expect(signOutEverywhere).not.toHaveBeenCalled();
});

test("no sign-out button without users.edit", async () => {
  mockPerms = ["users.view"];
  await mount();
  expect(signOutButton()).toBeUndefined();
});
