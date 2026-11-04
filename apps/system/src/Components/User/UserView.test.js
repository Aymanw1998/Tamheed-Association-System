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
jest.mock("./PermissionsTab.jsx", () => ({ __esModule: true, default: () => require("react").createElement("div", { "data-testid": "permissions-tab" }) }));
jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({
  getUserById: jest.fn(), signOutEverywhere: jest.fn(), deleteU: jest.fn(), changeStatus: jest.fn(),
}));
jest.mock("../ExportPDF/ExportPDF.jsx", () => ({ exportUserPdf: jest.fn() }));
let mockConfirm = true;
jest.mock("../Provides/confirmBus", () => ({ ask: () => Promise.resolve(mockConfirm) }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success() {}, warn() {}, error() {} } }));
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getAll: jest.fn() }));
jest.mock("../../WebServer/services/lesson/functionsLesson.jsx", () => ({ getAllLesson: jest.fn() }));
let mockRole = "مرشد";
jest.mock("./RolePickerDialog.jsx", () => ({
  useRolePicker: () => ({ pickRole: () => Promise.resolve(mockRole), roleDialog: null }),
  permissionError: (t, res) => res?.message || "error",
}));
let mockPerms = [];
let mockAdminPowers = false;
let mockViewer = { id: "admin-1", tz: "900000001", role: "ادارة", isSystem: false };
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => mockPerms.includes(k),
  getStoredViewer: () => mockViewer,
  isStoredAdminPowers: () => mockAdminPowers,
}));

import { getUserById, signOutEverywhere, deleteU, changeStatus } from "../../WebServer/services/user/functionsUser.jsx";
import { exportUserPdf } from "../ExportPDF/ExportPDF.jsx";
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
      <Route path="/users" element={<p data-testid="users-list">list</p>} />
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

// Owner, 2026-11-02: printing, suspending and deleting a user are
// done on their page (the last two apart, in the danger zone), no longer in
// the list or the edit form.
const button = (label) => [...container.querySelectorAll("button")].find((b) => b.textContent === label);
const inDanger = (label) => [...container.querySelectorAll('[data-testid="danger-zone"] button')].some((b) => b.textContent === label);

test("print is offered to anyone who sees the user", async () => {
  mockPerms = ["users.view"];
  await mount();
  await act(async () => button("طباعة الملف").click());
  expect(exportUserPdf).toHaveBeenCalledWith(USER);
});

test("with users.delete «حذف الحساب» sits in the danger zone; it deletes from the active room and goes to the list", async () => {
  mockPerms = ["users.view", "users.edit", "users.delete"];
  deleteU.mockResolvedValue({ ok: true });
  await mount();
  expect(inDanger("حذف الحساب")).toBe(true);
  await act(async () => button("حذف الحساب").click());
  expect(deleteU).toHaveBeenCalledWith("900000002", "active");
  expect(container.querySelector('[data-testid="users-list"]')).not.toBeNull();
});

test("«إيقاف الحساب» asks first, then moves the user to the inactive accounts", async () => {
  mockPerms = ["users.view", "users.edit", "users.approve"];
  mockConfirm = true;
  changeStatus.mockResolvedValue({ ok: true });
  await mount();
  expect(inDanger("إيقاف الحساب")).toBe(true);
  await act(async () => button("إيقاف الحساب").click());
  expect(changeStatus).toHaveBeenCalledWith("900000002", "active", "noActive");
  expect(container.querySelector('[data-testid="users-list"]')).not.toBeNull();
});

test("no delete or suspend for a user the viewer may not manage, or without the permissions", async () => {
  mockPerms = ["users.view"];
  await mount();
  expect(button("حذف الحساب")).toBeUndefined();
  expect(button("إيقاف الحساب")).toBeUndefined();
  await act(async () => root.unmount());
  container.remove();
  mockPerms = ["users.view", "users.edit", "users.delete"];
  mockViewer = { id: "guide-2", tz: "900000009", role: "مرشد", isSystem: false };
  await mount();
  expect(button("حذف الحساب")).toBeUndefined();
  expect(button("إيقاف الحساب")).toBeUndefined();
});

// Owner, 2026-11-02: a waiting or suspended account is opened from the list
// too; approving and reactivating are on its page.
test("a waiting account shows its state and «قبول»; approving picks a role and reloads the page", async () => {
  mockPerms = ["users.view", "users.approve", "users.delete"];
  mockRole = "مرشد";
  getUserById.mockResolvedValue({ ok: true, user: { ...USER, room: "waiting" } });
  changeStatus.mockResolvedValue({ ok: true });
  await mount();
  expect(container.querySelector('[data-testid="record-facts"]').textContent).toContain("بانتظار الموافقة");
  expect(inDanger("حذف الحساب")).toBe(true);
  const calls = getUserById.mock.calls.length;
  await act(async () => button("قبول").click());
  expect(changeStatus).toHaveBeenCalledWith("900000002", "waiting", "active", "مرشد");
  expect(getUserById.mock.calls.length).toBe(calls + 1);
});

