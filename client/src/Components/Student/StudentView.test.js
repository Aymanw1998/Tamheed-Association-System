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
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getOne: jest.fn(), deleteS: jest.fn(), update: jest.fn() }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../WebServer/services/lesson/functionsLesson.jsx", () => ({ getAllLesson: jest.fn() }));
jest.mock("../ExportPDF/ExportPDF.jsx", () => ({ exportStudentPdf: jest.fn() }));
let mockPerms = [];
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => mockPerms.includes(k),
  getStoredUserId: () => "viewer-1",
}));

import { getOne, deleteS, update } from "../../WebServer/services/student/functionsStudent.jsx";
import { getAllLesson } from "../../WebServer/services/lesson/functionsLesson.jsx";
import { exportStudentPdf } from "../ExportPDF/ExportPDF.jsx";
import StudentView from "./StudentView";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

const STUDENT = {
  _id: "s1", tz: "800000001", firstname: "طالب", lastname: "تجربة", school: "مدرسة", layer: "السابع",
  father_name: "أب", father_phone: "050-2222222", main_teacher: "g1",
  guide: { name: "سامي علي", phone: "050-1111111" },
  // The server sends the student's lessons (all of them to an admin and to
  // the responsible guide, owner 2026-11-01): name, time and room only.
  lessons: [
    { _id: "L2", name: "كرة", date: { day: 3, startMin: 1050 }, room: "2" },
    { _id: "L1", name: "رياضيات", date: { day: 1, startMin: 960 }, room: "1" },
  ],
};
const LESSONS = [
  { _id: "L2", name: "كرة", date: { day: 3, startMin: 1050 }, room: "2", list_students: ["s1"] },
  { _id: "L1", name: "رياضيات", date: { day: 1, startMin: 960 }, room: "1", list_students: ["s1"] },
  { _id: "L3", name: "غيره", date: { day: 1, startMin: 600 }, room: "1", list_students: ["s9"] },
];

let container, root;
const mount = async (path = "/students/800000001") => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <I18nProvider><MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/students/:id" element={<StudentView />} />
      <Route path="/students" element={<p data-testid="students-list">list</p>} />
    </Routes></MemoryRouter></I18nProvider>
  ));
};
const openTab = async (label) => {
  const tab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === label);
  await act(async () => tab.click());
};

beforeEach(() => {
  mockPerms = ["students.view", "students.edit"];
  getOne.mockResolvedValue({ ok: true, student: STUDENT });
  getAllLesson.mockResolvedValue({ ok: true, lessons: LESSONS });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("shows the three tabs and the full personal details", async () => {
  await mount();
  expect([...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["التفاصيل الشخصية", "الدروس", "المرشد المسؤول"]);
  expect(container.textContent).toContain("050-2222222");
  expect(getOne).toHaveBeenCalledWith("800000001");
});

test("the lessons tab lists the lessons the server sent with the student, by day and time, linking to each", async () => {
  // The user's own lesson list may lack them (another guide's lesson).
  getAllLesson.mockResolvedValue({ ok: true, lessons: [] });
  await mount();
  await openTab("الدروس");
  const links = [...container.querySelectorAll('a[href^="/lessons/"]')];
  expect(links.map((a) => a.getAttribute("href"))).toEqual(["/lessons/L1", "/lessons/L2"]);
  expect(container.textContent).toContain("الأحد 16:00");
});

test("a student with no lessons shows «لا يوجد دروس بعد»", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, lessons: [] } });
  await mount();
  await openTab("الدروس");
  expect(container.textContent).toContain("لا يوجد دروس بعد");
});

test("no guide shows «لا يوجد مرشد مسؤول بعد»", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, main_teacher: null, guide: null } });
  await mount();
  await openTab("المرشد المسؤول");
  expect(container.textContent).toContain("لا يوجد مرشد مسؤول بعد");
});

test("a guide without tz shows name and phone as text, no link to the guide's page", async () => {
  await mount();
  await openTab("المرشد المسؤول");
  expect(container.textContent).toContain("سامي علي");
  expect(container.querySelector('a[href^="tel:"]').getAttribute("href")).toBe("tel:050-1111111");
  expect(container.querySelector('a[href^="/users/"]')).toBeNull();
});

test("a guide with tz links to the guide's page", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, guide: { ...STUDENT.guide, tz: "900000002" } } });
  await mount();
  await openTab("المرشد المسؤول");
  expect(container.querySelector('a[href="/users/900000002"]')).not.toBeNull();
});

