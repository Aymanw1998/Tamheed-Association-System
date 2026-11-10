import React from "react";
import { Simulate } from "react-dom/test-utils";
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
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getAll: jest.fn(), deleteS: jest.fn(), update: jest.fn() }));
jest.mock("../../locks/useLiveRefresh", () => ({ __esModule: true, default: () => {} }));
jest.mock("../ExportPDF/ExportPDF.jsx", () => ({ exportStudentPdf: jest.fn() }));
jest.mock("../../utils/excelExport", () => ({ ...jest.requireActual("../../utils/excelExport"), downloadWorkbook: jest.fn(() => Promise.resolve()) }));
let mockPerms = [];
jest.mock("../../utils/session.js", () => ({
  ...jest.requireActual("../../utils/session.js"),
  canStored: (k) => mockPerms.includes(k),
}));

import { getAll } from "../../WebServer/services/student/functionsStudent.jsx";
import ViewAllStudent from "./ViewAllStudent";
import { downloadWorkbook } from "../../utils/excelExport";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

// Owner, 2026-11-02: a row opens the student's page, where print, edit and
// delete are, and approve/reject for a waiting request; the list itself
// offers none of them.

let container, root;
const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><MemoryRouter initialEntries={["/students"]}><Routes>
    <Route path="/students" element={<ViewAllStudent />} />
    <Route path="/students/:id" element={<p data-testid="opened">opened</p>} />
  </Routes></MemoryRouter></I18nProvider>));
};

const STUDENT = { _id: "s1", tz: "800000001", firstname: "طالب", lastname: "تجربة", status: "عادي" };
beforeEach(() => {
  getAll.mockResolvedValue({ ok: true, students: [STUDENT] });
});
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); });

const labels = () => [...container.querySelectorAll("button")].map((b) => b.textContent.trim());

test("an admin's list has no «تعديل» or «ملف الطالب»", async () => {
  mockPerms = ["students.view", "students.edit", "students.viewAll", "students.delete"];
  await mount();
  expect(labels()).not.toContain("تعديل");
  expect(labels()).not.toContain("ملف الطالب");
  expect(labels()).not.toContain("حذف");
});

test("clicking anywhere on the row opens the student's page", async () => {
  mockPerms = ["students.view"];
  await mount();
  const row = [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("800000001"));
  await act(async () => row.querySelector("td").click());
  expect(container.querySelector('[data-testid="opened"]')).not.toBeNull();
});

test("the name stays a link to the student's page", async () => {
  mockPerms = ["students.view"];
  await mount();
  expect([...container.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/students/800000001")).toBe(true);
});

test("a waiting request has no «قبول» or «رفض» in the list; its row opens the page", async () => {
  mockPerms = ["students.view", "students.edit", "students.viewAll", "students.delete"];
  getAll.mockResolvedValue({ ok: true, students: [{ ...STUDENT, status: "ينتظر" }] });
  await mount();
  // The lists are tabs on the page, outside «فلتر».
  const waiting = [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes("الطلبات"));
  await act(async () => waiting.click());
  expect(labels()).not.toContain("قبول");
  expect(labels()).not.toContain("رفض");
  const row = [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("800000001"));
  await act(async () => row.querySelector("td").click());
  expect(container.querySelector('[data-testid="opened"]')).not.toBeNull();
});

test("each row shows the person's photo", async () => {
  mockPerms = ["students.view"];
  getAll.mockResolvedValue({ ok: true, students: [{ ...STUDENT, photo: "https://example.test/s1.jpg" }] });
  await mount();
  const imgs = [...container.querySelectorAll('tbody img[loading="lazy"]')];
  expect(imgs.map((i) => i.getAttribute("src"))).toEqual(["https://example.test/s1.jpg"]);
  expect(container.querySelectorAll('ul img[loading="lazy"]').length).toBe(1);
});

test("management starts with responsible students, can show everyone, and without own students sees everyone", async () => {
  mockPerms = ["students.view", "students.viewAll"];
  localStorage.setItem("user_id", "guide-a");
  getAll.mockResolvedValue({ ok: true, students: [{ ...STUDENT, main_teacher: "guide-a" }, { ...STUDENT, _id: "s2", tz: "800000002", main_teacher: "guide-b" }] });
  await mount();
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(container.querySelector("h1").textContent).toContain("طلابي");
  await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "عرض طلاب الجمعية").click());
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(container.querySelector("h1").textContent).toBe("طلاب الجمعية");
});

test("age, grade, gender, school, guide and unsigned filters coexist and clear together", async () => {
  mockPerms = ["students.view", "students.viewAll"];
  getAll.mockResolvedValue({ ok: true, students: [
    { ...STUDENT, birth_date: "2014-01-01", gender: "ذكر", layer: "السادس", school: "مدرسة أ", main_teacher: "a", responsibleGuideName: "أحمد" },
    { ...STUDENT, _id: "s2", tz: "800000002", consentAt: "2026-01-01", birth_date: "2010-01-01", gender: "أنثى", layer: "العاشر", school: "مدرسة ب", main_teacher: "b", responsibleGuideName: "سارة" },
  ] });
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "فلتر").click());
  const field = (label) => [...document.querySelectorAll('[role="dialog"] label')].find((node) => node.textContent.startsWith(label)).querySelector("input,select");
  for (const [label, value] of [["العمر من", "10"], ["العمر حتى", "14"], ["الصف", "السادس"], ["الجنس", "ذكر"], ["المدرسة", "مدرسة أ"], ["المرشد المسؤول", "a"]]) {
    await act(async () => Simulate.change(field(label), { target: { value } }));
  }
  await act(async () => document.querySelector('[role="dialog"] input[type="checkbox"]').click());
  expect(container.querySelector("tbody").textContent).toContain("800000001");
  expect(container.querySelector("tbody").textContent).not.toContain("800000002");
  await act(async () => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "مسح الفلتر").click());
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
});

// Excel export of the list as filtered on screen (owner, 2026-11-10).
test("«تصدير Excel» downloads the students on screen", async () => {
  getAll.mockResolvedValue({ ok: true, students: [{ ...STUDENT, layer: "ط3", school: "مدرسة", responsibleGuideName: "مرشد" }] });
  await mount();
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "تصدير Excel");
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(downloadWorkbook).toHaveBeenCalledTimes(1);
  const [fileName, sheets] = downloadWorkbook.mock.calls[0];
  expect(fileName).toMatch(/^الطلاب \d{4}-\d{2}-\d{2}$/);
  expect(sheets[0].rows).toEqual([["طالب تجربة", "800000001", "ط3", "مدرسة", "", "مرشد"]]);
});