test("cancelling the role picker approves nobody", async () => {
  mockPerms = ["users.view", "users.approve"];
  mockRole = null;
  changeStatus.mockClear();
  getUserById.mockResolvedValue({ ok: true, user: { ...USER, room: "waiting" } });
  await mount();
  await act(async () => button("قبول").click());
  expect(changeStatus).not.toHaveBeenCalled();
});

test("a suspended account with a role is reactivated with «تفعيل», no role asked", async () => {
  mockPerms = ["users.view", "users.approve"];
  mockRole = null;
  getUserById.mockResolvedValue({ ok: true, user: { ...USER, room: "noActive" } });
  changeStatus.mockResolvedValue({ ok: true });
  await mount();
  expect(container.querySelector('[data-testid="record-facts"]').textContent).toContain("موقوف");
  await act(async () => button("تفعيل").click());
  expect(changeStatus).toHaveBeenCalledWith("900000002", "noActive", "active", undefined);
});

test("deleting a waiting account deletes it from the waiting room", async () => {
  mockPerms = ["users.view", "users.delete"];
  deleteU.mockResolvedValue({ ok: true });
  getUserById.mockResolvedValue({ ok: true, user: { ...USER, room: "waiting" } });
  await mount();
  await act(async () => button("حذف الحساب").click());
  expect(deleteU).toHaveBeenCalledWith("900000002", "waiting");
});

test("no «قبول» without users.approve, or on an account the viewer may not manage", async () => {
  getUserById.mockResolvedValue({ ok: true, user: { ...USER, room: "waiting" } });
  mockPerms = ["users.view", "users.edit"];
  await mount();
  expect(button("قبول")).toBeUndefined();
  await act(async () => root.unmount());
  container.remove();
  mockPerms = ["users.view", "users.approve"];
  mockViewer = { id: "guide-2", tz: "900000009", role: "مرشد", isSystem: false };
  await mount();
  expect(button("قبول")).toBeUndefined();
});

test("an active account offers neither «قبول» nor «تفعيل»", async () => {
  mockPerms = ["users.view", "users.approve"];
  await mount();
  expect(button("قبول")).toBeUndefined();
  expect(button("تفعيل")).toBeUndefined();
});


// Owner, 2026-11-03: permissions, the password state and unlocking are IT
// actions, on the IT site. An administrator keeps the role and the password
// reset, which sit in the edit form behind «تعديل».
test("an administrator sees role change and password reset, not permissions, view-password or unlock", async () => {
  mockPerms = ["users.view", "users.edit", "users.changeRole", "users.resetPassword", "users.passwords", "users.unlock", "permissions.manage"];
  getUserById.mockResolvedValue({ ok: true, user: { ...USER, lockedAt: "2026-11-01T10:00:00Z" } });
  await mount();
  expect(editShown()).toBe(true);
  expect(tabLabels()).not.toContain("الصلاحيات");
  const labels = [...container.querySelectorAll("button")].map((b) => b.textContent);
  expect(labels).not.toContain("رفع الحظر");
  expect(labels.join(" ")).not.toMatch(/عرض كلمة المرور|الصلاحيات/);
  expect(container.querySelector('[data-tour="user-permissions"]')).toBeNull();
});

test("an IT user below the viewer: edit his details, no account actions, and he shows as IT (owner, 2026-11-03)", async () => {
  mockPerms = ["users.view", "users.edit", "users.approve", "users.delete", "users.changeRole", "users.passwords"];
  getUserById.mockResolvedValue({ ok: true, user: { ...USER, isIT: true } });
  await mount();
  const labels = [...container.querySelectorAll("button")].map((b) => b.textContent);
  expect(labels).toContain("تعديل");
  for (const label of ["تسجيل الخروج من كل الأجهزة", "إيقاف الحساب", "حذف الحساب"]) expect(labels).not.toContain(label);
  expect(labels).toContain("طباعة الملف");
  const facts = container.querySelector('[data-testid="record-facts"]').textContent;
  expect(facts).toContain("قسم IT");
  expect(facts).toContain("لا يمكن إيقافه أو حذفه");
});

test("an administrator with the powers gets the permissions tab on an active user below him", async () => {
  mockAdminPowers = true;
  await mount();
  expect(tabLabels()).toContain("الصلاحيات");
  await act(async () => [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === "الصلاحيات").click());
  expect(container.querySelector('[data-testid="permissions-tab"]')).not.toBeNull();
  mockAdminPowers = false;
});

test("no permissions tab with the powers off, on a peer, or on a waiting user", async () => {
  await mount();
  expect(tabLabels()).not.toContain("الصلاحيات");
  await act(async () => root.unmount()); container.remove();
  mockAdminPowers = true;
  getUserById.mockResolvedValue({ ok: true, user: { ...USER, roles: ["ادارة"] } });
  await mount();
  expect(tabLabels()).not.toContain("الصلاحيات");
  await act(async () => root.unmount()); container.remove();
  getUserById.mockResolvedValue({ ok: true, user: { ...USER, room: "waiting" } });
  await mount();
  expect(tabLabels()).not.toContain("الصلاحيات");
  mockAdminPowers = false;
});