test("edit shows only with students.edit; print passes the guide's name", async () => {
  mockPerms = ["students.view"];
  await mount();
  const labels = [...container.querySelectorAll("button")].map((b) => b.textContent);
  expect(labels).not.toContain("تعديل");
  const print = [...container.querySelectorAll("button")].find((b) => b.textContent === "طباعة الملف");
  await act(async () => print.click());
  expect(exportStudentPdf).toHaveBeenCalledWith(expect.objectContaining({ tz: "800000001" }), "سامي علي");
});

test("an unknown student shows the error", async () => {
  getOne.mockResolvedValue({ ok: false, message: "لا يوجد طالب" });
  await mount();
  expect(container.textContent).toContain("لا يوجد طالب");
});

test("a value is isolated from the right-to-left text, so +972… keeps its plus in front", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, phone: "+972500000000" } });
  await mount();
  const cell = [...container.querySelectorAll("bdi")].find((b) => b.textContent === "+972500000000");
  expect(cell).toBeDefined();
});

// The owner's rule (2026-11-01): the student's attendance, read-only, from
// the rows the server sent (newest first); the tab shows only when sent.
const ATTENDANCE = [
  { lesson: "L2", lessonName: "كرة", dateKey: 20261020, year: 2026, month: 10, day: 20, status: "غائب", notes: "مريض" },
  { lesson: "GONE", lessonName: "", dateKey: 20261001, year: 2026, month: 10, day: 1, status: "حاضر", notes: "" },
];

test("the attendance tab lists each date with the lesson, the status and the notes", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, attendance: ATTENDANCE } });
  await mount();
  await openTab("الحضور");
  const items = [...container.querySelectorAll("li")].map((li) => li.textContent);
  expect(items[0]).toContain("20/10/2026");
  expect(items[0]).toContain("كرة");
  expect(items[0]).toContain("غائب");
  expect(items[0]).toContain("مريض");
  expect(container.querySelector('a[href="/lessons/L2"]')).not.toBeNull();
  // A deleted lesson: the row stays, with no link and «درس محذوف».
  expect(items[1]).toContain("درس محذوف");
  expect(container.querySelector('a[href="/lessons/GONE"]')).toBeNull();
  // Read-only: nothing to change it with (the one select picks a month).
  expect(container.querySelector("input, textarea")).toBeNull();
  expect(container.querySelectorAll("select")).toHaveLength(1);
});

// Owner (2026-11-01, "do everything"): a summary, a month filter and a
// colour per status.
const MORE = [
  ...ATTENDANCE,
  { lesson: "L2", lessonName: "كرة", dateKey: 20260915, year: 2026, month: 9, day: 15, status: "متأخر", notes: "" },
  { lesson: "L2", lessonName: "كرة", dateKey: 20260908, year: 2026, month: 9, day: 8, status: "حاضر", notes: "" },
];
const summary = () => container.querySelector('[data-testid="attendance-summary"]').textContent;

test("the attendance tab sums up the rows: rate and each status", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, attendance: MORE } });
  await mount();
  await openTab("الحضور");
  expect(summary()).toContain("75%");
  expect(summary()).toContain("حاضر 2");
  expect(summary()).toContain("متأخر 1");
  expect(summary()).toContain("غائب 1");
});

test("picking a month shows only its rows and sums up that month", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, attendance: MORE } });
  await mount();
  await openTab("الحضور");
  const select = container.querySelector('[data-testid="attendance-month"]');
  expect([...select.options].map((o) => o.textContent)).toEqual(["كل الأشهر", "أكتوبر 2026", "سبتمبر 2026"]);
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    set.call(select, "2026-09");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const items = [...container.querySelectorAll("li")].map((li) => li.textContent);
  expect(items).toHaveLength(2);
  expect(items[0]).toContain("15/09/2026");
  expect(summary()).toContain("100%");
});

test("each row shows its status in that status's colour", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, attendance: MORE } });
  await mount();
  await openTab("الحضور");
  const tones = [...container.querySelectorAll("[data-tone]")].map((b) => [b.textContent, b.dataset.tone]);
  expect(tones).toEqual([["غائب", "absent"], ["حاضر", "present"], ["متأخر", "late"], ["حاضر", "present"]]);
});

test("the card beside the tabs shows the guide and the attendance rate", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, attendance: MORE } });
  await mount();
  const facts = container.querySelector('[data-testid="record-facts"]').textContent;
  expect(facts).toContain("سامي علي");
  expect(facts).toContain("75%");
  expect(facts).toContain("2"); // lessons
});

test("no attendance rows shows «لا يوجد حضور مسجّل بعد»", async () => {
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, attendance: [] } });
  await mount();
  await openTab("الحضور");
  expect(container.textContent).toContain("لا يوجد حضور مسجّل بعد");
});

