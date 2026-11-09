import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
let mockMounts = 0;
jest.mock("./Profile", () => {
  const React = require("react");
  return { __esModule: true, default: () => { React.useEffect(() => { mockMounts += 1; }, []); return <form data-testid="profile-form">نموذج الملف الشخصي</form>; } };
});
jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, API_BASE_URL: "/api" }));
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getAll: jest.fn() }));
jest.mock("../../WebServer/services/lesson/functionsLesson.jsx", () => ({ getAllLesson: jest.fn(), getMyParticipations: jest.fn() }));
let mockPerms = [];
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => mockPerms.includes(k),
  getStoredUserId: () => "g1",
}));

import { getAll as getStudents } from "../../WebServer/services/student/functionsStudent.jsx";
import { getAllLesson, getMyParticipations } from "../../WebServer/services/lesson/functionsLesson.jsx";
import ProfilePage from "./ProfilePage";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><MemoryRouter initialEntries={["/profile"]}><ProfilePage /></MemoryRouter></I18nProvider>));
};
const tabs = () => [...container.querySelectorAll('[role="tab"]')];

beforeEach(() => {
  jest.clearAllMocks();
  mockPerms = ["students.view", "lessons.view"];
  getStudents.mockResolvedValue({ ok: true, students: [{ _id: "s1", tz: "800000001", firstname: "أول", lastname: "طالب", main_teacher: "g1" }] });
  getAllLesson.mockResolvedValue({ ok: true, lessons: [] });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("a guide with students sees «طلابي», linking to each student's page", async () => {
  await mount();
  expect(tabs().map((t) => t.textContent)).toEqual(["تفاصيلي", "طلابي"]);
  await act(async () => tabs()[1].click());
  expect(container.querySelector('a[href="/students/800000001"]')).not.toBeNull();
});

test("the form stays mounted while another tab is open (no lost edits)", async () => {
  await mount();
  await act(async () => tabs()[1].click());
  const form = container.querySelector('[data-testid="profile-form"]');
  expect(form).not.toBeNull();
  expect(form.closest("[hidden]")).not.toBeNull();
});

test("no students and no lessons: the form alone, no tab bar", async () => {
  getStudents.mockResolvedValue({ ok: true, students: [] });
  await mount();
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  expect(container.querySelector('[data-testid="profile-form"]')).not.toBeNull();
});

test("a failed students load hides that tab and keeps the form", async () => {
  getStudents.mockResolvedValue({ ok: false, message: "x" });
  await mount();
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  expect(container.querySelector('[data-testid="profile-form"]')).not.toBeNull();
});

test("without students.view the students list is not requested", async () => {
  mockPerms = ["lessons.view"];
  await mount();
  expect(getStudents).not.toHaveBeenCalled();
});

test("the form is not rebuilt when the tabs arrive (edits already typed are kept)", async () => {
  let release;
  getStudents.mockReturnValue(new Promise((r) => { release = r; }));
  mockMounts = 0;
  await mount();
  expect(mockMounts).toBe(1);
  await act(async () => release({ ok: true, students: [{ _id: "s1", tz: "800000001", firstname: "أول", lastname: "طالب", main_teacher: "g1" }] }));
  expect(tabs().length).toBe(2);
  expect(mockMounts).toBe(1);
});

// «البرامج المسجّل فيها» (owner, 2026-11-09): under the tabs, for anyone.
test("the programs the user takes part in show at the bottom of his page", async () => {
  mockPerms = [];
  getMyParticipations.mockResolvedValue({ ok: true, lessons: [{ _id: "L9", name: "برنامج مشاركة", room: "2", date: { day: 2, startMin: 900, endMin: 960 }, teacherName: "مرشد", helperName: "", attendance: [] }] });
  await mount();
  expect(container.textContent).toContain("البرامج المسجّل فيها");
  expect(container.textContent).toContain("برنامج مشاركة");
});