test("no attendance tab when the server sends none (no attendance.view)", async () => {
  await mount();
  expect([...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).not.toContain("الحضور");
});

// Owner, 2026-11-02: deleting a student is done on their page, apart in the
// danger zone, no longer in the edit form.
const deleteButton = () => [...container.querySelectorAll('[data-testid="danger-zone"] button')].find((b) => b.textContent === "حذف");

test("with students.delete the page offers «حذف» in the danger zone; it deletes and goes back to the list", async () => {
  mockPerms = ["students.view", "students.delete"];
  getOne.mockResolvedValue({ ok: true, student: STUDENT });
  deleteS.mockResolvedValue({ ok: true });
  await mount();
  await act(async () => deleteButton().click());
  expect(deleteS).toHaveBeenCalledWith("800000001");
  expect(container.querySelector('[data-testid="students-list"]')).not.toBeNull();
});

test("a cancelled or failed delete stays on the page", async () => {
  mockPerms = ["students.view", "students.delete"];
  getOne.mockResolvedValue({ ok: true, student: STUDENT });
  deleteS.mockResolvedValue(null);
  await mount();
  await act(async () => deleteButton().click());
  deleteS.mockResolvedValue({ ok: false, message: "x" });
  await act(async () => deleteButton().click());
  expect(container.querySelector('[data-testid="students-list"]')).toBeNull();
});

test("no «حذف» without students.delete", async () => {
  mockPerms = ["students.view", "students.edit"];
  getOne.mockResolvedValue({ ok: true, student: STUDENT });
  await mount();
  expect(deleteButton()).toBeUndefined();
});

// Owner, 2026-11-02: a waiting request and an inactive student are opened
// from the list too; approving, rejecting and activating are on the page.
const btn = (label) => [...container.querySelectorAll("button")].find((b) => b.textContent === label);

test("a waiting request shows its state, «قبول» and, in the danger zone, «رفض»", async () => {
  mockPerms = ["students.view", "students.edit", "students.delete"];
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, status: "ينتظر" } });
  await mount();
  expect(container.querySelector('[data-testid="record-facts"]').textContent).toContain("ينتظر");
  expect(btn("قبول")).toBeDefined();
  expect([...container.querySelectorAll('[data-testid="danger-zone"] button')].map((b) => b.textContent)).toEqual(["رفض"]);
});

test("«قبول» makes the student active and keeps the page open", async () => {
  mockPerms = ["students.view", "students.edit"];
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, status: "ينتظر" } });
  update.mockResolvedValue({ ok: true, student: {} });
  await mount();
  await act(async () => btn("قبول").click());
  expect(update).toHaveBeenCalledWith("800000001", { status: "عادي" });
  expect(btn("قبول")).toBeUndefined();
  expect(container.querySelector('[data-testid="students-list"]')).toBeNull();
});

test("a cancelled «قبول» leaves the request waiting", async () => {
  mockPerms = ["students.view", "students.edit"];
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, status: "ينتظر" } });
  update.mockResolvedValue(null);
  await mount();
  await act(async () => btn("قبول").click());
  expect(btn("قبول")).toBeDefined();
});

test("«رفض» deletes the request and goes back to the list", async () => {
  mockPerms = ["students.view", "students.delete"];
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, status: "ينتظر" } });
  deleteS.mockResolvedValue({ ok: true });
  await mount();
  await act(async () => btn("رفض").click());
  expect(deleteS).toHaveBeenCalledWith("800000001");
  expect(container.querySelector('[data-testid="students-list"]')).not.toBeNull();
});

test("an inactive student gets «تفعيل»", async () => {
  mockPerms = ["students.view", "students.edit"];
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, status: "غير فعال" } });
  update.mockResolvedValue({ ok: true, student: {} });
  await mount();
  await act(async () => btn("تفعيل").click());
  expect(update).toHaveBeenCalledWith("800000001", { status: "عادي" });
});

test("no «قبول» without students.edit, and no «قبول» or «تفعيل» for an active student", async () => {
  mockPerms = ["students.view", "students.delete"];
  getOne.mockResolvedValue({ ok: true, student: { ...STUDENT, status: "ينتظر" } });
  await mount();
  expect(btn("قبول")).toBeUndefined();
  await act(async () => root.unmount());
  container.remove();
  mockPerms = ["students.view", "students.edit"];
  getOne.mockResolvedValue({ ok: true, student: STUDENT });
  await mount();
  expect(btn("قبول")).toBeUndefined();
  expect(btn("تفعيل")).toBeUndefined();
});
